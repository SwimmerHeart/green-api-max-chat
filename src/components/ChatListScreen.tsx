import { formatPhone } from '../lib/phone'
import type { Chat, MessagesByChat } from '../types'

interface ChatListScreenProps {
  chats: Chat[]
  messages: MessagesByChat
  // Свой номер, чтобы видеть, под каким аккаунтом открыт чат
  accountPhone: string | null
  isForeignHistory: boolean
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
          {sortedChats.map((chat) => {
            const lastMessage = messages[chat.chatId]?.at(-1)

            return (
              <li key={chat.chatId}>
                <button
                  type="button"
                  onClick={() => onSelectChat(chat)}
                  className="flex w-full flex-col gap-1 rounded-xl bg-max-surface px-4 py-3 text-left transition-colors hover:bg-black/5 cursor-pointer"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium text-max-text">
                      {chat.displayName ?? chat.title}
                    </span>
                    <span className="shrink-0 text-xs text-max-muted">
                      {formatWhen(chat.updatedAt)}
                    </span>
                  </span>
                  <span className="truncate text-sm text-max-muted">
                    {lastMessage === undefined ? 'Сообщений пока нет' : lastMessage.text}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}

// Сегодняшние чаты показываем временем, остальные датой
function formatWhen(timestamp: number): string {
  const date = new Date(timestamp)
  const isToday = date.toDateString() === new Date().toDateString()

  return isToday ? timeFormatter.format(date) : dateFormatter.format(date)
}
