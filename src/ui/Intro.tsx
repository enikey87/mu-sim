// Интро новой партии: экран блокировки с обещанием завязки, 184 дня, «Мууу», титул — и само уезжает в чат.
import { useEffect, useRef, useState } from 'react'
import { useGameApi } from './useGame'
import type { IntroView } from './view'

type Phase = 'play' | 'gap' | 'title'

const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Intro({ data, gate, onDone }: { data: IntroView; gate: boolean; onDone: () => void }) {
  const game = useGameApi()
  const [started, setStarted] = useState(!gate)
  const [phase, setPhase] = useState<Phase>('play')
  const [notes, setNotes] = useState<IntroView['notes']>([])
  const [days, setDays] = useState(0)
  const [mooKey, setMooKey] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const timers = useRef<number[]>([])
  const reduced = useRef(reducedMotion()).current
  const done = useRef(false)

  const finish = (slide: boolean) => {
    if (done.current) return
    done.current = true
    for (const t of timers.current) clearTimeout(t)
    timers.current = []
    game.introDone()
    if (slide && !reduced) {
      setLeaving(true)
      timers.current.push(window.setTimeout(onDone, 450))
    } else onDone()
  }
  const finishRef = useRef(finish)
  finishRef.current = finish

  // Цепочка таймеров интро — настенные часы: это анимация для человека, а не игровой темп.
  useEffect(() => {
    if (!started) return
    const T = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms))
    if (reduced) {
      setNotes([{ icon: '💬', app: 'Алик', text: data.intro }, { icon: '💬', app: 'Вы', text: data.reply, me: true }])
      setDays(data.day)
      setPhase('gap')
      T(1500, () => setPhase('title'))
      T(3000, () => finishRef.current(false))
      return () => { for (const t of timers.current) clearTimeout(t) }
    }
    T(300, () => setNotes((n) => [{ icon: '💬', app: 'Алик', text: data.intro }, ...n]))
    T(1100, () => setNotes((n) => [{ icon: '💬', app: 'Вы', text: data.reply, me: true }, ...n]))
    T(1800, () => {
      let k = 0
      const tick = () => {
        k = Math.min(1, k + 70 / 4200)
        setDays(Math.round(data.day * k * k * (3 - 2 * k)))
        if (k < 1 && !done.current) T(70, tick)
      }
      tick()
    })
    data.notes.forEach((n, i) => T(2100 + i * 650, () => setNotes((prev) => [n, ...prev].slice(0, 6))))
    T(5000, () => { setMooKey((k) => k + 1); game.mooSound() })
    T(6300, () => setPhase('gap'))
    T(9300, () => setPhase('title'))
    T(11800, () => finishRef.current(true))
    return () => { for (const t of timers.current) clearTimeout(t) }
  }, [started, data, game, reduced])

  const tap = () => {
    if (!started) setStarted(true)
    else finishRef.current(false)
  }

  return (
    <div
      className={`intro phase-${phase}${leaving ? ' intro-leave' : ''}${reduced ? ' intro-reduced' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="Интро: коснитесь, чтобы пропустить"
      onClick={tap}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap() } }}
    >
      <div className="intro-clock">
        <div className="intro-date">{data.dateAt(days)}</div>
        <div className="intro-time">{game.clockText}</div>
      </div>
      {started && !reduced && <div className="intro-count">Дней после сдачи: <b>{days}</b></div>}
      <div className="intro-stack">
        {notes.map((n) => (
          <div className={`intro-note${n.me ? ' me' : ''}`} key={`${n.app}:${n.text}`}>
            <div className="intro-note-h"><span>{n.icon} {n.app}</span><span>сейчас</span></div>
            {n.text}
          </div>
        ))}
      </div>
      {mooKey > 0 && <div className="intro-moo" key={mooKey}>Мууууу</div>}
      <div className="intro-gap">{data.gap}</div>
      <div className="intro-title"><div className="intro-title-big">Алик,<br />где деньги?</div></div>
      {!started && <div className="intro-hint">Коснитесь, чтобы начать</div>}
    </div>
  )
}
