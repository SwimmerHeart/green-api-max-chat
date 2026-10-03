// Направление сообщения относительно пользователя
export type MessageDirection = 'incoming' | 'outgoing'

// Статус сообщения в интерфейсе
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface ChatMessage {
  id: string
  chatId: string
  direction: MessageDirection
  text: string
  timestamp: number
  status: MessageStatus
}

export interface Chat {
  chatId: string
  phone: string
  title: string
  createdAt: number
  updatedAt: number
}

export type MessagesByChat = Record<string, ChatMessage[]>
