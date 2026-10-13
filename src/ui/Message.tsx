import { memo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Msg } from '../engine/state'
import { useGame, useGameApi } from './useGame'
import { PhotoSvg } from './PhotoSvg'
import { copyText } from './Overlays'

/** Счётчик рендеров Message — только в test. */
export const messageRenderStats = { count: 0 }

/** Сколько держим палец, прежде чем жест считается копированием. */
export const LONG_PRESS_MS = 450
/** Насколько палец может уехать, пока держим, чтобы жест остался копированием. */
const LONG_PRESS_SLOP = 12

/** Что жест уносит в буфер: ровно то, что видно в пузыре, без кнопок и без префикса «Алик:» (#634).
 *  Своя реплика, удалённое, голосовое, системная строка, разделитель и карточка телефона — null: жест молчит. */
export function copyableTextOf(m: Msg): string | null {
  switch (m.kind) {
    case 'text':
      if (m.deleted || m.from !== 'alik') return null
      return m.text
    case 'transfer':
      return `${m.amount ?? 50} ₽\n«${m.text}»`
    case 'sticker':
      return `${m.e} ${m.c}`
    case 'photo':
    case 'fwd':
    case 'job':
      return m.text
    case 'doc':
      return [
        m.title,
        ...m.rows.map(([n, v]) => `${n} −${v.toLocaleString('ru-RU')} ₽`),
        `Итого в пользу Алика ${m.total.toLocaleString('ru-RU')} ₽`,
      ].join('\n')
    default:
      return null
  }
}

/** Ссылка в системной строке — настоящая: вкладка открывается рядом, игра остаётся открытой. */
const linkified = (text: string) => text.split(/(https?:\/\/\S+)/).map((part, i) => (i % 2
  ? <a key={i} href={part} target="_blank" rel="noopener">{part}</a>
  : part))

/** Смешную реплику можно унести в буфер: долгое удержание и контекстное меню — один и тот же жест (#634).
 *  Палец уехал или жест отпущён раньше срока — копирования нет; воспроизведение голосового остаётся нажатием. */
function usePressToCopy(text: string | null, game: ReturnType<typeof useGameApi>) {
  const timer = useRef<number | null>(null)
  const from = useRef<{ id: number; x: number; y: number } | null>(null)

  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    from.current = null
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') return
    stop()
    from.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    timer.current = window.setTimeout(() => {
      timer.current = null
      if (!text) return
      void copyText(text).then((ok) => game.flash(ok ? 'Скопировано' : 'Не удалось скопировать'))
    }, LONG_PRESS_MS)
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const start = from.current
    if (!start || start.id !== e.pointerId) return
    if (Math.abs(e.clientX - start.x) > LONG_PRESS_SLOP || Math.abs(e.clientY - start.y) > LONG_PRESS_SLOP) stop()
  }

  const onPointerUp = () => stop()
  const onPointerCancel = () => stop()
  /** Контекстное меню на пузыре копирует; на своём, удалённом, голосовом, системной строке и карточке — молчит. */
  const onContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault()
    if (!text) return
    void copyText(text).then((ok) => game.flash(ok ? 'Скопировано' : 'Не удалось скопировать'))
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu }
}

/** Одно сообщение чата: разделитель даты, системное или пузырь (текст, перевод, голосовое, стикер…). */
export const Message = memo(function Message({ m }: { m: Msg }) {
  if (import.meta.env.MODE === 'test') messageRenderStats.count++
  const game = useGameApi()
  // жест копирования считаем до ранних возвратов: хуки — одни и те же на каждом рендере
  const copyable = copyableTextOf(m)
  const press = usePressToCopy(copyable, game)
  if (m.kind === 'sep') return <div className="sep">{m.text}</div>
  if (m.kind === 'sys') return <div className={'sys' + (m.unread ? ' unread' : '')}>{linkified(m.text)}</div>
  if (m.kind === 'lend50') return <Lend50Card m={m} />
  if (m.kind === 'card') return <PhoneCard m={m} />

  const cls = ['msg', m.from]
  // легендарная отмазка рамкой не отмечается: в ленте она неотличима от обычной реплики (#638)
  if (m.kind === 'text' && m.deleted) cls.push('deleted')
  if (['transfer', 'photo', 'sticker', 'fwd', 'doc'].includes(m.kind)) cls.push(m.kind)
  const who = m.kind === 'text' ? game.castOf(m.who) : undefined

  return (
    <div
      className={cls.join(' ')}
      data-testid="msg"
      {...press}
    >
      {who && <div className="who-name" style={{ color: who.color }}>{who.name}</div>}
      <div>{body(m, game)}</div>
      <div className="meta">
        {(m.kind === 'text' && m.edited ? 'изменено ' : '') + (m.time ?? '') + (m.from === 'me' ? ' ✓✓' : '')}
      </div>
      {m.kind === 'text' && m.react && <div className="react">{m.react}</div>}
    </div>
  )
})

