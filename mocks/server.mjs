import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.MOCK_PORT ?? 8787)
const ID_INSTANCE = '1100000001'
const API_TOKEN = 'testToken'
const ACCOUNT_PHONE = '79991234567'

const MOCK_DIR = path.dirname(fileURLToPath(import.meta.url))
const PID_FILE = path.join(MOCK_DIR, '.mock.pid')

const MOCK_SIGNATURE = `mocks${path.sep}server.mjs`

const MAX_ATTEMPTS = 15
const RETRY_DELAY_MS = 200

// Поднимаем новый экземпляр, а перед этим снимаем старый, чтобы не искать PID вручную
function stopPreviousMock() {
  let pid

  try {
    pid = Number(fs.readFileSync(PID_FILE, 'utf8'))
  } catch {
    return
  }

  // PID мог уже переиспользоваться. Сверяемся с именем процесса, чтобы не убить чужой
  let isOurMock = false

  try {
    isOurMock = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(MOCK_SIGNATURE)
  } catch {
    isOurMock = false
  }

  if (!isOurMock) {
    fs.rmSync(PID_FILE, { force: true })
    return
  }

  console.log(`Останавливаем предыдущий мок, PID ${pid}`)

  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    // Процесс уже умер, ничего делать не нужно
  }
}

// Принимаем и голый номер, и 79991234567@c.us, и 123456789@lid
const peerOf = (chatId) => String(chatId).split('@')[0]

// Номер на 9: аккаунта нет, checkWhatsapp вернет ошибку
const isMissingAccount = (chatId) => peerOf(chatId).endsWith('9')

// Номер на 0: аккаунт вне MAX, при отправке придет noAccount
const isOutsideMax = (chatId) => peerOf(chatId).endsWith('0')

const notifications = []
let messageCounter = 0
let receiptCounter = 1000

// Висящие receiveNotification. Настоящий API держит соединение, пока событие не пришло
const waitingReceivers = []

const nextReceiptId = () => ++receiptCounter

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
}

const instanceData = {
  idInstance: Number(ID_INSTANCE),
  wid: `${ACCOUNT_PHONE}@c.us`,
  typeInstance: 'whatsapp',
}

function send(res, status, body) {
  // Ответ может уйти в сокет, который клиент уже закрыл
  if (res.writableEnded || res.destroyed) return

  res.writeHead(status, { ...cors, 'Content-Type': 'application/json' })
  res.end(body === null ? '' : JSON.stringify(body))
}

