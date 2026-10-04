import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../types'

interface MessageListProps {
  messages: ChatMessage[]
  // Имя собеседника для случая, когда сообщений пока нет
  emptyHint: string
  onRetry: (message: ChatMessage) => void
  onDiscard: (message: ChatMessage) => void
}

// Сколько сообщений показываем за раз.
// Догружать историю кнопкой дешевле, чем держать в DOM сотни пузырей
const PAGE_SIZE = 30

// Насколько близко к низу считаем, что пользователь в конце переписки
const BOTTOM_THRESHOLD_PX = 80

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
})

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
})

export function MessageList({ messages, emptyHint, onRetry, onDiscard }: MessageListProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  // Пока пользователь не отмотал наверх, новые сообщения сами прокручивают ленту
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true)

  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastMessageIdRef = useRef<string | null>(null)

  // Новый чат показываем с начала, а не с последних сообщений
  const isFirstRenderRef = useRef(true)

  const hiddenCount = messages.length - visibleCount
  const visible = messages.slice(-visibleCount)

  // Автоскролл делаем в layout-эффекте, чтобы сообщение успело отрисоваться
  // до прокрутки, иначе лента дёргается на каждое новое сообщение
  useLayoutEffect(() => {
    const last = visible.at(-1)

    if (last === undefined) return

    const isNewMessage = last.id !== lastMessageIdRef.current
    lastMessageIdRef.current = last.id

    // На первом открытии чата показываем конец истории, чтобы видеть свежие сообщения
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      bottomRef.current?.scrollIntoView({ block: 'end' })
      return
    }

    if (isNewMessage && isPinnedToBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [visible, isPinnedToBottom])

  // Список новых сообщений всегда один и тот же по id, поэтому эффект
  // перезапускается только когда реально добавилось сообщение
  useEffect(() => {
    const container = containerRef.current

    if (container === null) return

    function handleScroll() {
      if (container === null) return

      const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight

      setIsPinnedToBottom(distanceToBottom <= BOTTOM_THRESHOLD_PX)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [])

  function showEarlier() {
    const container = containerRef.current

    setVisibleCount((count) => count + PAGE_SIZE)

    // После отрисовки возвращаем позицию, иначе лента прыгнет вниз
    // и пользователь потеряет место, откуда читал
    if (container !== null) {
      const before = container.scrollHeight

      requestAnimationFrame(() => {
        if (container === null) return
        container.scrollTop += container.scrollHeight - before
      })
    }
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-3 py-4">
      {hiddenCount > 0 && (
        <div className="mb-3 flex justify-center">
          <button
            type="button"
            onClick={showEarlier}
            className="rounded-full bg-max-surface px-3 py-1.5 text-xs text-max-muted shadow-sm ring-1 ring-black/5 transition-colors hover:text-max-accent cursor-pointer"
          >
            Показать ранние ({hiddenCount})
          </button>
        </div>
      )}

      {messages.length === 0 ? (
        <p className="mx-auto max-w-xs text-center text-sm text-max-muted">
          Сообщений пока нет. Напиши первым.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visible.map((message) => (
            <li key={message.id}>
              <MessageBubble message={message} onRetry={onRetry} onDiscard={onDiscard} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-center text-xs text-max-muted">{emptyHint}</p>
      <div ref={bottomRef} />
    </div>
  )
}

interface MessageBubbleProps {
  message: ChatMessage
  onRetry: (message: ChatMessage) => void
  onDiscard: (message: ChatMessage) => void
}

function MessageBubble({ message, onRetry, onDiscard }: MessageBubbleProps) {
  const isOutgoing = message.direction === 'outgoing'
  const isFailed = message.status === 'failed'

  const shell = isOutgoing
    ? 'bg-max-accent text-white rounded-br-md'
    : 'bg-max-surface text-max-text rounded-bl-md'

  return (
    <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${shell}`}>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>

        <div
          className={`mt-1 flex items-center justify-end gap-1.5 text-[11px] ${
            isOutgoing ? 'text-white/70' : 'text-max-muted'
          }`}
        >
          {isFailed && message.failureReason !== null && (
            <span className="truncate text-max-danger/90">{message.failureReason}</span>
          )}

          <span>{formatWhen(message.timestamp)}</span>

          {isOutgoing && <StatusTicks status={message.status} />}
        </div>

        {message.status === 'failed' && !message.deleted && (
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => onRetry(message)}
              className="rounded-md bg-black/10 px-2 py-1 text-[11px] text-inherit transition-opacity hover:opacity-70 cursor-pointer"
            >
              Повторить
            </button>
            <button
              type="button"
              onClick={() => onDiscard(message)}
              className="rounded-md bg-black/10 px-2 py-1 text-[11px] text-inherit transition-opacity hover:opacity-70 cursor-pointer"
            >
              Удалить
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface StatusTicksProps {
  status: ChatMessage['status']
}

// Галочки показывают только доставку и прочтение, они совпадают с терминальными
// состояниями и не требуют пояснений
function StatusTicks({ status }: StatusTicksProps) {
  if (status === 'failed') {
    return (
      <span title="Не отправлено" aria-label="Не отправлено">
        !
      </span>
    )
  }

  if (status === 'pending') {
    return (
      <span title="Отправляется" aria-label="Отправляется">
        ○
      </span>
    )
  }

  if (status === 'sent') {
    return (
      <span title="Отправлено" aria-label="Отправлено">
        ✓
      </span>
    )
  }

  // Доставлено и прочитано отличаются только цветом галочек,
  // поэтому разводим их и цветом, и количеством
  if (status === 'delivered') {
    return (
      <span title="Доставлено" aria-label="Доставлено" className="text-white/90">
        ✓✓
      </span>
    )
  }

  return (
    <span title="Прочитано" aria-label="Прочитано" className="text-max-cyan">
      ✓✓
    </span>
  )
}

function formatWhen(timestamp: number): string {
  const date = new Date(timestamp)
  const isToday = date.toDateString() === new Date().toDateString()

  const time = timeFormatter.format(date)

  if (isToday) return time

  return `${dateFormatter.format(date)} ${time}`
}

export { PAGE_SIZE }
