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
