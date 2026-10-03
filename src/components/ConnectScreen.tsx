import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { GreenApiClient, GreenApiError } from '../api/greenApiClient'
import type { Credentials } from '../api/types'
import { DEFAULT_API_URL } from '../lib/storage'

interface ConnectScreenProps {
  onConnected: (credentials: Credentials) => void
  // Подставляем прошлые доступы, чтобы не вводить их заново после QR
  initialCredentials?: Credentials
  notice?: string
}

export function ConnectScreen({ onConnected, initialCredentials, notice }: ConnectScreenProps) {
  const [apiUrl, setApiUrl] = useState(initialCredentials?.apiUrl ?? DEFAULT_API_URL)
  const [idInstance, setIdInstance] = useState(initialCredentials?.idInstance ?? '')
  const [apiTokenInstance, setApiTokenInstance] = useState(
    initialCredentials?.apiTokenInstance ?? '',
  )
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const trimmedUrl = apiUrl.trim()
    const trimmedId = idInstance.trim()
    const trimmedToken = apiTokenInstance.trim()

    if (!trimmedUrl || !trimmedId || !trimmedToken) {
      setError('Заполни все поля')
      return
    }

    setIsSubmitting(true)

    const client = new GreenApiClient({
      apiUrl: trimmedUrl,
      idInstance: trimmedId,
      apiTokenInstance: trimmedToken,
    })

    try {
      const settings = await client.getAccountSettings()

      if (settings.stateInstance !== 'authorized') {
        setError(
          `Инстанс в состоянии ${settings.stateInstance}. Отсканируй QR-код в личном кабинете GREEN-API и повтори подключение.`,
        )
        return
      }

      onConnected({
        apiUrl: trimmedUrl,
        idInstance: trimmedId,
        apiTokenInstance: trimmedToken,
      })
    } catch (cause) {
      setError(readErrorMessage(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-max-surface p-6 shadow-sm ring-1 ring-black/5"
      >
        <h1 className="text-2xl font-semibold text-max-text">Подключение инстанса</h1>
        <p className="mt-1 text-sm text-max-muted">Данные из личного кабинета GREEN-API</p>

        <div className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-max-text">
            Адрес API
            <input
              type="url"
              value={apiUrl}
              onChange={(event) => setApiUrl(event.target.value)}
              placeholder={DEFAULT_API_URL}
              className="rounded-lg border border-black/10 px-3 py-2 text-base outline-none focus:border-max-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-max-text">
            idInstance
            <input
              type="text"
              inputMode="numeric"
              value={idInstance}
              onChange={(event) => setIdInstance(event.target.value)}
              placeholder="11001234567"
              className="rounded-lg border border-black/10 px-3 py-2 text-base outline-none focus:border-max-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-max-text">
            apiTokenInstance
            <input
              type="password"
              value={apiTokenInstance}
              onChange={(event) => setApiTokenInstance(event.target.value)}
              placeholder="Токен из кабинета"
              className="rounded-lg border border-black/10 px-3 py-2 text-base outline-none focus:border-max-accent"
            />
          </label>
        </div>

        {notice !== undefined && (
          <p className="mt-4 rounded-lg bg-max-surface px-3 py-2 text-sm text-max-muted ring-1 ring-black/5">
            {notice}
          </p>
        )}

        {error !== null && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-max-danger/10 px-3 py-2 text-sm text-max-danger"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 w-full rounded-lg bg-max-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-max-accent-dark disabled:opacity-60 cursor-pointer"
        >
          {isSubmitting ? 'Проверяем доступы' : 'Подключить'}
        </button>
      </form>
    </main>
  )

  function readErrorMessage(cause: unknown): string {
    if (cause instanceof GreenApiError) return cause.message
    return 'Не удалось подключиться. Проверьте доступы и адрес API'
  }
}
