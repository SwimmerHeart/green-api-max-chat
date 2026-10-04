import { useState } from 'react'
import type { NotificationPermissionState } from '../lib/browserNotifications'
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
  notificationPermission: NotificationPermissionState
  onSelectChat: (chat: Chat) => void
  onCreateChat: () => void
  onLogout: () => void
  onRequestNotifications: () => void
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
  notificationPermission,
  onSelectChat,
  onCreateChat,
  onLogout,
  onRequestNotifications,
}: ChatListScreenProps) {
  const [isLogoutArmed, setIsLogoutArmed] = useState(false)

  function handleLogoutClick() {
    if (isLogoutArmed) {
      setIsLogoutArmed(false)
      onLogout()
      return
    }

    setIsLogoutArmed(true)
  }

  // Сортировка по последней активности, а не по дате создания
  const sortedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <main className="mx-auto my-4 flex max-h-[calc(100svh-2rem)] w-full max-w-md flex-col border-x border-black/5 bg-max-canvas sm:my-6 sm:max-h-[calc(100svh-3rem)] sm:shadow-sm sm:ring-1 sm:ring-black/5">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-max-text">Чаты</h1>
          {accountPhone !== null && (
            <p className="truncate text-xs text-max-muted">{formatPhone(accountPhone)}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleLogoutClick}
            title="Выйти из аккаунта"
            className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors cursor-pointer ${
              isLogoutArmed
                ? 'bg-max-danger text-white'
                : 'text-max-muted hover:bg-max-danger/10 hover:text-max-danger'
            }`}
          >
            {isLogoutArmed ? 'Точно выйти?' : 'Выйти'}
          </button>

          <button
            type="button"
            onClick={onCreateChat}
            className="rounded-lg bg-max-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-max-accent-dark cursor-pointer"
          >
            Новый чат
          </button>
        </div>
      </header>

      {notificationPermission !== 'unsupported' && (
        <NotificationRow permission={notificationPermission} onRequest={onRequestNotifications} />
      )}

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
        <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto p-2">
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

interface NotificationRowProps {
  permission: NotificationPermissionState
  onRequest: () => void
}

// Строка с системными уведомлениями. Показывается только когда браузер их умеет,
// а включить их можно одним нажатием из этого обработчика
function NotificationRow({ permission, onRequest }: NotificationRowProps) {
  if (permission === 'granted') {
    return (
      <p className="mx-4 mb-1 rounded-xl bg-max-surface px-4 py-2 text-xs text-max-muted">
        Уведомления включены: о новых сообщениях в закрытых чатах сообщим системно.
      </p>
    )
  }

  if (permission === 'denied') {
    return (
      <p className="mx-4 mb-1 rounded-xl bg-max-surface px-4 py-2 text-xs text-max-muted">
        Браузер запретил уведомления. Разрешить их можно в настройках сайта.
      </p>
    )
  }

  return (
    <button
      type="button"
      onClick={onRequest}
      className="mx-4 mb-1 rounded-xl bg-max-surface px-4 py-2 text-left text-xs text-max-accent transition-colors hover:bg-max-accent/10 cursor-pointer"
    >
      Включить уведомления о новых сообщениях
    </button>
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
