import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { GreenApiClient, GreenApiError } from '../api/greenApiClient'
import { normalizePhone, formatPhone } from '../lib/phone'
import type { Chat } from '../types'

interface NewChatScreenProps {
  client: GreenApiClient
  onCreated: (chat: Chat) => void
  onCancel: () => void
}

export function NewChatScreen({ client, onCreated, onCancel }: NewChatScreenProps) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const normalized = normalizePhone(phone)

    if (normalized === null) {
      setError('Введи номер в формате +7 (999) 123-45-67 или +375 (99) 123-45-67')
      return
    }

    setIsChecking(true)

    try {
      // Идентификатор собираем в документированном формате номера с @c.us.
      // Если у пользователя включен enableLidMode, API вернет другой формат, его сохраняем как есть
      const result = await client.checkWhatsapp(`${normalized}@c.us`)

      if (!result.existsWhatsapp) {
        setError('Аккаунт на этом номере не найден')
        return
      }

      const now = Date.now()
      const title = formatPhone(phone)

      const displayName =
        typeof result.username === 'string' && result.username.length > 0 ? result.username : null

      onCreated({
        chatId: result.chatId,
        phone: title,
        title,
        displayName,
        unread: 0,
        createdAt: now,
        updatedAt: now,
      })
    } catch (cause) {
      setError(cause instanceof GreenApiError ? cause.message : 'Не удалось проверить номер')
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <main className="mx-auto flex max-h-svh w-full max-w-md flex-col border-x border-black/5 bg-max-canvas sm:border">
      <header className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-2 py-1 text-sm text-max-accent transition-colors hover:bg-max-accent/10 cursor-pointer"
        >
          Назад
        </button>
        <h1 className="text-lg font-semibold text-max-text">Новый чат</h1>
      </header>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
        <label className="flex flex-col gap-1 text-sm text-max-text">
          Номер телефона
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+7 (999) 123-45-67"
            className="rounded-lg border border-black/10 bg-max-surface px-3 py-2 text-base outline-none focus:border-max-accent"
          />
        </label>

        {error !== null && (
          <p role="alert" className="rounded-lg bg-max-danger/10 px-3 py-2 text-sm text-max-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isChecking}
          className="rounded-lg bg-max-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-max-accent-dark disabled:opacity-60 cursor-pointer"
        >
          {isChecking ? 'Проверяем номер' : 'Создать чат'}
        </button>
      </form>
    </main>
  )
}