/** Честная просьба поддержать автора: одна карточка в цвете перевода, кнопка-ссылка вместо голого адреса (#616).
 *  Текст — голос игры (не пузырь Алика), сумма — крупно, как в переводе; адрес видно мелким текстом. */
function Lend50Card({ m }: { m: Extract<Msg, { kind: 'lend50' }> }) {
  return (
    <div className="lend50 transfer" data-testid="lend50-card">
      <div className="sum">50 ₽</div>
      <div>{m.text}</div>
      <a className="lend50-btn" href={m.link} target="_blank" rel="noopener">Перевести</a>
      <div className="lend50-url">{m.link}</div>
    </div>
  )
}

/** Банк, мама, Авито — компактная карточка посреди ленты: не реплика Алика и не игрока, нажимать не нужно (#287). */
function PhoneCard({ m }: { m: Extract<Msg, { kind: 'card' }> }) {
  const game = useGame()
  const off = game.ui.busy || game.battery.dead
  const o = m.offer
  return (
    <div className="card" data-testid="card">
      <div className="card-head"><span>{m.icon} {m.app}</span><span>{m.time}</span></div>
      <div>{m.text}</div>
      {m.lines?.map((l) => <div className="card-line" key={l}>{l}</div>)}
      {o && !m.answered && (
        <div className="job-btns card-btns">
          {o.take && <button disabled={off} onClick={() => game.answerCard(m.id, 'take')}>{o.take}</button>}
          {o.sell && <button disabled={off} onClick={() => game.answerCard(m.id, 'sell')}>{o.sell}</button>}
          <button disabled={off} onClick={() => game.answerCard(m.id, 'later')}>Не сейчас</button>
        </div>
      )}
      {m.result && <div className="card-line card-result">{m.result}</div>}
    </div>
  )
}

function JobButtons({ id }: { id: number }) {
  const game = useGame()
  return (
    <div className="job-btns">
      <button disabled={game.ui.busy || game.battery.dead} onClick={() => void game.answerJob(id, true)}>Ладно, сделаю</button>
      <button disabled={game.ui.busy || game.battery.dead} onClick={() => void game.answerJob(id, false)}>Нет, сначала деньги</button>
      {game.canMirror() && <button disabled={game.ui.busy || game.battery.dead} onClick={() => void game.answerJob(id, 'mirror')}>Не могу, брат…</button>}
    </div>
  )
}

function body(m: Msg, game: ReturnType<typeof useGameApi>) {
  switch (m.kind) {
    case 'text':
      return m.deleted ? '🚫 Сообщение удалено' : m.text
    case 'transfer':
      return (<><div>💸 Вам перевод</div><div className="sum">{m.amount ?? 50} ₽</div><div>«{m.text}»</div></>)
    case 'voice':
      return (
        <div
          className="voice"
          role="button"
          tabIndex={0}
          aria-label="Голосовое сообщение"
          onClick={() => game.playVoice(m)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              game.playVoice(m)
            }
          }}
        >
          <div className="play">▶</div><div className="wave">▂▃▅▂▇▃▂▅▆▃▂▅▃▇▂</div><div>0:{m.len}</div>
        </div>
      )
    case 'photo':
      return (<>{m.text}<PhotoSvg /><div className="cap">платёжка.jpg</div></>)
    case 'sticker':
      return (<><div className="st-e">{m.e}</div><div className="st-c">{m.c}</div></>)
    case 'fwd':
      return (<><div className="fwd-from">↪ Переслано от: {m.f}</div><div>{m.text}</div></>)
    case 'doc':
      return (
        <>
          <div className="doc-title">📄 {m.title}</div>
          {m.rows.map(([n, v]) => (
            <div className="doc-row" key={n}><span>{n}</span><b>−{v.toLocaleString('ru-RU')} ₽</b></div>
          ))}
          <div className="doc-row doc-total"><span>Итого в пользу Алика</span><b>{m.total.toLocaleString('ru-RU')} ₽</b></div>
          <div className="doc-stamp">🐏 УТВЕРЖДАЮ</div>
        </>
      )
    case 'job':
      return (
        <>
          {m.text}
          {!m.answered && <JobButtons id={m.id} />}
        </>
      )
  }
}
