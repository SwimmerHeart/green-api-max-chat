import './index.css'
import { useCallback, useState } from 'react'
import { ConnectScreen } from './components/ConnectScreen'
import type { Credentials } from './api/types'
import { useSession } from './hooks/useSession'
import { saveCredentials } from './lib/storage'

function App() {
  const { credentials, accountPhone } = useSession()
  const [isConnected, setIsConnected] = useState(false)

  // Сохраняем доступы только те, что прошли проверку на экране подключения
  const handleConnected = useCallback((next: Credentials) => {
    saveCredentials(next)
    setIsConnected(true)
  }, [])

  if (credentials === null || !isConnected) return <ConnectScreen onConnected={handleConnected} />

  return (
    <main className="flex min-h-svh items-center justify-center">
      <div className="w-full max-w-md rounded-2xl bg-max-surface p-6 shadow-sm ring-1 ring-black/5">
        <h1 className="text-2xl font-semibold text-max-text">Инстанс подключён</h1>
        <p className="mt-2 text-sm text-max-muted">
          {accountPhone ? `Номер аккаунта ${accountPhone}` : 'Номер аккаунта неизвестен'}
        </p>
        <p className="mt-1 text-sm text-max-muted">
          Следующий шаг: создание чата по номеру телефона.
        </p>
      </div>
    </main>
  )
}

export default App