// Тело ошибки в формате документации: code, message и status со значением error
function sendError(res, status, code, message) {
  send(res, status, { code, message, status: 'error' })
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

// Клиент закрыл соединение сам: снимаем ожидание, иначе в очереди остаются
// мертвые сокеты и уведомление уходит в никуда
function releaseReceiver(receiver) {
  clearTimeout(receiver.timer)

  const index = waitingReceivers.indexOf(receiver)

  if (index !== -1) waitingReceivers.splice(index, 1)
}

// Отдаем уведомление и следим за ним до подтверждения: клиент мог закрыть
// соединение, не успев подтвердить, и событие потерялось бы молча
function serveQueued(res, entry) {
  res.on('close', () => {
    const index = notifications.indexOf(entry)

    if (index === -1) return

    notifications.splice(index, 1)
    notifications.unshift(entry)
    flushWaitingReceivers()
  })

  send(res, 200, { receiptId: entry.receiptId, body: entry.body })
}

// Клиент отменил запрос, но сокет еще не помечен как закрытый: такие ответы
// отдавать нельзя, иначе уведомление уйдет в никуда
function isReceiverAlive(receiver) {
  const socket = receiver.res.socket

  if (socket === null || socket === undefined || socket.destroyed) return false

  return !receiver.res.writableEnded
}

// Отпускаем висящие receiveNotification сразу, как появилось уведомление.
// Иначе клиент ждал бы весь receiveTimeout и не видел бы события вовремя
function flushWaitingReceivers() {
  while (notifications.length > 0 && waitingReceivers.length > 0) {
    const receiver = waitingReceivers.shift()

    clearTimeout(receiver.timer)

    // Сокет уже мертв: уведомление заберет следующий ожидающий или следующий запрос
    if (!isReceiverAlive(receiver)) continue

    serveQueued(receiver.res, notifications[0])
  }
}

function pushNotification(body) {
  notifications.push({ receiptId: nextReceiptId(), body })
  flushWaitingReceivers()
}

const nowInSeconds = () => Math.floor(Date.now() / 1000)

function senderDataFor(chatId) {
  const peer = peerOf(chatId)
  const name = `Собеседник ${peer.slice(-4)}`

  return {
    chatId,
    sender: `${peer}@c.us`,
    chatName: name,
    senderName: name,
    senderContactName: '',
  }
}

function incomingTextMessage({ chatId, text, stanzaId }) {
  return {
    typeWebhook: 'incomingMessageReceived',
    instanceData,
    timestamp: nowInSeconds(),
    // stanzaId позволяет заранее задать идентификатор, чтобы потом проверить удаление
    idMessage: stanzaId ?? `INCOMING${String(++messageCounter).padStart(6, '0')}`,
    senderData: senderDataFor(chatId),
    messageData: {
      typeMessage: 'textMessage',
      textMessageData: {
        textMessage: text,
      },
    },
  }
}

function incomingDeletedMessage({ chatId, stanzaId }) {
  return {
    typeWebhook: 'incomingMessageReceived',
    instanceData,
    timestamp: nowInSeconds(),
    idMessage: `DELETED${String(++messageCounter).padStart(6, '0')}`,
    senderData: senderDataFor(chatId),
    messageData: {
      typeMessage: 'deletedMessage',
      deletedMessageData: { stanzaId },
    },
  }
}

function outgoingStatus({ chatId, idMessage, status, description }) {
  return {
    typeWebhook: 'outgoingMessageStatus',
    instanceData,
    timestamp: nowInSeconds(),
    chatId,
    idMessage,
    status,
    sendByApi: true,
    ...(description === undefined ? {} : { description }),
  }
}

function stateInstanceChanged(stateInstance) {
  return {
    typeWebhook: 'stateInstanceChanged',
    instanceData,
    timestamp: nowInSeconds(),
    stateInstance,
  }
}

const server = http.createServer(async (req, res) => {
  // Браузер спрашивает разрешение перед запросом с JSON-телом
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    res.end()
    return
  }

  // Служебные маршруты для тестов, работают без токена
  if (req.url === '/mock/status') {
    send(res, 200, {
      queue: notifications.length,
      waiters: waitingReceivers.length,
      alive: waitingReceivers.filter(isReceiverAlive).length,
    })
    return
  }

  if (req.url === '/mock/reset') {
    notifications.length = 0
    messageCounter = 0
    send(res, 200, { result: true })
    return
  }

  // Служебные маршруты для тестов, работают без токена
  if (req.url === '/mock/incoming') {
    const { chatId, text, stanzaId } = await readBody(req)

    if (typeof chatId !== 'string' || chatId.length === 0) {
      sendError(res, 400, 'VALIDATION_FAILED', "Parameter 'chatId' is required")
      return
    }

    pushNotification(
      incomingTextMessage({
        chatId,
        text: typeof text === 'string' && text.length > 0 ? text : 'Сообщение от собеседника',
        stanzaId: typeof stanzaId === 'string' && stanzaId.length > 0 ? stanzaId : undefined,
      }),
    )

    send(res, 200, { result: true })
    return
  }

  if (req.url === '/mock/deleted') {
    const { chatId, stanzaId } = await readBody(req)

    if (typeof chatId !== 'string' || typeof stanzaId !== 'string') {
      sendError(res, 400, 'VALIDATION_FAILED', "Parameters 'chatId' and 'stanzaId' are required")
      return
    }

    pushNotification(incomingDeletedMessage({ chatId, stanzaId }))

    send(res, 200, { result: true })
    return
  }

  if (req.url === '/mock/state') {
    const { stateInstance } = await readBody(req)

    if (typeof stateInstance !== 'string') {
      sendError(res, 400, 'VALIDATION_FAILED', "Parameter 'stateInstance' is required")
      return
    }

    pushNotification(stateInstanceChanged(stateInstance))

    send(res, 200, { result: true })
    return
  }

  // Четвертый сегмент есть только у deleteNotification: там receiptId в адресе
  const [instanceSegment, method, token, pathValue] = req.url
    .split('?')[0]
    .split('/')
    .filter(Boolean)

  const instanceId = instanceSegment?.replace('waInstance', '') ?? ''

  // Неверные доступы отвечаем кодом 400 в документированном формате
  if (instanceId !== ID_INSTANCE || token !== API_TOKEN) {
    sendError(res, 400, 'BAD_REQUEST', 'Parameter apiTokenInstance not define')
    return
  }

  // Метод проверки состояния инстанса называется getWaSettings
  if (method === 'getWaSettings') {
    send(res, 200, {
      stateInstance: 'authorized',
      phone: ACCOUNT_PHONE,
      avatar: '',
      chatId: `${ACCOUNT_PHONE}@c.us`,
      historySyncProgress: 100,
      logoutProcess: false,
    })
    return
  }

  // Метод проверки номера называется checkWhatsapp и возвращает existsWhatsapp
  if (method === 'checkWhatsapp') {
    const { chatId } = await readBody(req)

    if (typeof chatId !== 'string' || chatId.length === 0) {
      sendError(res, 400, 'VALIDATION_FAILED', "Parameter 'chatId' is required")
      return
    }

    // Аккаунта нет: настоящий API отвечает кодом 400
    if (isMissingAccount(chatId)) {
      sendError(res, 400, 'BAD_REQUEST', 'Account is not registered')
      return
    }

    send(res, 200, {
      existsWhatsapp: true,
      chatId,
      username: '',
      fromCache: false,
    })
    return
  }

  if (method === 'sendMessage') {
    const { chatId, message } = await readBody(req)

    if (!chatId || typeof message !== 'string' || message.length > 20000) {
      sendError(
        res,
        400,
        'VALIDATION_FAILED',
        "Validation failed. Details: 'message' length must be less than or equal to 20000 characters long",
      )
      return
    }

    const idMessage = `BAE5367236AA${String(messageCounter + 1).padStart(4, '0')}`
    messageCounter += 1
    send(res, 200, { idMessage })

    const outsideMax = isOutsideMax(chatId)

    setTimeout(() => {
      if (outsideMax) return

      pushNotification(incomingTextMessage({ chatId, text: `Ответ на: ${message}` }))
    }, 400)

    // Сначала delivered, потом read, чтобы проверить обе галочки
    setTimeout(() => {
      pushNotification(outgoingStatus({ chatId, idMessage, status: 'delivered' }))
    }, 900)

    setTimeout(() => {
      pushNotification(
        outsideMax
          ? outgoingStatus({ chatId, idMessage, status: 'noAccount' })
          : outgoingStatus({ chatId, idMessage, status: 'read' }),
      )
    }, 1600)

    return
  }

  if (method === 'receiveNotification') {
    const query = new URL(req.url, 'http://localhost').searchParams
    const requestedTimeout = Number(query.get('receiveTimeout'))
    const timeout =
      Number.isFinite(requestedTimeout) && requestedTimeout >= 5
        ? Math.min(requestedTimeout, 60) * 1000
        : 5000

    if (notifications.length > 0) {
      serveQueued(res, notifications[0])
      return
    }

    // Очередь пуста: держим соединение и ждем либо уведомление, либо таймаут
    const receiver = { res, timer: null }

    receiver.timer = setTimeout(() => {
      releaseReceiver(receiver)

      send(res, 200, null)
    }, timeout)

    res.on('close', () => releaseReceiver(receiver))

    waitingReceivers.push(receiver)
    return
  }

  if (method === 'deleteNotification') {
    const receiptId = Number(pathValue)
    const index = notifications.findIndex((entry) => entry.receiptId === receiptId)

    // Удаляем по receiptId, а не по позиции: иначе повторное подтверждение
    // съело бы следующее уведомление, которое клиент еще не прочитал
    if (index !== -1) notifications.splice(index, 1)

    send(res, 200, { result: true })
    return
  }

  sendError(res, 404, 'NOT_FOUND', `Unknown method: ${method}`)
})

