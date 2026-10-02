import { useEffect, useState } from 'react'
import { GreenApiClient } from '../api/greenApiClient'
import type { Credentials } from '../api/types'
import { clearCredentials, loadCredentials } from '../lib/storage'

export interface Session {
  credentials: Credentials | null
  accountPhone: string | null
}

export function useSession(): Session {
  const [credentials, setCredentials] = useState<Credentials | null>(() => loadCredentials())
  const [accountPhone, setAccountPhone] = useState<string | null>(null)

  useEffect(() => {
    if (credentials === null) return

    const controller = new AbortController()
    const client = new GreenApiClient(credentials)

    async function validate() {
      try {
        const settings = await client.getAccountSettings(controller.signal)

        if (settings.stateInstance !== 'authorized') {
          clearCredentials()
          setCredentials(null)
          return
        }

        setAccountPhone(settings.phone ?? null)
      } catch {
        if (controller.signal.aborted) return
        setAccountPhone(null)
      }
    }

    void validate()

    return () => controller.abort()
  }, [credentials])

  return { credentials, accountPhone }
}
