import { useEffect, useRef, useState } from 'react'
import { GreenApiClient } from '../api/greenApiClient'
import type { NotificationBody } from '../api/types'
import {
  advanceStatus,
  describeDeliveryProblem,
  describePollingError,
  readDisplayName,
  readMessageText,
  toIncomingStatus,
} from '../lib/notifications'
import type { ChatMessage, MessagesByChat } from '../types'

// Обновление состояния через функцию, а не через готовый объект.
// Внутри одной отправки состояние меняется несколько раз подряд,
// и если брать его из props, второе изменение увидит устаревшие данные
export type MessagesUpdater = (previous: MessagesByChat) => MessagesByChat

interface UseChatPollingOptions {
  client: GreenApiClient | null
  // ChatId открытого чата. Для него входящие сразу считаются прочитанными
  activeChatId: string | null
  onMessagesChange: (update: MessagesUpdater) => void
  // Вызывается на каждое входящее сообщение, чтобы App обновил чаты:
  // время последнего сообщения, имя собеседника и счетчик непрочитанных
  onIncoming: (chatId: string, displayName: string | null, timestamp: number) => void
  // Вызывается на stateInstanceChanged с новым состоянием,
  // чтобы приложение могло вернуть экран подключения
  onStateChanged: (state: string) => void
}

// Пауза перед новым запросом. Без неё при пустой очереди
// мы будем долбить API плотнее, чем он готов отвечать
const IDLE_DELAY_MS = 300