function shutdown() {
  fs.rmSync(PID_FILE, { force: true })

  // Висящие соединения не дают серверу закрыться, отпускаем их пустым ответом
  for (const receiver of waitingReceivers) {
    clearTimeout(receiver.timer)
    send(receiver.res, 200, null)
  }

  waitingReceivers.length = 0

  server.closeAllConnections()
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

let attempts = 0

server.on('error', (error) => {
  if (error.code !== 'EADDRINUSE') {
    console.error(error)
    process.exit(1)
  }

  attempts += 1

  if (attempts > MAX_ATTEMPTS) {
    console.error(
      `Порт ${PORT} занят другим процессом. Запусти на другом порту: MOCK_PORT=8788 npm run mock`,
    )
    process.exit(1)
  }

  console.log(`Порт ${PORT} еще освобождается, попытка ${attempts}/${MAX_ATTEMPTS}`)
  setTimeout(() => server.listen(PORT), RETRY_DELAY_MS)
})

stopPreviousMock()

server.listen(PORT, () => {
  fs.writeFileSync(PID_FILE, String(process.pid))

  console.log(`GREEN-API mock on http://localhost:${PORT}`)
  console.log(`idInstance: ${ID_INSTANCE}, apiTokenInstance: ${API_TOKEN}`)
  console.log('Номер на 9: аккаунта нет, checkWhatsapp вернет ошибку')
  console.log('Номер на 0: аккаунт вне MAX, при отправке придет noAccount')
  console.log('Служебное: POST /mock/reset, /mock/incoming, /mock/deleted, /mock/state')
})
