import type { Chat } from '../types'

interface ChatScreenProps {
  chat: Chat
  onBack: () => void
}

export function ChatScreen({ chat, onBack }: ChatScreenProps) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-max-canvas">
      <header className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-2 py-1 text-sm text-max-accent transition-colors hover:bg-max-accent/10 cursor-pointer"
        >
          Назад
        </button>
        <h1 className="truncate text-lg font-semibold text-max-text">{chat.title}</h1>
      </header>

      <p className="m-4 rounded-xl bg-max-surface px-4 py-3 text-sm text-max-muted">
        Сообщений пока нет.
      </p>
    </main>
  )
}
