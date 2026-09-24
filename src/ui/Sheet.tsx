import { useRef, type ReactNode } from 'react'
import { useGame } from './useGame'
import { fmtDate } from '../engine/time'
import { useModal } from './useModal'
import { viewOf, type PromiseRow } from './view'

/** Значок записи журнала: свой у каждого состояния (docs/design/promise-amnesty.md). */
const due = (p: PromiseRow) => (p.due === null ? '' : ` ${fmtDate(p.due)}`)
const MARK: Record<PromiseRow['state'], (p: PromiseRow) => ReactNode> = {
  amnesty: (p) => <span className="amnesty">🕊 амнистия {fmtDate(p.amnesty!)}</span>,
  kept: (p) => <span className="kept">✅ сдержал — 50 ₽{due(p)}</span>,
  asked: (p) => <span className="asked">❓ припомнили{due(p)}</span>,
  late: (p) => <span className="late">❌ просрочено{due(p)}</span>,
  someday: () => '∞ когда-нибудь',
  wait: (p) => <>⏳ ждём{due(p)}</>,
}
const mark = (p: PromiseRow) => MARK[p.state](p)

/** Досье на Алика: обещания, сериалы, трофеи, ачивки, сброс. */
export function Sheet({ onClose, onReset }: { onClose: () => void; onReset: () => void }) {
  const game = useGame()
  const v = viewOf(game)
  const dialogRef = useRef<HTMLDivElement>(null)
  useModal({
    active: true,
    dialogRef,
    onEscape: onClose,
    returnFocus: () => document.getElementById('infoBtn'),
  })

  return (
    <div className="sheet" id="sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        className="sheet-inner"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Досье на Алика"
        tabIndex={-1}
      >
        <div className="sheet-head"><b>Досье на Алика</b><button className="icon-btn" id="closeSheet" onClick={onClose} aria-label="Закрыть">✕</button></div>

        <h3>Журнал обещаний</h3>
        <ul id="promises" className="list">
          {v.promises.length === 0 && <li className="locked">Пока пусто. Напиши Алику.</li>}
          {v.promises.slice().reverse().map((p, i) => (
            <li key={i}>
              «{p.text}» <br />
              <small>{mark(p)}</small>
            </li>
          ))}
        </ul>

        <h3>Сериалы</h3>
        <ul id="arcs" className="list">
          {v.arcs.map((a) => (
            a.locked
              ? <li key={a.id} className="locked">🔒 ???</li>
              : <li key={a.id}>{a.done ? '✅' : '📺'} <b>{a.title}</b> — {a.state}</li>
          ))}
        </ul>

        <h3>Концовки <span id="endCount">{v.endingCount}/{v.endingTotal}</span></h3>
        <ul id="endings" className="list">
          {v.endings.map((e) => (
            <li key={e.id} className={e.got ? '' : 'locked'}>{e.got ? <>{e.icon} <b>{e.title}</b></> : '🔒 ???'}</li>
          ))}
        </ul>

        <h3>Трофеи</h3>
        <ul id="items" className="list">
          {v.items.length ? v.items.map((it, i) => <li key={i}>📦 {it}</li>) : <li className="locked">Ничего. Даже барана.</li>}
        </ul>

        <h3>Ачивки <span id="achCount">{v.achGot}/{v.achTotal}</span></h3>
        <ul id="achList" className="list">
          {v.ach.map((a) => (
            <li key={a.id} className={a.got ? '' : 'locked'}>{a.got ? '🏆' : '🔒'} <b>{a.title}</b> — {a.desc}</li>
          ))}
        </ul>
        <button className="danger" id="resetBtn" onClick={onReset}>Начать заново</button>
      </div>
    </div>
  )
}
