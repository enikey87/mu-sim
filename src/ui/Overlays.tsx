import { useRef } from 'react'
import { useGame } from './useGame'
import { useModal } from './useModal'
import { viewOf } from './view'

export function Toast() {
  const game = useGame()
  return <div className={'toast' + (game.ui.toast ? '' : ' hidden')} id="toast" role="status">{game.ui.toast}</div>
}

/** Уведомление телефона, выезжает сверху. */
export function Notification() {
  const game = useGame()
  const n = game.ui.notif
  return (
    <div className={'notif' + (n ? ' show' : '')} id="notif" onClick={() => game.dismissNotif()} role="alert" aria-hidden={!n}>
      {n && (
        <>
          <div className="n-icon">{n.icon}</div>
          <div className="n-body">
            <div className="n-head"><b>{n.app}</b><span>сейчас</span></div>
            <div>{n.text}</div>
          </div>
        </>
      )}
    </div>
  )
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fallback ниже */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** «Телефон сел» и зарядка. */
export function DeadScreen() {
  const game = useGame()
  const active = game.battery.dead
  const dialogRef = useRef<HTMLDivElement>(null)
  useModal({ active, dialogRef })

  return (
    <div className={'dead' + (active ? '' : ' hidden')} id="deadScreen">
      {active && (
        <div
          className="dead-in"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Телефон сел"
          tabIndex={-1}
        >
          {game.battery.charging === null ? (
            <>
              <div className="dead-icon">🔌</div>
              <div>Телефон сел</div>
              <button id="chargeBtn" onClick={() => void game.battery.charge()}>Поставить на зарядку</button>
            </>
          ) : (
            <><div className="dead-icon">⚡</div><div id="chg">{game.battery.charging}%</div></>
          )}
        </div>
      )}
    </div>
  )
}

/** Экран концовки: итоги и выбор — играть дальше или заново. */
export function EndingScreen({ onReset }: { onReset: () => void }) {
  const game = useGame()
  const v = viewOf(game)
  const e = v.ending
  const active = !!e
  const dialogRef = useRef<HTMLDivElement>(null)
  useModal({
    active,
    dialogRef,
    onEscape: () => game.closeEnding(),
  })
  if (!e) return null
  return (
    <div
      className="ending"
      id="endingScreen"
      onClick={(ev) => { if (ev.target === ev.currentTarget) game.closeEnding() }}
    >
      <div
        className="ending-in"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Концовка: ${e.title}`}
        tabIndex={-1}
      >
        <div className="ending-icon">{e.icon}</div>
        <small>Концовка {v.endingCount} из {v.endingTotal}</small>
        <h2>{e.title}</h2>
        <p>{e.text}</p>
        {v.grandExcuse && (
          <>
            <blockquote className="grand" id="grandExcuse">«{v.grandExcuse}»</blockquote>
            <button
              className="secondary"
              id="copyExcuse"
              onClick={() => {
                const text = `Алик, где деньги? — великая отмазка Дня выплаты:\n«${v.grandExcuse}»`
                void copyText(text).then((ok) => game.flash(ok ? 'Скопировано' : 'Не удалось скопировать'))
              }}
            >
              Скопировать великую отмазку
            </button>
          </>
        )}
        <ul className="ending-stats">
          <li>{v.day} дней после сдачи объекта</li>
          <li>Долг Алика: {v.debt.toLocaleString('ru-RU')} ₽</li>
          <li>Обещаний в журнале: {v.promises.length}</li>
          {v.finales.map((f) => <li key={f.id}>{f.title}: «{f.finale}»</li>)}
        </ul>
        <div className="ending-btns">
          <button id="endingContinue" onClick={() => game.closeEnding()}>Играть дальше</button>
          <button className="secondary" id="endingReset" onClick={onReset}>Начать заново</button>
        </div>
      </div>
    </div>
  )
}