// После ошибки ждем дольше, иначе при упавшем API получим плотный поток запросов
const RETRY_DELAY_MS = 3000

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    function onAbort() {
      clearTimeout(timer)
      resolve()
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

// Актуальные значения из props читаем через ref, чтобы цикл поллинга
// не перезапускался на каждом изменении state
function useLatest<T>(value: T) {
  const ref = useRef(value)

  useEffect(() => {
    ref.current = value
  }, [value])

  return ref
}

export interface PollingState {
  // Текст последней ошибки соединения, null когда связь есть
  error: string | null
}

export function useChatPolling({
  client,
  activeChatId,
  onMessagesChange,
  onIncoming,
  onStateChanged,
}: UseChatPollingOptions): PollingState {
  const [error, setError] = useState<string | null>(null)

  const activeChatIdRef = useLatest(activeChatId)
  const handlersRef = useLatest({ onMessagesChange, onIncoming, onStateChanged })

  useEffect(() => {
    if (client === null) return

    const controller = new AbortController()
    const { signal } = controller

    // Уведомления, которые уже обработали, чтобы не добавить одно и то же дважды.
    // Хранится вне state: это служебные данные цикла, а не данные интерфейса
    const seen = new Set<string>()

    function markSeen(key: string): boolean {
      if (seen.has(key)) return false

      seen.add(key)
      return true
    }

    function applyIncoming(body: NotificationBody) {
      if (body.typeWebhook !== 'incomingMessageReceived') return

      const text = readMessageText(body)

      // Удаление приходит тем же вебхуком, но с другим typeMessage.
      // Текста у него нет, и ниже он разбирается отдельно
      if (text === null) return

      const chatId = body.senderData?.chatId ?? null

      // Уведомление без chatId приложению некуда положить
      if (chatId === null) return
      if (!markSeen(`incoming:${body.idMessage}`)) return

      const message: ChatMessage = {
        id: body.idMessage,
        // stanzaId совпадает с idMessage, по нему приходит удаление
        stanzaId: body.idMessage,
        chatId,
        direction: 'incoming',
        text,
        timestamp: toMilliseconds(body.timestamp),
        // Входящее считаем прочитанным сразу: мы его показали, ждать отметки незачем
        status: 'read',
        failureReason: null,
        deleted: false,
      }

      handlersRef.current.onMessagesChange((previous) => {
        const list = previous[chatId] ?? []

        // Сообщение могло уже прийти в истории: уведомление иногда повторяется
        if (list.some((item) => item.id === body.idMessage)) return previous

        return { ...previous, [chatId]: [...list, message] }
      })

      handlersRef.current.onIncoming(chatId, readDisplayName(body), message.timestamp)
    }

    function applyDeletion(body: NotificationBody) {
      if (body.typeWebhook !== 'incomingMessageReceived') return
      if (body.messageData.typeMessage !== 'deletedMessage') return

      const stanzaId = body.messageData.deletedMessageData.stanzaId
      const chatId = body.senderData?.chatId ?? null

      if (chatId === null) return

      handlersRef.current.onMessagesChange((previous) => {
        const list = previous[chatId]

        if (list === undefined) return previous

        const index = list.findIndex((item) => item.stanzaId === stanzaId)

        // Удалено может быть сообщение, которого у нас нет
        if (index === -1) return previous

        const nextList = [...list]

        // Помечаем удаленным, а не убираем: у собеседника сообщение
        // тоже исчезло, терять позицию в переписке было бы странно
        nextList[index] = {
          ...nextList[index],
          text: 'Сообщение удалено',
          failureReason: null,
          deleted: true,
        }

        return { ...previous, [chatId]: nextList }
      })
    }

    function applyOutgoingStatus(body: NotificationBody) {
      if (body.typeWebhook !== 'outgoingMessageStatus') return
      if (!markSeen(`status:${body.chatId}:${body.idMessage}:${body.status}`)) return

      const incoming = toIncomingStatus(body.status)

      handlersRef.current.onMessagesChange((previous) => {
        const list = previous[body.chatId]

        if (list === undefined) return previous

        const index = list.findIndex((item) => item.id === body.idMessage)

        // Статус может прийти для сообщения, которого у нас нет:
        // например, отправленного с телефона до того, как мы подключились
        if (index === -1) return previous

        const nextList = [...list]
        const target = nextList[index]

        nextList[index] = {
          ...target,
          // Уведомления иногда приходят не по порядку, галочки не должны откатываться
          status: advanceStatus(target.status, incoming),
          failureReason:
            incoming === 'failed'
              ? (body.description ?? describeDeliveryProblem(body.status))
              : null,
        }

        return { ...previous, [body.chatId]: nextList }
      })
    }

    function applyBody(body: NotificationBody) {
      if (body.typeWebhook === 'stateInstanceChanged') {
        // Повторы одного состояства игнорируем, чтобы не дёргать интерфейс
        if (markSeen(`state:${body.stateInstance}`)) {
          handlersRef.current.onStateChanged(body.stateInstance)
        }

        return
      }

      applyIncoming(body)
      applyDeletion(body)
      applyOutgoingStatus(body)
    }

    async function loop() {
      setError(null)

      // Клиент может стать null, пока шла проверка условия выше.
      // Дальше работаем с локальной копией, TypeScript не будет проверять каждый await
      const api = client

      if (api === null) return

      while (!signal.aborted) {
        try {
          const envelope = await api.receiveNotification(25, signal)

          if (signal.aborted) return

          if (envelope?.body != null) applyBody(envelope.body)

          if (envelope?.receiptId !== undefined) {
            // Подтверждаем после обработки: пока уведомление в очереди,
            // повторно его не пришлют, и мы переживем перезагрузку страницы
            await api.deleteNotification(envelope.receiptId, signal)
          }

          if (!signal.aborted) setError(null)

          await delay(IDLE_DELAY_MS, signal)
        } catch (cause) {
          if (signal.aborted) return

          // Ошибку держим на экране, но не пугаем на каждую неудачу
          setError(describePollingError(cause))

          await delay(RETRY_DELAY_MS, signal)
        }
      }
    }

    void loop()

    return () => {
      controller.abort()
    }
  }, [client, activeChatIdRef, handlersRef])

  return { error }
}

// В уведомлениях timestamp в секундах UNIX, в интерфейсе нужны миллисекунды
function toMilliseconds(timestamp: number | undefined): number {
  if (timestamp === undefined) return Date.now()

  // Значения меньше 1e11 всегда в секундах, так помечаем приведение
  return timestamp < 1e11 ? timestamp * 1000 : timestamp
}
