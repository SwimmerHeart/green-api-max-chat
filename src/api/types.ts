export interface Credentials {
  apiUrl: string
  idInstance: string
  apiTokenInstance: string
}

// Ответ метода getAccountSettings
export interface AccountSettings {
  stateInstance: string
  phone?: string
  avatar?: string
  chatId?: string
  name?: string
}

// Ответ метода checkAccount
// Вызывается перед созданием чата, чтобы убедиться, что номер зарегистрирован в MAX
export interface CheckAccountResult {
  // Зарегистрирован ли номер в MAX
  exist: boolean
  // Идентификатор чата, по нему хранится история переписки
  chatId: string
  fromCache?: boolean
}

// Ответ метода sendMessage.
export interface SendMessageResult {
  idMessage: string
}

// Статус доставки исходящего сообщения
export type DeliveryStatus =
  'sent' | 'delivered' | 'read' | 'failed' | 'noAccount' | 'notInGroup' | 'deleted'

// Общая часть уведомлений.
interface BaseWebhook {
  timestamp?: number
}

// Входящее текстовое сообщение от собеседника
export interface IncomingMessageWebhook extends BaseWebhook {
  typeWebhook: 'incomingMessageReceived'
  chatId: string
  chatType?: string
  // Данные отправителя внутри этого чата
  senderData: {
    chatId?: string
    phone?: string
    pushName?: string
    avatar?: string
  }
  // typeMessage обязательно проверяется перед доступом к textMessageData
  messageData: {
    typeMessage: 'textMessage'
    textMessageData: {
      // Сам текст, лежит на третьем уровне вложенности
      textMessage: string
    }
  }
}

// Уведомление о смене статуса уже отправленного сообщения.
export interface OutgoingStatusWebhook extends BaseWebhook {
  typeWebhook: 'outgoingMessageStatus'
  // Идентификатор, по которому ищем наше сообщение в истории.
  // У входящих сообщений идентификатора нет, он генерируется на клиенте
  idMessage: string
  chatId: string
  status: DeliveryStatus
  description?: string
}

// Уведомление о смене состояния инстанса, например выход из аккаунта.
export interface StateInstanceWebhook {
  typeWebhook: 'stateInstanceChanged'
  stateInstance: string
}

// Уведомление об удалении сообщения
export interface MessageDeletedWebhook extends BaseWebhook {
  typeWebhook: 'messageDeleted'
  idMessage: string
  chatId: string
  deleteForAll?: boolean
}

// Все поддерживаемые тела уведомлений
export type NotificationBody =
  IncomingMessageWebhook | OutgoingStatusWebhook | StateInstanceWebhook | MessageDeletedWebhook

// Ответ метода receiveNotification.
export interface NotificationEnvelope {
  // Идентификатор уведомления, нужен для подтверждения через deleteNotification.
  receiptId?: number
  body: NotificationBody
}
