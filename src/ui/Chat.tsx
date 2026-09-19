import { useLayoutEffect, useRef } from 'react'
import { useGame } from './useGame'
import { Message } from './Message'

/** Лента сообщений + «печатает…» + всплывающие «Мууу». */
export function Chat() {
  const game = useGame()
  const ref = useRef<HTMLElement>(null)
  const count = game.S.msgs.length

  // прокрутка вниз на каждое новое сообщение и индикатор печати
  useLayoutEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [count, game.typing])

  return (
    <main className="chat" id="chat" ref={ref}>
      <div className="moo-layer">
        {game.moos.map((m) => (
          <div key={m.id} className="moo" style={{ left: `${m.left}%`, top: `${m.top}%` }}>{m.text}</div>
        ))}
      </div>
      {game.S.msgs.map((m) => <Message key={m.id} m={m} />)}
      {game.typing && (
        <div className="typing-bubble" aria-label={game.typing}><span /><span /><span /></div>
      )}
    </main>
  )
}
