import { useGame } from './useGame'
import { MAX_PATIENCE } from '../engine/state'

const MOODS = ['😡', '😠', '😒', '😐', '😐', '🙂', '🙂', '😊', '😄', '🥰', '🥰']

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
      <button className="icon-btn" id="muteBtn" title="Звук" onClick={() => game.toggleMute()}>{game.S.muted ? '🔇' : '🔊'}</button>
      <button className="icon-btn" id="infoBtn" title="Обещания и ачивки" onClick={onInfo}>📋</button>
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
      <span title="Настроение Алика" id="mood">{MOODS[S.mood]}</span>
      <span title="Терпение" id="patience">{'❤️'.repeat(S.patience) + '🖤'.repeat(MAX_PATIENCE - S.patience)}</span>
    </div>
  )
}
