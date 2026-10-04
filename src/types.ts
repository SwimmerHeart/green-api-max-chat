export interface ChatMessage {
  // У входящих равен idMessage из уведомления, у исходящих сначала временный,
  // потом подменяется настоящим, который вернул sendMessage
  id: string
  stanzaId: string | null
  chatId: string
  direction: 'incoming' | 'outgoing'
  text: string
  timestamp: number
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  failureReason: string | null
  deleted: boolean
}

export interface Chat {
  // Сохраняем ровно то, что вернул API, и не приводим к единому виду:
  // идентификатор выдал CheckAccount, и он же нужен в sendMessage
  chatId: string
  // Номер в том виде, в каком его ввел пользователь при создании чата.
  // Может быть пустым, если идентификатор пришел не из проверки номера
  phone: string
  title: string
  displayName: string | null
  unread: number
  createdAt: number
  updatedAt: number
}

export type MessagesByChat = Record<string, ChatMessage[]>
