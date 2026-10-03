import { useEffect, useState } from 'react'
import { GreenApiClient } from '../api/greenApiClient'
import type { Credentials } from '../api/types'

export type AccountStatus = 'checking' | 'authorized' | 'unauthorized'

export interface AccountState {
  status: AccountStatus
  accountPhone: string | null
}

// Ответ храним вместе с набором доступов, к которому он относится.
// Так статус выводится из состояния, а не ставится setState в теле эффекта
interface CheckResult {
  key: string
  isAuthorized: boolean
  accountPhone: string | null
}

function makeKey(credentials: Credentials): string {
  const { apiUrl, idInstance, apiTokenInstance } = credentials
  return `${apiUrl}|${idInstance}|${apiTokenInstance}`
}

// Проверяем доступы при каждой смене credentials: это покрывает и восстановление
// сессии из хранилища, и повторное подключение после QR
export function useAccountStatus(credentials: Credentials | null): AccountState {
  const [result, setResult] = useState<CheckResult | null>(null)

  useEffect(() => {
    if (credentials === null) return

    const target = credentials
    const controller = new AbortController()
    const client = new GreenApiClient(target)

    async function check() {
      try {
        const settings = await client.getWaSettings(controller.signal)
        setResult({
          key: makeKey(target),
          isAuthorized: settings.stateInstance === 'authorized',
          accountPhone: settings.phone ?? null,
        })
      } catch {
        if (controller.signal.aborted) return
        // Доступы не стираем: пользователь должен иметь возможность нажать Подключить еще раз
        setResult({ key: makeKey(target), isAuthorized: false, accountPhone: null })
      }
    }

    void check()

    return () => controller.abort()
  }, [credentials])

  if (credentials === null) return { status: 'authorized', accountPhone: null }

  const isCurrent = result !== null && result.key === makeKey(credentials)

  return {
    // Пока ответ не пришел или относится к прошлым доступам, статус еще неизвестен
    status: isCurrent ? (result.isAuthorized ? 'authorized' : 'unauthorized') : 'checking',
    accountPhone: isCurrent ? result.accountPhone : null,
  }
}
