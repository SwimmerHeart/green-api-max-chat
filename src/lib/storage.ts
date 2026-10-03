import type { Credentials } from '../api/types'
import type { Chat, MessagesByChat } from '../types'

// Префикс ключей, чтобы не пересекаться с чужими данными на том же домене
const PREFIX = 'maxchat'
const CREDENTIALS_KEY = `${PREFIX}:credentials`
const LAST_INSTANCE_KEY = `${PREFIX}:lastInstance`

export const DEFAULT_API_URL = 'https://api.green-api.com'

// Количество сообщений держим на один чат
const MAX_MESSAGES_PER_CHAT = 500

// История привязана к инстансу: в одном браузере могут работать два разных аккаунта GREEN-API
function chatsKey(idInstance: string): string {
  return `${PREFIX}:chats:${idInstance}`
}

function messagesKey(idInstance: string): string {
  return `${PREFIX}:messages:${idInstance}`
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // хранилище недоступно, работаем без сохранения состояния
  }
}

function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // хранилище недоступно
  }
}

export function loadCredentials(): Credentials | null {
  const data = readJson<Partial<Credentials> | null>(CREDENTIALS_KEY, null)
  if (!data) return null
  const { apiUrl, idInstance, apiTokenInstance } = data
  if (!apiUrl || !idInstance || !apiTokenInstance) return null
  return { apiUrl, idInstance, apiTokenInstance }
}

export function saveCredentials(credentials: Credentials): void {
  writeJson(CREDENTIALS_KEY, credentials)
}

// Выход из аккаунта - токен удаляем, историю оставляем
export function clearCredentials(): void {
  removeKey(CREDENTIALS_KEY)
}

// Последний инстанс, под которым работали в этом браузере, чтобы после переключения аккаунта не показывать чужую историю
export function loadLastInstanceId(): string | null {
  return readJson<string | null>(LAST_INSTANCE_KEY, null)
}

export function saveLastInstanceId(idInstance: string): void {
  writeJson(LAST_INSTANCE_KEY, idInstance)
}

export function loadChats(idInstance: string): Chat[] {
  const data = readJson<Chat[]>(chatsKey(idInstance), [])
  if (!Array.isArray(data)) return []

  // Поле displayName добавили позже. Для старых записей подставляем null,
  // чтобы список не показывал вместо имени undefined
  return data.map((chat) => ({ ...chat, displayName: chat.displayName ?? null }))
}

export function saveChats(idInstance: string, chats: Chat[]): void {
  writeJson(chatsKey(idInstance), chats)
}

export function loadMessages(idInstance: string): MessagesByChat {
  const data = readJson<MessagesByChat>(messagesKey(idInstance), {})
  if (typeof data !== 'object' || data === null) return {}
  return data
}

export function saveMessages(idInstance: string, messages: MessagesByChat): void {
  const trimmed: MessagesByChat = {}

  for (const [chatId, list] of Object.entries(messages)) {
    trimmed[chatId] = list.slice(-MAX_MESSAGES_PER_CHAT)
  }

  writeJson(messagesKey(idInstance), trimmed)
}
