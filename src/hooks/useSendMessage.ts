import { useCallback, useState } from 'react'
import { GreenApiClient, GreenApiError } from '../api/greenApiClient'
import type { MessagesUpdater } from './useChatPolling'
import type { ChatMessage } from '../types'

interface UseSendMessageOptions {
  client: GreenApiClient | null
  chatId: string
  onMessagesChange: (update: MessagesUpdater) => void
}

export interface SendOutcome {
  ok: boolean
}

// Локальный идентификатор оптимистичного сообщения.
// Если отправка сорвется, он останется в истории и по нему можно будет повторить
let temporaryCounter = 0

function nextTemporaryId(): string {
  temporaryCounter += 1
  return `local-${Date.now()}-${temporaryCounter}`
}

export function useSendMessage({ client, chatId, onMessagesChange }: UseSendMessageOptions) {
  const [isSending, setIsSending] = useState(false)

  // Единственное место, где сообщение меняется внутри хука.
  // Все правки идут через нее, поэтому на любое сообщение достаточно сослаться по id
  const patchMessage = useCallback(
    (id: string, changes: Partial<ChatMessage>) => {
      onMessagesChange((previous) => {
        const list = previous[chatId] ?? []
        const index = list.findIndex((item) => item.id === id)

        if (index === -1) return previous

        const nextList = [...list]
        nextList[index] = { ...nextList[index], ...changes }

        return { ...previous, [chatId]: nextList }
      })
    },
    [chatId, onMessagesChange],
  )

  // Отправляет текст и обновляет уже существующую запись в истории.
  // Общая часть для нового сообщения и для повтора
  const deliver = useCallback(
    async (localId: string, text: string): Promise<SendOutcome> => {
      // Клиент может исчезнуть между нажатием и отправкой, если доступы сбросили
      const api = client

      if (api === null) return { ok: false }

      setIsSending(true)

      try {
        const result = await api.sendMessage(chatId, text)

        // Подменяем временный id настоящим: по нему приходят уведомления о статусах,
        // и пока в истории лежит local-..., галочки не найдут сообщение
        patchMessage(localId, { id: result.idMessage, status: 'sent' })

        return { ok: true }
      } catch (cause) {
        const message =
          cause instanceof GreenApiError
            ? cause.message
            : 'Сообщение не отправилось, проверь соединение'

        // Текст остается в истории со статусом failed, чтобы его можно было повторить
        patchMessage(localId, { status: 'failed', failureReason: message })

        return { ok: false }
      } finally {
        setIsSending(false)
      }
    },
    [chatId, client, patchMessage],
  )

  const send = useCallback(
    async (text: string): Promise<SendOutcome> => {
      const trimmed = text.trim()

      if (client === null || trimmed.length === 0 || isSending) {
        return { ok: false }
      }

      const temporaryId = nextTemporaryId()

      // Оптимистичное сообщение: показываем сразу, не дожидаясь ответа API,
      // иначе отправка выглядит как подвисание на секунду
      const optimistic: ChatMessage = {
        id: temporaryId,
        stanzaId: null,
        chatId,
        direction: 'outgoing',
        text: trimmed,
        timestamp: Date.now(),
        status: 'pending',
        failureReason: null,
        deleted: false,
      }

      onMessagesChange((previous) => ({
        ...previous,
        [chatId]: [...(previous[chatId] ?? []), optimistic],
      }))

      return deliver(temporaryId, trimmed)
    },
    [chatId, client, deliver, isSending, onMessagesChange],
  )

  // Повтор по кнопке у неудачного сообщения.
  // Переиспользуем ту же запись, а не добавляем вторую копию текста
  const retry = useCallback(
    async (message: ChatMessage) => {
      if (message.status !== 'failed' || isSending) return { ok: false }

      patchMessage(message.id, { status: 'pending', failureReason: null })

      return deliver(message.id, message.text)
    },
    [deliver, isSending, patchMessage],
  )

  // Убрать сообщение, которое зависло в pending, если пользователь передумал
  const discard = useCallback(
    (message: ChatMessage) => {
      if (message.status !== 'pending') return

      onMessagesChange((previous) => ({
        ...previous,
        [chatId]: (previous[chatId] ?? []).filter((item) => item.id !== message.id),
      }))
    },
    [chatId, onMessagesChange],
  )

  return { send, retry, discard, isSending }
}
