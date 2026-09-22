import { useGame } from './useGame'
import { payday } from '../content/memkeys'

export function StatusBar() {
  const game = useGame()
  const low = game.S.battery <= 15
  return (
    <div className="statusbar">
      <span id="clock">{game.clockText}</span>
      <span id="gameDate">{game.gameDate}</span>
      <span>📶 <span id="bat" className={low ? 'low' : ''}>{game.S.battery}% {low ? '🪫' : '🔋'}</span></span>
    </div>
  )
}

export function ChatHeader({ onInfo }: { onInfo: () => void }) {
  const game = useGame()
  return (
    <header className="chat-head">
      <div className={'avatar' + (game.S.ram ? ' ram' : '')} id="avatar">{game.S.ram ? '🐏' : 'А'}</div>
      <div className="who">
        <div className="name">Алик Воздухонесян</div>
        <div className={'status ' + game.status.cls} id="status">{game.status.text}</div>
      </div>
      <button
        className="icon-btn"
        id="muteBtn"
        title="Звук"
        aria-label={game.S.muted ? 'Звук выключен' : 'Звук включён'}
        aria-pressed={!game.S.muted}
        onClick={() => game.toggleMute()}
      >{game.S.muted ? '🔇' : '🔊'}</button>
      <button className="icon-btn" id="infoBtn" title="Обещания и ачивки" aria-label="Обещания и ачивки" onClick={onInfo}>📋</button>
    </header>
  )
}

export function StatsBar() {
  const game = useGame()
  const S = game.S
  return (
    <div className="stats">
      <span>Долг: <b id="debt">{S.debt.toLocaleString('ru-RU')} ₽</b></span>
      <span>Дней после сдачи: <b id="days">{S.day}</b></span>
      {/* День выплаты: отсчёт накануне и счётчик «к выплате», который тает на глазах */}
      {S.scene?.id === 'payday' && Number(S.mem[payday.at]) > S.day && <span id="paydayAt">До выплаты: <b>1 день</b></span>}
      {S.scene?.id === 'payday' && S.mem[payday.sum] !== undefined && <span id="paydaySum" className="payday-sum">К выплате: <b>{Number(S.mem[payday.sum]).toLocaleString('ru-RU')} ₽</b></span>}
    </div>
  )
}
