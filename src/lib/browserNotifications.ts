export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied'

interface ShowNotificationOptions {
  title: string
  body: string
  tag: string
  onOpen: () => void
}

// В системных уведомлениях длинный текст обрезается, а в ленте нужен полный
const MAX_BODY_LENGTH = 120

function notificationApi(): typeof Notification | null {
  if (typeof window === 'undefined') return null
  if (!('Notification' in window)) return null

  return window.Notification
}

export function getPermissionState(): NotificationPermissionState {
  const api = notificationApi()

  if (api === null) return 'unsupported'

  return api.permission as NotificationPermissionState
}

// Запрос разрешения. Браузер разрешает вызывать только из обработчика клика,
// поэтому функцию зовут прямо в onClick, без промежуточного await
export async function requestPermission(): Promise<NotificationPermissionState> {
  const api = notificationApi()

  if (api === null) return 'unsupported'

  try {
    const result = await api.requestPermission()

    return result as NotificationPermissionState
  } catch {
    return api.permission as NotificationPermissionState
  }
}

// Показывает уведомление, если это разрешено. Возвращает false,
// если показать было нельзя, чтобы вызывающий знал результат
export function showNotification({ title, body, tag, onOpen }: ShowNotificationOptions): boolean {
  const api = notificationApi()

  if (api === null) return false
  if (api.permission !== 'granted') return false

  const notification = new api(title, {
    body: truncate(body),
    tag,
  })

  notification.onclick = () => {
    window.focus()
    onOpen()
    notification.close()
  }

  return true
}

function truncate(text: string): string {
  if (text.length <= MAX_BODY_LENGTH) return text

  return `${text.slice(0, MAX_BODY_LENGTH - 1)}...`
}
