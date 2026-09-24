import { useGame } from './useGame'
import { viewOf } from './view'

export function StatusBar() {
  const game = useGame()
  const low = game.battery.level <= 15
  return (
    <div className="statusbar">
      <span id="clock">{game.clockText}</span>
      <span id="gameDate">{game.gameDate}</span>
      <span>📶 <span id="bat" className={low ? 'low' : ''}>{game.battery.level}% {low ? '🪫' : '🔋'}</span></span>
    </div>
  )
}

export function ChatHeader({ onInfo }: { onInfo: () => void }) {
  const game = useGame()
  const v = viewOf(game)
  return (
    <header className="chat-head">
      <div className={'avatar' + (v.ram ? ' ram' : '')} id="avatar">{v.ram ? '🐏' : 'А'}</div>
      <div className="who">
        <div className="name">Алик Воздухонесян</div>
        <div className={'status ' + game.ui.status.cls} id="status">{game.ui.status.text}</div>
      </div>
      <button
        className="icon-btn"
        id="muteBtn"
        title="Звук"
        aria-label={v.muted ? 'Звук выключен' : 'Звук включён'}
        aria-pressed={!v.muted}
        onClick={() => game.toggleMute()}
      >{v.muted ? '🔇' : '🔊'}</button>
      <button className="icon-btn" id="infoBtn" title="Обещания и ачивки" aria-label="Обещания и ачивки" onClick={onInfo}>📋</button>
    </header>
  )
}

const days = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'дня' : 'дней')

export function StatsBar() {
  const game = useGame()
  const v = viewOf(game)
  return (
    <div className="stats">
      <span>Долг: <b id="debt">{v.debt.toLocaleString('ru-RU')} ₽</b></span>
      <span>Дней после сдачи: <b id="days">{v.day}</b></span>
      {/* День выплаты: отсчёт накануне и счётчик «к выплате», который тает на глазах */}
      {v.payday.daysLeft !== null && <span id="paydayAt">До выплаты: <b>{v.payday.daysLeft} {days(v.payday.daysLeft)}</b></span>}
      {v.payday.sum !== null && <span id="paydaySum" className="payday-sum">К выплате: <b>{v.payday.sum.toLocaleString('ru-RU')} ₽</b></span>}
    </div>
  )
}
