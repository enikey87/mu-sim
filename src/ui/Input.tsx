import { useState, type FormEvent } from 'react'
import { useGame } from './useGame'

/** Сколько «?» на скрытой кнопке: 2–4, стабильно по индексу. */
const MARKS = [3, 2, 4, 3, 2, 4]

/** Варианты реплик: контекстные подсвечены, грубые — красным. Пока Алик отвечает — дёргающиеся «?», чтобы не раскрыть варианты. */
export function Choices() {
  const game = useGame()
  const locked = game.ui.busy || game.battery.dead
  return (
    <div className="choices" id="choices" aria-busy={locked}>
      {game.choices.map((o, i) =>
        locked ? (
          <button key={'locked' + i} className="locked" disabled aria-label="Варианты скрыты, Алик отвечает">
            {Array.from({ length: MARKS[i % MARKS.length] }, (_, j) => (
              <span key={j} className="q" aria-hidden="true" style={{ animationDelay: `${-((i * 3 + j * 7) % 10) * 0.09}s` }}>?</span>
            ))}
          </button>
        ) : (
          <button
            key={i + o.text}
            className={[o.tone === 'rude' ? 'rude' : '', o.scene || o.act ? 'ctx' : ''].join(' ').trim()}
            onClick={() => void game.send(o)}
          >
            {o.text}
          </button>
        ),
      )}
    </div>
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
        placeholder={game.S.scene ? 'Выберите ответ выше или напишите свой…' : 'Сообщение…'}
        aria-label="Сообщение"
      />
      <button type="submit" id="sendBtn" disabled={locked || !text.trim()} aria-label="Отправить">➤</button>
    </form>
  )
}
