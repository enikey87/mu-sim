import { useGame } from './useGame'
import { ACH } from '../content/achievements'
import { ARCS } from '../content/arcs'
import { ENDINGS } from '../content/finales'
import { fmtDate } from '../engine/time'

/** Досье на Алика: обещания, сериалы, трофеи, ачивки, сброс. */
export function Sheet({ onClose, onReset }: { onClose: () => void; onReset: () => void }) {
  const game = useGame()
  const S = game.S
  const got = Object.keys(S.ach).length
  return (
    <div className="sheet" id="sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sheet-inner" role="dialog" aria-label="Досье на Алика">
        <div className="sheet-head"><b>Досье на Алика</b><button className="icon-btn" id="closeSheet" onClick={onClose} aria-label="Закрыть">✕</button></div>

        <h3>Журнал обещаний</h3>
        <ul id="promises" className="list">
          {S.promises.length === 0 && <li className="locked">Пока пусто. Напиши Алику.</li>}
          {S.promises.slice().reverse().map((p, i) => {
            const late = p.due != null && p.due < S.day
            return (
              <li key={i}>
                «{p.t}» <br />
                <small>{late ? <span className="late">❌ просрочено</span> : '⏳'} срок: {p.due == null ? '∞ когда-нибудь' : fmtDate(p.due)}</small>
              </li>
            )
          })}
        </ul>

        <h3>Сериалы</h3>
        <ul id="arcs" className="list">
          {Object.entries(ARCS).map(([id, a]) => {
            const i = S.arcs[id]?.i ?? 0
            return i
              ? <li key={id}>{i >= a.eps.length ? '✅' : '📺'} <b>{a.title}</b> — {game.finaleTitle(id) ? `финал «${game.finaleTitle(id)}»` : `серия ${i}/${a.eps.length}`}</li>
              : <li key={id} className="locked">🔒 ???</li>
          })}
        </ul>

        <h3>Концовки <span id="endCount">{Object.keys(S.endings).length}/{ENDINGS.length}</span></h3>
        <ul id="endings" className="list">
          {ENDINGS.map((e) => (
            <li key={e.id} className={S.endings[e.id] ? '' : 'locked'}>{S.endings[e.id] ? <>{e.icon} <b>{e.title}</b></> : '🔒 ???'}</li>
          ))}
        </ul>

        <h3>Трофеи</h3>
        <ul id="items" className="list">
          {S.items.length ? S.items.map((it, i) => <li key={i}>📦 {it}</li>) : <li className="locked">Ничего. Даже барана.</li>}
        </ul>

        <h3>Ачивки <span id="achCount">{got}/{Object.keys(ACH).length}</span></h3>
        <ul id="achList" className="list">
          {Object.entries(ACH).map(([k, [title, desc]]) => (
            <li key={k} className={S.ach[k] ? '' : 'locked'}>{S.ach[k] ? '🏆' : '🔒'} <b>{title}</b> — {desc}</li>
          ))}
        </ul>
        <button className="danger" id="resetBtn" onClick={onReset}>Начать заново</button>
      </div>
    </div>
  )
}
