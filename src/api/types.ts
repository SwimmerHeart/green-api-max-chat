export interface Credentials {
  apiUrl: string
  idInstance: string
  apiTokenInstance: string
}

// Состояние инстанса по документации GREEN-API
export type InstanceState =
  'notAuthorized' | 'authorized' | 'blocked' | 'sleepMode' | 'starting' | 'suspended'

// Ответ метода getWaSettings
export interface WaSettings {
  stateInstance: InstanceState
  // Телефон приходит строкой, в документации пример "0123456789"
  phone?: string
  avatar?: string
  // При enableLidMode вместо номера приходит @lid
  chatId?: string
  historySyncProgress?: number
  // Только при stateInstance suspended, время в секундах UNIX
  suspendedUntil?: number
}

// Ответ метода checkWhatsapp
// Вызывается перед созданием чата, чтобы убедиться, что номер доступен для переписки
export interface CheckWhatsappResult {
  existsWhatsapp: boolean
  chatId: string
  username?: string
  fromCache?: boolean
}

// Ответ метода sendMessage
export interface SendMessageResult {
  idMessage: string
}

// Статус доставки исходящего сообщения
export type DeliveryStatus =
  'sent' | 'delivered' | 'read' | 'failed' | 'noAccount' | 'notInGroup' | 'suspended'

// Общая часть уведомлений
interface BaseWebhook {
  timestamp?: number
  instanceData?: {
    idInstance?: number
    wid?: string
    typeInstance?: string
  }
}

// Данные отправителя внутри уведомления
interface SenderData {
  chatId?: string
  sender?: string
  chatName?: string
  senderName?: string
  senderContactName?: string
}

// Данные удаленного сообщения, приходит внутри messageData
export interface DeletedMessageData {
  stanzaId: string
}

export interface TextMessageData {
  typeMessage: 'textMessage'
  textMessageData: {
    // Сам текст, лежит на третьем уровне вложенности
    textMessage: string
  }
}

export interface DeletedMessagePayload {
  typeMessage: 'deletedMessage'
  deletedMessageData: DeletedMessageData
}

// Поддерживаемые типы входящих сообщений
export type IncomingMessageContent = TextMessageData | DeletedMessagePayload

// Уведомление о входящем сообщении или удалении
export interface IncomingMessageWebhook extends BaseWebhook {
  typeWebhook: 'incomingMessageReceived'
  // Идентификатор сообщения лежит на верхнем уровне, а не внутри messageData.
  // По нему же ищем сообщение в истории, поэтому поле обязательное
  idMessage: string
  senderData?: SenderData
  messageData: IncomingMessageContent
}

// Уведомление о смене статуса уже отправленного сообщения
export interface OutgoingStatusWebhook extends BaseWebhook {
  typeWebhook: 'outgoingMessageStatus'
  chatId: string
  idMessage: string
  status: DeliveryStatus
  description?: string
  // Отправлено ли сообщение через API, а не с телефона
  sendByApi?: boolean
}

// Уведомление о смене состояния инстанса, например выход из аккаунта
export interface StateInstanceWebhook extends BaseWebhook {
  typeWebhook: 'stateInstanceChanged'
  stateInstance: InstanceState
}

// Все поддерживаемые тела уведомлений
export type NotificationBody = IncomingMessageWebhook | OutgoingStatusWebhook | StateInstanceWebhook

// Ответ метода receiveNotification
export interface NotificationEnvelope {
  // Идентификатор уведомления, нужен для подтверждения через deleteNotification
  receiptId?: number
  body: NotificationBody
}

// Тело ошибки по документации: code, message и status со значением error
export interface ApiErrorBody {
  code?: string
  message?: string
  status?: string
}
