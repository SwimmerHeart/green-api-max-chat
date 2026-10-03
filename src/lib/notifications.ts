import { GreenApiError } from '../api/greenApiClient'
import type { DeletedMessagePayload, IncomingMessageWebhook, NotificationBody } from '../api/types'
import type { ChatMessage } from '../types'

type DeletedWebhook = IncomingMessageWebhook & { messageData: DeletedMessagePayload }

export type IncomingStatus = 'sent' | 'delivered' | 'read' | 'failed'

const STATUS_RANK: Record<ChatMessage['status'], number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 3,
}

export function toIncomingStatus(status: string): IncomingStatus {
  if (status === 'read') return 'read'
  if (status === 'delivered') return 'delivered'
  if (status === 'sent') return 'sent'

  return 'failed'
}

export function advanceStatus(
  current: ChatMessage['status'],
  incoming: IncomingStatus,
): ChatMessage['status'] {
  if (current === 'failed') return 'failed'

  return STATUS_RANK[incoming] > STATUS_RANK[current] ? incoming : current
}

// Имя собеседника берем сначала из senderName, это ближе к тому, как человек себя называет
export function readDisplayName(body: NotificationBody): string | null {
  if (body.typeWebhook !== 'incomingMessageReceived') return null

  const { senderName, chatName } = body.senderData ?? {}

  if (typeof senderName === 'string' && senderName.length > 0) return senderName
  if (typeof chatName === 'string' && chatName.length > 0) return chatName

  return null
}

// Текст есть только у textMessage. У остальных типов входящих он лежит глубже,
// а удаление вообще проходит отдельным typeMessage без текста
export function readMessageText(body: NotificationBody): string | null {
  if (body.typeWebhook !== 'incomingMessageReceived') return null

  const { messageData } = body

  if (messageData.typeMessage !== 'textMessage') return null

  return messageData.textMessageData.textMessage
}

export function isDeletedNotification(body: NotificationBody): body is DeletedWebhook {
  return (
    body.typeWebhook === 'incomingMessageReceived' &&
    body.messageData.typeMessage === 'deletedMessage'
  )
}

// Удаление приходит отдельным typeMessage внутри обычного уведомления о входящем,
// идентификатор удаленного сообщения лежит в stanzaId
export function readDeletedStanzaId(body: NotificationBody): string | null {
  if (!isDeletedNotification(body)) return null

  return body.messageData.deletedMessageData.stanzaId
}

// Человеческие тексты ошибок отправки. Ключи совпадают с DeliveryStatus в api/types
export function describeDeliveryProblem(status: string): string | null {
  switch (status) {
    case 'noAccount':
      return 'У собеседника нет аккаунта в MAX'
    case 'notInGroup':
      return 'Собеседник не состоит в этом чате'
    case 'suspended':
      return 'Отправка ограничена на стороне аккаунта'
    case 'failed':
      return 'Сообщение не удалось отправить'
    default:
      return null
  }
}

// Тексты ошибок транспорта: они не про конкретное сообщение, а про соединение
export function describePollingError(error: unknown): string {
  if (error instanceof GreenApiError) return error.message

  return 'Нет связи с GREEN-API, сообщения пока не обновляются'
}
