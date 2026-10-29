import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useGame } from './useGame'
import { fmtDate } from '../engine/time'
import { useModal } from './useModal'
import { viewOf, type EndingRow, type PromiseRow } from './view'
import { TrackNote } from './TrackNote'
import { useReview } from './Review'
import { shareEnding, PRIVACY_URL } from './share'

/** Значок записи журнала: свой у каждого состояния (docs/design/promise-amnesty.md). */
const due = (p: PromiseRow) => (p.due === null ? '' : ` ${fmtDate(p.due)}`)
const MARK: Record<PromiseRow['state'], (p: PromiseRow) => ReactNode> = {
  amnesty: (p) => <span className="amnesty">🕊 амнистия {fmtDate(p.amnesty!)}</span>,
  kept: (p) => <span className="kept">✅ сдержал — 50 ₽{due(p)}</span>,
  asked: (p) => <span className="asked">❓ припомнили{due(p)}</span>,
  late: (p) => <span className="late">❌ просрочено{due(p)}</span>,
  event: () => <span className="event">⏳ ждём события</span>,
  eventMet: () => <span className="eventMet">🎯 событие наступило</span>,
  someday: () => '∞ когда-нибудь',
  wait: (p) => <>⏳ ждём{due(p)}</>,
}
const mark = (p: PromiseRow) => MARK[p.state](p)

/** Две вкладки досье (#1538): «что сейчас с Аликом» отдельно от «что накоплено навсегда». */
const TABS = [
  { id: 'alik', label: 'Алик' },
  { id: 'collection', label: 'Коллекция' },
] as const
type TabId = (typeof TABS)[number]['id']

/** Досье на Алика: вкладка партии, вкладка коллекции, сброс. */
export function Sheet({ onClose, onReset }: { onClose: () => void; onReset: () => void }) {
  const game = useGame()
  const v = viewOf(game)
  const review = useReview()
  const [note, setNote] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('alik')
  const dialogRef = useRef<HTMLDivElement>(null)
  useModal({
    active: true,
    dialogRef,
    onEscape: onClose,
    returnFocus: () => document.getElementById('infoBtn'),
  })
  // Переключение вкладки начинает раздел сначала: лист не оставляет игрока в середине чужого списка.
  const pick = (id: TabId) => {
    setTab(id)
    if (dialogRef.current) dialogRef.current.scrollTop = 0
  }
  // Стрелки, Home и End ходят по вкладкам, как в табах ARIA; Tab — один стоп на всю полосу.
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab)
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % TABS.length
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i + TABS.length - 1) % TABS.length
          : e.key === 'Home' ? 0
            : e.key === 'End' ? TABS.length - 1
              : -1
    if (next < 0) return
    e.preventDefault()
    pick(TABS[next].id)
    document.getElementById(`sheetTab-${TABS[next].id}`)?.focus()
  }
  // Коллекция знает только день открытия: путь партии к старой концовке не восстановить, постер живёт без него.
  const share = async (e: EndingRow) => {
    setNote(null)
    const r = await shareEnding({ id: e.id, icon: e.icon, title: e.title, days: e.day, path: [] })
    setNote(r === 'saved' ? 'Картинка сохранена' : r === 'shared' ? 'Поделились' : r === 'failed' ? 'Не вышло поделиться' : null)
  }

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

        <div className="tabs" role="tablist" aria-label="Разделы досье" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`sheetTab-${t.id}`}
              className={tab === t.id ? 'tab on' : 'tab'}
              aria-selected={tab === t.id}
              aria-controls={`sheetPanel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => pick(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`sheetPanel-${tab}`} aria-labelledby={`sheetTab-${tab}`}>
          {tab === 'alik' ? (
            <>
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

              <h3>Акт сверки <small>бухгалтерия Нуне</small></h3>
              <ul id="act" className="list">
                {v.act.map((a, i) => (
                  <li key={i}>{a.text}</li>
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

              <h3>Трофеи</h3>
              <ul id="items" className="list">
                {v.items.length ? v.items.map((it, i) => <li key={i}>📦 {it}</li>) : <li className="locked">Ничего. Даже барана.</li>}
              </ul>
            </>
          ) : (
            <>
              <h3>Концовки <span id="endCount">{v.endingCount}/{v.endingTotal}</span></h3>
              <div id="endings" className="tiles" role="list">
                {v.endings.map((e) => (
                  <div key={e.id} role="listitem" className={e.got ? 'tile' : 'tile locked'}>
                    <span className="tile-icon">{e.got ? e.icon : '🔒'}</span>
                    <span className="tile-name">{e.got ? <b>{e.title}</b> : '???'}</span>
                    {e.got && (
                      <button
                        type="button"
                        className="tile-share"
                        aria-label={`Поделиться концовкой «${e.title}»`}
                        onClick={() => void share(e)}
                      >Поделиться</button>
                    )}
                  </div>
                ))}
              </div>
              {note && <p className="share-note" aria-live="polite">{note}</p>}

              <h3>Ачивки <span id="achCount">{v.achGot}/{v.achTotal}</span></h3>
              <div id="achList" className="tiles" role="list">
                {v.ach.map((a) => (
                  // Скрытая неполученная не называет ни имени, ни условия — только замок и «???» (#1538).
                  <div key={a.id} role="listitem" className={a.got ? 'tile' : 'tile locked'}>
                    <span className="tile-icon">{a.got ? '🏆' : '🔒'}</span>
                    {a.got || !a.hidden ? (
                      <>
                        <span className="tile-name"><b>{a.title}</b></span>
                        <span className="tile-desc">{a.desc}</span>
                      </>
                    ) : (
                      <span className="tile-name">???</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <TrackNote />
        {/* Страница «О игре и приватности» (#1484): тихая строка под счётчиком, в новой вкладке —
            WebView площадок уводит ссылку из игры, а не затирает партию. */}
        <p className="privacy-link">
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">О игре и приватности</a>
        </p>
        {review && (
          <>
            <h3>Рецензирование</h3>
            <div className="review-row">
              <button id="reviewToggle" className={review.enabled ? 'review-on' : ''} onClick={review.toggle}>
                Рецензирование: {review.enabled ? 'вкл' : 'выкл'}
              </button>
              <button id="reviewExport" onClick={review.exportNow} disabled={review.notes.length === 0}>
                Экспорт рецензии{review.notes.length ? ` (${review.notes.length})` : ''}
              </button>
            </div>
          </>
        )}
        <button className="danger" id="resetBtn" onClick={onReset}>Начать заново</button>
      </div>
    </div>
  )
}
