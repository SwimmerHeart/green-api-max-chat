import type {
  AccountSettings,
  CheckAccountResult,
  Credentials,
  NotificationEnvelope,
  SendMessageResult,
} from './types'

// Универсальный класс ошибок с GREEN-API: сетевых сбоев и ответов API с ошибкой
export class GreenApiError extends Error {
  readonly httpStatus?: number

  constructor(message: string, httpStatus?: number) {
    super(message)
    this.name = 'GreenApiError'
    this.httpStatus = httpStatus
  }
}

type HttpMethod = 'GET' | 'POST' | 'DELETE'

export const MAX_MESSAGE_LENGTH = 4000
export const MIN_RECEIVE_TIMEOUT = 5

interface RequestOptions {
  method: HttpMethod
  body?: unknown
  query?: Record<string, string>
  suffix?: string
  signal?: AbortSignal
}

// Достаем текст ошибки из тела ответа.
// В документации поле называется message, но часть ошибок приходит с reason,
// поэтому берем message первым и падаем на reason только если message нет
function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined

  const { message, reason } = payload as { message?: unknown; reason?: unknown }

  if (typeof message === 'string' && message.length > 0) return message
  if (typeof reason === 'string' && reason.length > 0) return reason

  return undefined
}

// Проверяем признак ошибки в теле ответа.
// Документированное значение status равно error, но встречается и status: false
function isErrorPayload(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false

  const status = (payload as { status?: unknown }).status

  return status === 'error' || status === false
}

export class GreenApiClient {
  private readonly credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
  }

  // Собирает адрес метода вида https://api.green-api.com/waInstance11001234567/sendMessage/TOKEN
  private endpoint(method: string, suffix = ''): URL {
    const { apiUrl, idInstance, apiTokenInstance } = this.credentials
    return new URL(`/waInstance${idInstance}/${method}/${apiTokenInstance}${suffix}`, apiUrl)
  }

  private async send<T>(method: string, options: RequestOptions): Promise<T> {
    const { method: httpMethod, body, query, suffix, signal } = options
    const url = this.endpoint(method, suffix)

    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value)
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: httpMethod,
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (cause) {
      // Отменённый запрос пробрасываем как есть, иначе при закрытии чата - сообщение о потере связи
      if (signal?.aborted) throw cause
      throw new GreenApiError('Нет связи с GREEN-API, проверь адрес и подключение')
    }

    // Сначала читаем текст, а не json(): так при ошибке с кодом 400
    // мы всё равно сможем достать полезный reason из тела
    const raw = await response.text()

    let payload: unknown = null
    if (raw.length > 0) {
      try {
        payload = JSON.parse(raw)
      } catch {
        throw new GreenApiError(`GREEN-API вернул неожиданный ответ (HTTP ${response.status})`)
      }
    }

    if (!response.ok) {
      throw new GreenApiError(
        readErrorMessage(payload) ?? `Запрос к GREEN-API не выполнен (HTTP ${response.status})`,
        response.status,
      )
    }

    // Ловим ошибку, пришедшую с кодом 200
    if (isErrorPayload(payload)) {
      throw new GreenApiError(
        readErrorMessage(payload) ?? 'GREEN-API вернул ошибку',
        response.status,
      )
    }

    return payload as T
  }

  // Проверка доступов и состояния инстанса
  getAccountSettings(signal?: AbortSignal): Promise<AccountSettings> {
    return this.send<AccountSettings>('getAccountSettings', { method: 'GET', signal })
  }

  // Проверка наличия аккаунта MAX по номеру и получение chatId для чата
  async checkAccount(phoneNumber: string, signal?: AbortSignal): Promise<CheckAccountResult> {
    return this.send<CheckAccountResult>('checkAccount', {
      method: 'POST',
      body: { phoneNumber: Number(phoneNumber) },
      signal,
    })
  }

  // Отправка текстового сообщения в чат
  async sendMessage(
    chatId: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<SendMessageResult> {
    return this.send<SendMessageResult>('sendMessage', {
      method: 'POST',
      body: { chatId, message },
      signal,
    })
  }

  // Запрос висит до 25 секунд и при отсутствии новых событий возвращает пустое тело.
  // По документации допустимый диапазон receiveTimeout от 5 до 60 секунд
  async receiveNotification(
    receiveTimeout = 25,
    signal?: AbortSignal,
  ): Promise<NotificationEnvelope | null> {
    const payload = await this.send<NotificationEnvelope | null>('receiveNotification', {
      method: 'GET',
      query: { receiveTimeout: String(receiveTimeout) },
      signal,
    })
    return payload ?? null
  }

  // Удаление уведомления
  async deleteNotification(receiptId: number, signal?: AbortSignal): Promise<void> {
    await this.send<void>('deleteNotification', {
      method: 'DELETE',
      suffix: `/${receiptId}`,
      signal,
    })
  }
}
