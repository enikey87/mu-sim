import { memo } from 'react'
import type { Msg } from '../engine/state'
import { useGame, useGameApi } from './useGame'
import { PhotoSvg } from './PhotoSvg'

/** Счётчик рендеров Message — только в test. */
export const messageRenderStats = { count: 0 }

/** Одно сообщение чата: разделитель даты, системное или пузырь (текст, перевод, голосовое, стикер…). */
export const Message = memo(function Message({ m }: { m: Msg }) {
  if (import.meta.env.MODE === 'test') messageRenderStats.count++
  const game = useGameApi()
  if (m.kind === 'sep') return <div className="sep">{m.text}</div>
  if (m.kind === 'sys') return <div className={'sys' + (m.unread ? ' unread' : '')}>{m.text}</div>

  const cls = ['msg', m.from]
  if (m.kind === 'text' && m.legend) cls.push('legend')
  if (m.kind === 'text' && m.deleted) cls.push('deleted')
  if (['transfer', 'photo', 'sticker', 'fwd', 'doc'].includes(m.kind)) cls.push(m.kind)
  const who = m.kind === 'text' ? game.castOf(m.who) : undefined

  return (
    <div className={cls.join(' ')} data-testid="msg">
      {who && <div className="who-name" style={{ color: who.color }}>{who.name}</div>}
      <div>{body(m, game)}</div>
      <div className="meta">
        {(m.kind === 'text' && m.edited ? 'изменено ' : '') + (m.time ?? '') + (m.from === 'me' ? ' ✓✓' : '')}
      </div>
      {m.kind === 'text' && m.react && <div className="react">{m.react}</div>}
    </div>
  )
})

function JobButtons({ id }: { id: number }) {
  const game = useGame()
  return (
    <div className="job-btns">
      <button disabled={game.busy || game.dead} onClick={() => void game.answerJob(id, true)}>Ладно, сделаю</button>
      <button disabled={game.busy || game.dead} onClick={() => void game.answerJob(id, false)}>Нет, сначала деньги</button>
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
