import { useGame } from './useGame'
import { ENDINGS } from '../content/finales'
import { ARCS } from '../content/arcs'

export function Toast() {
  const game = useGame()
  return <div className={'toast' + (game.toast ? '' : ' hidden')} id="toast" role="status">{game.toast}</div>
}

/** Уведомление телефона, выезжает сверху. */
export function Notification() {
  const game = useGame()
  const n = game.notif
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

/** «Телефон сел» и зарядка. */
export function DeadScreen() {
  const game = useGame()
  return (
    <div className={'dead' + (game.dead ? '' : ' hidden')} id="deadScreen">
      {game.dead && (
        <div className="dead-in">
          {game.charging === null ? (
            <>
              <div className="dead-icon">🔌</div>
              <div>Телефон сел</div>
              <button id="chargeBtn" onClick={() => void game.charge()}>Поставить на зарядку</button>
            </>
          ) : (
            <><div className="dead-icon">⚡</div><div id="chg">{game.charging}%</div></>
          )}
        </div>
      )}
    </div>
  )
}

/** Экран концовки: итоги и выбор — играть дальше или заново. */
export function EndingScreen({ onReset }: { onReset: () => void }) {
  const game = useGame()
  const S = game.S
  const e = ENDINGS.find((x) => x.id === S.ending)
  if (!e) return null
  const finales = Object.keys(ARCS).filter((id) => game.finaleTitle(id))
  return (
    <div className="ending" id="endingScreen" role="dialog" aria-label={`Концовка: ${e.title}`}>
      <div className="ending-in">
        <div className="ending-icon">{e.icon}</div>
        <small>Концовка {Object.keys(S.endings).length} из {ENDINGS.length}</small>
        <h2>{e.title}</h2>
        <p>{e.text}</p>
        <ul className="ending-stats">
          <li>{S.day} дней после сдачи объекта</li>
          <li>Долг Алика: {S.debt.toLocaleString('ru-RU')} ₽</li>
          <li>Обещаний в журнале: {S.promises.length}</li>
          {finales.map((id) => <li key={id}>{ARCS[id].title}: «{game.finaleTitle(id)}»</li>)}
        </ul>
        <div className="ending-btns">
          <button id="endingContinue" onClick={() => game.closeEnding()}>Играть дальше</button>
          <button className="secondary" id="endingReset" onClick={onReset}>Начать заново</button>
        </div>
      </div>
    </div>
  )
}
