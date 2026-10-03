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

const isMissingAccount = (phone) => String(phone).endsWith('9')
const isOutsideMax = (phone) => String(phone).endsWith('0')
const toChatId = (phone) => `${String(phone).replace(/\D/g, '')}@c.us`
const isOutsideMaxPeer = (chatId) => isOutsideMax(String(chatId).split('@')[0])

const notifications = []
let messageCounter = 0

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
}

const instanceData = {
  idInstance: Number(ID_INSTANCE),
  wid: `${ACCOUNT_PHONE}@c.us`,
  typeInstance: 'v3',
}

function send(res, status, body) {
  res.writeHead(status, { ...cors, 'Content-Type': 'application/json' })
  res.end(body === null ? '' : JSON.stringify(body))
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

function pushNotification(body) {
  notifications.push(body)
}

const server = http.createServer(async (req, res) => {
  // Браузер спрашивает разрешение перед запросом с JSON-телом
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    res.end()
    return
  }

  // Служебные маршруты для тестов, работают без токена
  if (req.url === '/mock/reset') {
    notifications.length = 0
    messageCounter = 0
    send(res, 200, { result: true })
    return
  }

  if (req.url === '/mock/incoming') {
    const { chatId, text } = await readBody(req)

    if (typeof chatId !== 'string' || chatId.length === 0) {
      send(res, 400, { status: false, reason: 'Parameter chatId is required' })
      return
    }

    const peerPhone = chatId.split('@')[0]

    pushNotification({
      typeWebhook: 'incomingMessageReceived',
      instanceData,
      timestamp: Date.now(),
      chatId,
      chatType: 'inChat',
      senderData: {
        chatId,
        phone: peerPhone,
        pushName: `Собеседник ${peerPhone.slice(-4)}`,
        avatar: '',
      },
      messageData: {
        typeMessage: 'textMessage',
        textMessageData: {
          textMessage:
            typeof text === 'string' && text.length > 0 ? text : 'Сообщение от собеседника',
        },
      },
    })

    send(res, 200, { result: true })
    return
  }

  const [instanceSegment, method, token] = req.url.split('?')[0].split('/').filter(Boolean)

  const instanceId = instanceSegment?.replace('waInstance', '') ?? ''

  // Неверные доступы отвечаем кодом 400 с status: false
  if (instanceId !== ID_INSTANCE || token !== API_TOKEN) {
    send(res, 400, { status: false, reason: 'Parameter apiTokenInstance not define' })
    return
  }

  if (method === 'getAccountSettings') {
    send(res, 200, {
      stateInstance: 'authorized',
      phone: ACCOUNT_PHONE,
      avatar: '',
      chatId: `${ACCOUNT_PHONE}@c.us`,
      name: 'Тестовый аккаунт',
    })
    return
  }

  if (method === 'checkAccount') {
    const { phoneNumber } = await readBody(req)

    // Аккаунта в WhatsApp нет: настоящий API отвечает кодом 400
    if (isMissingAccount(phoneNumber)) {
      send(res, 400, { status: false, reason: 'Account is not registered' })
      return
    }

    send(res, 200, {
      exist: true,
      status: 'ok',
      chatId: toChatId(phoneNumber),
      fromCache: false,
    })
    return
  }

  if (method === 'sendMessage') {
    const { chatId, message } = await readBody(req)

    if (!chatId || typeof message !== 'string' || message.length > 4000) {
      send(res, 400, { status: false, reason: 'Validation failed' })
      return
    }

    const idMessage = `BAE5367236AA${String(messageCounter + 1).padStart(4, '0')}`
    messageCounter += 1
    send(res, 200, { idMessage })

    const outsideMax = isOutsideMaxPeer(chatId)

    setTimeout(() => {
      if (outsideMax) return

      const peerPhone = String(chatId).split('@')[0]

      pushNotification({
        typeWebhook: 'incomingMessageReceived',
        instanceData,
        timestamp: Date.now(),
        chatId,
        chatType: 'inChat',
        senderData: {
          chatId,
          phone: peerPhone,
          pushName: `Собеседник ${peerPhone.slice(-4)}`,
          avatar: '',
        },
        messageData: {
          typeMessage: 'textMessage',
          textMessageData: { textMessage: `Ответ на: ${message}` },
        },
      })
    }, 400)

    // Сначала delivered, потом read, чтобы проверить обе галочки
    setTimeout(() => {
      pushNotification({
        typeWebhook: 'outgoingMessageStatus',
        instanceData,
        timestamp: Date.now(),
        chatId,
        idMessage,
        status: 'delivered',
      })
    }, 900)

    setTimeout(() => {
      pushNotification({
        typeWebhook: 'outgoingMessageStatus',
        instanceData,
        timestamp: Date.now(),
        chatId,
        idMessage,
        status: outsideMax ? 'noAccount' : 'read',
      })
    }, 1600)

    return
  }

  if (method === 'receiveNotification') {
    const notification = notifications[0]

    if (notification === undefined) {
      setTimeout(() => send(res, 200, null), 500)
      return
    }

    send(res, 200, {
      receiptId: 1000 + notifications.length,
      body: notification,
    })
    return
  }

  if (method === 'deleteNotification') {
    notifications.shift()
    send(res, 200, { result: true })
    return
  }

  send(res, 404, { status: false, reason: `Unknown method: ${method}` })
})

function shutdown() {
  fs.rmSync(PID_FILE, { force: true })
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
  console.log('Номер на 9: аккаунта нет, checkAccount вернет ошибку')
  console.log('Номер на 0: аккаунт вне MAX, при отправке придет noAccount')
  console.log('Служебное: POST /mock/reset, POST /mock/incoming с { chatId, text }')
})
