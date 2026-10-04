import { useMemo } from 'react'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import type { GreenApiClient } from '../api/greenApiClient'
import type { MessagesUpdater } from '../hooks/useChatPolling'
import { useSendMessage } from '../hooks/useSendMessage'
import { formatPhone } from '../lib/phone'
import type { Chat, ChatMessage } from '../types'

interface ChatScreenProps {
  chat: Chat
  client: GreenApiClient
  messages: ChatMessage[]
  onMessagesChange: (update: MessagesUpdater) => void
  onBack: () => void
  connectionError: string | null
}

export function ChatScreen({
  chat,
  client,
  messages,
  onMessagesChange,
  onBack,
  connectionError,
}: ChatScreenProps) {
  const { send, retry, discard, isSending } = useSendMessage({
    client,
    chatId: chat.chatId,
    onMessagesChange,
  })

  const subtitle = useMemo(() => {
    // Пустое имя от API не должно оставлять заголовок без текста
    const name = chat.displayName || formatPhone(chat.phone)

    return name.length > 0 ? name : 'Собеседник'
  }, [chat.displayName, chat.phone])

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col border-x border-black/5 bg-max-canvas sm:shadow-sm sm:ring-1 sm:ring-black/5">
      <header className="flex items-center gap-2 border-b border-black/5 bg-max-surface px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-2 py-1 text-sm text-max-accent transition-colors hover:bg-max-accent/10 cursor-pointer"
        >
          Назад
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-max-text">{subtitle}</h1>
          {connectionError !== null && (
            <p className="truncate text-[11px] text-max-danger">{connectionError}</p>
          )}
        </div>
      </header>

      <MessageList
        key={chat.chatId}
        messages={messages}
        emptyHint={chat.phone.length > 0 ? chat.phone : chat.chatId}
        onRetry={(message) => void retry(message)}
        onDiscard={discard}
      />

      <Composer onSend={send} isSending={isSending} />
    </main>
  )
}
