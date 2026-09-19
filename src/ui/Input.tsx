import { useState, type FormEvent } from 'react'
import { useGame } from './useGame'

/** Варианты реплик: контекстные подсвечены, грубые — красным. */
export function Choices() {
  const game = useGame()
  return (
    <div className="choices" id="choices">
      {game.choices.map((o, i) => (
        <button
          key={i + o.text}
          className={[o.tone === 'rude' ? 'rude' : '', o.scene || o.act ? 'ctx' : ''].join(' ').trim()}
          disabled={game.busy || game.dead}
          onClick={() => void game.send(o)}
        >
          {o.text}
        </button>
      ))}
    </div>
  )
}

export function Composer() {
  const game = useGame()
  const [text, setText] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = text.trim()
    if (!v || game.busy || game.dead) return
    setText('')
    void game.send(v)
  }
  return (
    <form className="composer" id="composer" onSubmit={submit}>
      <input
        id="input"
        autoComplete="off"
        maxLength={300}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={game.S.scene ? 'Выберите ответ выше или напишите своё…' : 'Сообщение…'}
        aria-label="Сообщение"
      />
      <button type="submit" id="sendBtn" disabled={game.busy || game.dead} aria-label="Отправить">➤</button>
    </form>
  )
}
