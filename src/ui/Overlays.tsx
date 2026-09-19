import { useGame } from './useGame'

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
