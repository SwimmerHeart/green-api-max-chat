import './index.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChatListScreen } from './components/ChatListScreen'
import { ChatScreen } from './components/ChatScreen'
import { ConnectScreen } from './components/ConnectScreen'
import { NewChatScreen } from './components/NewChatScreen'
import { GreenApiClient } from './api/greenApiClient'
import type { Credentials } from './api/types'
import { useAccountStatus } from './hooks/useAccountStatus'
import type { MessagesUpdater } from './hooks/useChatPolling'
import { useChatPolling } from './hooks/useChatPolling'
import { getPermissionState, requestPermission, showNotification } from './lib/browserNotifications'
import type { NotificationPermissionState } from './lib/browserNotifications'
import {
  clearCredentials,
  loadChats,
  loadCredentials,
  loadLastInstanceId,
  loadMessages,
  saveChats,
  saveCredentials,
  saveLastInstanceId,
  saveMessages,
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
  const [notice, setNotice] = useState<string | null>(null)
  const [isSessionBroken, setIsSessionBroken] = useState(false)

  const [isForeignHistory, setIsForeignHistory] = useState(() => {
    if (idInstance === null) return false
    const lastInstanceId = loadLastInstanceId()
    return lastInstanceId !== null && lastInstanceId !== idInstance
  })

  const client = useMemo(
    () => (credentials === null ? null : new GreenApiClient(credentials)),
    [credentials],
  )

  // Разрешение на уведомления может измениться в настройках браузера,
  // поэтому состояние держим в приложении и синхронизируем при возврате на вкладку
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>(getPermissionState)

  useEffect(() => {
    function syncPermission() {
      setNotificationPermission(getPermissionState())
    }

    window.addEventListener('focus', syncPermission)

    return () => {
      window.removeEventListener('focus', syncPermission)
    }
  }, [])

  const { error: pollingError } = useChatPolling({
    client,
    activeChatId: activeChat?.chatId ?? null,
    onMessagesChange: handleMessagesChange,
    onIncoming: handleIncoming,
    onStateChanged: handleStateChanged,
  })

  const [storedInstanceId, setStoredInstanceId] = useState(idInstance)

  // Список чатов нужен обработчику уведомления: клик по системному уведомлению
  // приходит вне React, и там нельзя обратиться к состоянию напрямую
  const chatsRef = useRef<Chat[]>(chats)

  useEffect(() => {
    chatsRef.current = chats
  }, [chats])

  const openChatByIdRef = useRef<(chatId: string) => void>(() => {})

  if (storedInstanceId !== idInstance) {
    setStoredInstanceId(idInstance)

    if (idInstance !== null) {
      setChats(loadChats(idInstance))
      setMessages(loadMessages(idInstance))
    }
  }

  function handleMessagesChange(update: MessagesUpdater) {
    setMessages((previous) => {
      const next = update(previous)

      if (idInstance !== null) saveMessages(idInstance, next)

      return next
    })
  }

  function handleIncoming(
    chatId: string,
    displayName: string | null,
    timestamp: number,
    text: string,
  ) {
    // Открытый чат сразу считаем прочитанным: человек его видит
    const isActive = activeChat?.chatId === chatId

    setChats((previous) => {
      const next = previous.map((chat) => {
        if (chat.chatId !== chatId) return chat

        return {
          ...chat,
          displayName: displayName ?? chat.displayName,
          unread: isActive ? 0 : chat.unread + 1,
          updatedAt: timestamp,
        }
      })

      if (idInstance !== null) saveChats(idInstance, next)

      return next
    })

    // Чат мог прийти от собеседника, которого мы сами не начинали.
    // Без записи в список сообщение сохранится, но не будет видно в списке
    setChats((previous) =>
      previous.some((chat) => chat.chatId === chatId)
        ? previous
        : [...previous, createChatFromNotification(chatId, displayName, timestamp)],
    )

    notifyAboutIncoming(chatId, displayName, text, isActive)
  }

  function notifyAboutIncoming(
    chatId: string,
    displayName: string | null,
    text: string,
    isActive: boolean,
  ) {
    if (isActive) return
    if (!document.hidden) return

    const known = chatsRef.current.find((chat) => chat.chatId === chatId)

    showNotification({
      // Без имени собеседника показываем номер, он узнаваемее, чем @c.us
      title: displayName || known?.phone || chatId,
      body: text,
      tag: chatId,
      onOpen: () => openChatByIdRef.current(chatId),
    })
  }

  function handleStateChanged(state: string) {
    if (state === 'starting' || state === 'sleepMode') return

    if (state === 'authorized') {
      setIsSessionBroken(false)
      setNotice(null)
      return
    }

    // Разлогин, блокировка или подвес: нужен новый QR-код
    // Доступы оставляем, чтобы пользователь нажал Подключить еще раз
    setIsSessionBroken(true)
    setActiveChat(null)
    setScreen('list')
  }

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
    setNotice(null)
    setIsSessionBroken(false)

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
      // Возвращаемся в список, иначе после Назад снова откроется форма нового чата
      setScreen('list')
    },
    [credentials],
  )

  const handleOpenChat = useCallback(
    (chat: Chat) => {
      setActiveChat(chat)

      // Открытый чат сбрасывает счетчик, иначе бейдж останется до перезагрузки
      setChats((previous) => {
        if (chat.unread === 0) return previous

        const next = previous.map((item) =>
          item.chatId === chat.chatId ? { ...item, unread: 0 } : item,
        )

        if (credentials !== null) saveChats(credentials.idInstance, next)

        return next
      })
    },
    [credentials],
  )

  // Обработчик клика по уведомлению читает список чатов, а он меняется каждый раз,
  // поэтому держим ссылку на актуальную функцию, а не создаем новую на каждый рендер
  useEffect(() => {
    openChatByIdRef.current = (chatId: string) => {
      const found = chatsRef.current.find((chat) => chat.chatId === chatId)

      if (found !== undefined) handleOpenChat(found)
    }
  }, [handleOpenChat])

  // Выход из аккаунта: токен стираем, историю оставляем.
  // Она привязана к инстансу, поэтому вернется, когда этот же аккаунт подключат снова
  const handleLogout = useCallback(() => {
    clearCredentials()

    setCredentials(null)
    setChats([])
    setMessages({})
    setActiveChat(null)
    setScreen('list')
    setNotice(null)
    setIsSessionBroken(false)
  }, [])

  const handleRequestNotifications = useCallback(async () => {
    setNotificationPermission(await requestPermission())
  }, [])

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
  if (status === 'unauthorized' || isSessionBroken)
    return (
      <ConnectScreen
        onConnected={handleConnected}
        initialCredentials={credentials}
        notice={
          notice ??
          'Инстанс не авторизован в MAX. Отсканируй QR-код в личном кабинете GREEN-API и нажмите Подключить еще раз.'
        }
      />
    )

  if (activeChat !== null)
    return (
      <ChatScreen
        chat={activeChat}
        client={client}
        messages={messages[activeChat.chatId] ?? []}
        onMessagesChange={handleMessagesChange}
        onBack={() => setActiveChat(null)}
        connectionError={pollingError}
      />
    )

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
      connectionError={pollingError}
      notificationPermission={notificationPermission}
      onSelectChat={handleOpenChat}
      onCreateChat={() => setScreen('newChat')}
      onLogout={handleLogout}
      onRequestNotifications={handleRequestNotifications}
    />
  )
}

// Чат от собеседника, которого мы не начинали сами: входящее может прийти
// в любой момент, и без записи в список переписка была бы не видна
function createChatFromNotification(
  chatId: string,
  displayName: string | null,
  timestamp: number,
): Chat {
  return {
    chatId,
    phone: '',
    title: displayName ?? 'Новый чат',
    displayName,
    unread: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export default App
