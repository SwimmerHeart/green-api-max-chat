import type { Credentials } from '../api/types'

// Префикс ключей, чтобы не пересекаться с чужими данными на том же домене
const PREFIX = 'maxchat'
const CREDENTIALS_KEY = `${PREFIX}:credentials`
const CHATS_KEY = `${PREFIX}:chats`

export const DEFAULT_API_URL = 'https://api.green-api.com'

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

// Выход из аккаунта: токен удаляем, историю чатов оставляем.
// Она не содержит доступа к инстансу и полезна при следующем подключении.
export function clearCredentials(): void {
  try {
    window.localStorage.removeItem(CREDENTIALS_KEY)
  } catch {
    // хранилище недоступно
  }
}

export interface StoredChat {
  chatId: string
  phone: string
  title: string
}

export function loadChats(): StoredChat[] {
  const data = readJson<StoredChat[]>(CHATS_KEY, [])
  return Array.isArray(data) ? data : []
}

export function saveChats(chats: StoredChat[]): void {
  writeJson(CHATS_KEY, chats)
}
