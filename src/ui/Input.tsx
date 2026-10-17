import { useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useGame } from './useGame'
import { viewOf } from './view'
import { ReviewBadge, useReview } from './Review'
import type { ReviewNote } from './review'
import { LONG_PRESS_MS } from './Message'

/** Сколько «?» на скрытой кнопке: 2–4, стабильно по индексу. */
const MARKS = [3, 2, 4, 3, 2, 4]

/** Долгое нажатие на варианте — то же, что правый клик: заметка о варианте (#878). */
function useOptionPress(onAnnotate?: () => void) {
  const timer = useRef<number | null>(null)
  const from = useRef<{ id: number; x: number; y: number } | null>(null)
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    from.current = null
  }
  const onPointerDown = (e: ReactPointerEvent) => {
    if (!onAnnotate || e.pointerType === 'mouse') return
    stop()
    from.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    timer.current = window.setTimeout(() => { timer.current = null; onAnnotate() }, LONG_PRESS_MS)
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const start = from.current
    if (!start || start.id !== e.pointerId) return
    if (Math.abs(e.clientX - start.x) > 12 || Math.abs(e.clientY - start.y) > 12) stop()
  }
  return { onPointerDown, onPointerMove, onPointerUp: stop, onPointerCancel: stop }
}

/** Варианты реплик: контекстные подсвечены, грубые — красным. Пока Алик отвечает — дёргающиеся «?», чтобы не раскрыть варианты. */
export function Choices() {
  const game = useGame()
  const review = useReview()
  const locked = game.ui.busy || game.battery.dead
  // Ряд заморожен на весь ход мира: пересборка вариантов посреди хода (сцена, эндгейм, серия) меняла число «?»,
  // добавляла/убирала кнопки и перезапускала анимацию — ряд мигал (#657). Число берём с последнего кадра без busy:
  // того самого ряда, который игрок видел перед ходом; подписи ждут конца хода.
  const shown = useRef<number | null>(null)
  if (!locked) shown.current = game.choices.length
  const count = locked ? shown.current ?? game.choices.length : game.choices.length
  return (
    <div className="choices" id="choices" aria-busy={locked}>
      {locked
        ? Array.from({ length: count }, (_, i) => (
            <button key={'locked' + i} className="locked" disabled aria-label="Варианты скрыты, Алик отвечает">
              {Array.from({ length: MARKS[i % MARKS.length] }, (_, j) => (
                <span key={j} className="q" aria-hidden="true" style={{ animationDelay: `${-((i * 3 + j * 7) % 10) * 0.09}s` }}>?</span>
              ))}
            </button>
          ))
        : game.choices.map((o, i) => (
            <ChoiceButton
              key={i + o.text}
              text={o.text}
              className={[o.tone === 'rude' ? 'rude' : '', o.scene || o.act ? 'ctx' : '', o.primary ? 'primary' : ''].join(' ').trim()}
              note={review?.optionNote(o.text)}
              onSend={() => void game.send(o)}
              onAnnotate={review?.enabled ? () => review.menuChoice(o.text) : undefined}
              onEdit={review ? (id: number) => review.edit(id) : undefined}
            />
          ))}
    </div>
  )
}

/** Кнопка варианта: обычная реплика плюс (в режиме рецензирования) меню заметки и бейдж (#878). */
function ChoiceButton({ text, className, note, onSend, onAnnotate, onEdit }: {
  text: string
  className: string
  note?: ReviewNote
  onSend: () => void
  onAnnotate?: () => void
  onEdit?: (id: number) => void
}) {
  const press = useOptionPress(onAnnotate)
  return (
    <button
      className={className}
      onClick={onSend}
      onContextMenu={onAnnotate ? (e) => { e.preventDefault(); onAnnotate() } : undefined}
      {...press}
    >
      {text}
      {note && onEdit && <ReviewBadge note={note} onEdit={() => onEdit(note.id)} />}
    </button>
  )
}

/** Свободный ответ: движок сам определит смысл и тон текста. */
export function Composer() {
  const game = useGame()
  const [text, setText] = useState('')
  const locked = game.ui.busy || game.battery.dead
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const value = text.trim()
    if (!value || locked) return
    setText('')
    void game.send(value)
  }

  return (
    <form className="composer" id="composer" onSubmit={submit} aria-busy={locked}>
      <input
        id="input"
        autoComplete="off"
        maxLength={300}
        value={text}
        disabled={locked}
        enterKeyHint="send"
        onChange={(e) => setText(e.target.value)}
        placeholder={viewOf(game).sceneId ? 'Выберите ответ выше или напишите свой…' : 'Сообщение…'}
        aria-label="Сообщение"
      />
      <button type="submit" id="sendBtn" disabled={locked || !text.trim()} aria-label="Отправить">➤</button>
    </form>
  )
}
