import { useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { MAX_MESSAGE_LENGTH } from '../api/greenApiClient'

interface ComposerProps {
  onSend: (text: string) => Promise<{ ok: boolean }>
  // Пока отправка идет, поле блокируем, чтобы Enter не слал дубли
  isSending: boolean
}

// Лимит 20000 символов взят из документации sendMessage.
// Предупреждаем заранее, чтобы не дать отправить и узнать об отказе
const WARN_LENGTH = MAX_MESSAGE_LENGTH - 1000

export function Composer({ onSend, isSending }: ComposerProps) {
  const [text, setText] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const length = text.length
  const isTooLong = length > MAX_MESSAGE_LENGTH
  const canSend = text.trim().length > 0 && !isTooLong && !isSending

  // Enter отправляет, Shift+Enter переносит строку.
  // isComposing нужен для методов ввода, где Enter подтверждает выбор
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent.isComposing) return

    event.preventDefault()

    if (canSend) void submit()
  }

  async function submit() {
    if (!canSend) return

    const outcome = await onSend(text)

    // Чистим поле только при успешной отправке: при ошибке текст
    // остается в истории у сообщения, где его можно повторить
    if (outcome.ok) {
      setText('')
      textareaRef.current?.focus()
    }
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    void submit()
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-black/5 bg-max-surface px-3 py-2.5">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Сообщение"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-black/10 bg-max-canvas px-3 py-2.5 text-base outline-none focus:border-max-accent"
        />

        <button
          type="submit"
          disabled={!canSend}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-max-accent text-white transition-colors hover:bg-max-accent-dark disabled:opacity-40 cursor-pointer"
          aria-label="Отправить"
          title="Отправить"
        >
          {isSending ? <Spinner /> : <ArrowIcon />}
        </button>
      </div>

      {isTooLong && (
        <p className="mt-1 text-right text-[11px] text-max-danger">
          {length} / {MAX_MESSAGE_LENGTH}, превышен лимит
        </p>
      )}

      {!isTooLong && length > WARN_LENGTH && (
        <p className="mt-1 text-right text-[11px] text-max-muted">
          {length} / {MAX_MESSAGE_LENGTH}
        </p>
      )}
    </form>
  )
}

function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
      aria-hidden="true"
    />
  )
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}
