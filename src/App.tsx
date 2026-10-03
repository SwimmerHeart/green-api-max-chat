import './index.css'
import { useCallback, useMemo, useState } from 'react'
import { ChatListScreen } from './components/ChatListScreen'
import { ChatScreen } from './components/ChatScreen'
import { ConnectScreen } from './components/ConnectScreen'
import { NewChatScreen } from './components/NewChatScreen'
import { GreenApiClient } from './api/greenApiClient'
import type { Credentials } from './api/types'
import { useAccountStatus } from './hooks/useAccountStatus'
import {
  loadChats,
  loadCredentials,
  loadLastInstanceId,
  loadMessages,
  saveChats,
  saveCredentials,
  saveLastInstanceId,
} from './lib/storage'
import type { Chat, MessagesByChat } from './types'

type Screen = 'list' | 'newChat'

function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(() => loadCredentials())
  const { status, accountPhone } = useAccountStatus(credentials)

  const idInstance = credentials?.idInstance ?? null

  const [chats, setChats] = useState<Chat[]>(() =>
    idInstance === null ? [] : loadChats(idInstance),
  )
  const [messages, setMessages] = useState<MessagesByChat>(() =>
    idInstance === null ? {} : loadMessages(idInstance),
  )
  const [screen, setScreen] = useState<Screen>('list')
  const [activeChat, setActiveChat] = useState<Chat | null>(null)

  const [isForeignHistory, setIsForeignHistory] = useState(() => {
    if (idInstance === null) return false
    const lastInstanceId = loadLastInstanceId()
    return lastInstanceId !== null && lastInstanceId !== idInstance
  })

  const client = useMemo(
    () => (credentials === null ? null : new GreenApiClient(credentials)),
    [credentials],
  )

  const handleConnected = useCallback((next: Credentials) => {
    // Сравниваем с прошлым инстансом до перезаписи, иначе предупреждение всегда ложно
    const previousInstanceId = loadLastInstanceId()
    setIsForeignHistory(previousInstanceId !== null && previousInstanceId !== next.idInstance)

    saveCredentials(next)
    saveLastInstanceId(next.idInstance)

    // Перечитываем историю - после смены аккаунта она другая
    setChats(loadChats(next.idInstance))
    setMessages(loadMessages(next.idInstance))
    setActiveChat(null)
    setScreen('list')

    setCredentials(next)
  }, [])

  const handleChatCreated = useCallback(
    (chat: Chat) => {
      if (credentials === null) return

      setChats((previous) => {
        const next = [chat, ...previous.filter((item) => item.chatId !== chat.chatId)]
        saveChats(credentials.idInstance, next)
        return next
      })

      setActiveChat(chat)
    },
    [credentials],
  )

  const handleBackFromChat = useCallback(() => setActiveChat(null), [])

  if (credentials === null || client === null)
    return <ConnectScreen onConnected={handleConnected} />

  // Сессия из хранилища еще не проверена
  if (status === 'checking')
    return (
      <main className="flex min-h-svh items-center justify-center bg-max-canvas">
        <p className="text-sm text-max-muted">Проверяем доступы...</p>
      </main>
    )

  // Доступы сохраняем, чтобы пользователь просто нажал Подключить еще раз после QR
  if (status === 'unauthorized')
    return (
      <ConnectScreen
        onConnected={handleConnected}
        initialCredentials={credentials}
        notice="Инстанс не авторизован в MAX. Отсканируй QR-код в личном кабинете GREEN-API и нажмите Подключить еще раз."
      />
    )

  if (activeChat !== null) return <ChatScreen chat={activeChat} onBack={handleBackFromChat} />

  if (screen === 'newChat') {
    return (
      <NewChatScreen
        client={client}
        onCreated={handleChatCreated}
        onCancel={() => setScreen('list')}
      />
    )
  }

  return (
    <ChatListScreen
      chats={chats}
      messages={messages}
      accountPhone={accountPhone}
      isForeignHistory={isForeignHistory}
      onSelectChat={setActiveChat}
      onCreateChat={() => setScreen('newChat')}
    />
  )
}

export default App
