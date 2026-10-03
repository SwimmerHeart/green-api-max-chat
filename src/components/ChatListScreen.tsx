import { formatPhone } from '../lib/phone'
import type { Chat, MessagesByChat } from '../types'

interface ChatListScreenProps {
  chats: Chat[]
  messages: MessagesByChat
  // Свой номер, чтобы видеть, под каким аккаунтом открыт чат
  accountPhone: string | null
  isForeignHistory: boolean
  // Текст ошибки поллинга, если связь с GREEN-API пропала
  connectionError: string | null
  onSelectChat: (chat: Chat) => void
  onCreateChat: () => void
}

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
})

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
})

export function ChatListScreen({
  chats,
  messages,
  accountPhone,
  isForeignHistory,
  connectionError,
  onSelectChat,
  onCreateChat,
}: ChatListScreenProps) {
  // Сортировка по последней активности, а не по дате создания
  const sortedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-max-canvas">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-max-text">Чаты</h1>
          {accountPhone !== null && (
            <p className="truncate text-xs text-max-muted">{formatPhone(accountPhone)}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onCreateChat}
          className="rounded-lg bg-max-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-max-accent-dark cursor-pointer"
        >
          Новый чат
        </button>
      </header>

      {connectionError !== null && (
        <p className="mx-4 mb-1 rounded-xl bg-max-danger/10 px-4 py-2 text-xs text-max-danger">
          {connectionError}
        </p>
      )}

      {isForeignHistory ? (
        <p className="m-4 rounded-xl bg-max-surface px-4 py-3 text-sm text-max-muted">
          История прошлого аккаунта скрыта.
        </p>
      ) : sortedChats.length === 0 ? (
        <p className="m-4 rounded-xl bg-max-surface px-4 py-3 text-sm text-max-muted">
          Чатов пока нет. Создай первый по номеру телефона.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 p-2">
          {sortedChats.map((chat) => (
            <li key={chat.chatId}>
              <ChatRow
                chat={chat}
                lastMessage={messages[chat.chatId]?.at(-1)}
                onSelect={() => onSelectChat(chat)}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

interface ChatRowProps {
  chat: Chat
  lastMessage: MessagesByChat[string][number] | undefined
  onSelect: () => void
}

function ChatRow({ chat, lastMessage, onSelect }: ChatRowProps) {
  const title = chat.displayName || chat.title || chat.phone

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-xl bg-max-surface px-4 py-3 text-left transition-colors hover:bg-black/5 cursor-pointer"
    >
      <div className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate font-medium text-max-text">{title}</span>
          <span className="shrink-0 text-xs text-max-muted">{formatWhen(chat.updatedAt)}</span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-3">
          <span className="truncate text-sm text-max-muted">{previewOf(lastMessage)}</span>
          {chat.unread > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-max-accent px-1.5 text-[11px] font-medium text-white">
              {chat.unread > 99 ? '99+' : chat.unread}
            </span>
          )}
        </span>
      </div>
    </button>
  )
}

function previewOf(message: MessagesByChat[string][number] | undefined): string {
  if (message === undefined) return 'Сообщений пока нет'

  const prefix = message.direction === 'outgoing' ? 'Вы: ' : ''

  return `${prefix}${message.text}`
}

// Сегодняшние чаты показываем временем, остальные датой
function formatWhen(timestamp: number): string {
  const date = new Date(timestamp)
  const isToday = date.toDateString() === new Date().toDateString()

  return isToday ? timeFormatter.format(date) : dateFormatter.format(date)
}
