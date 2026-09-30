// Интро v2: пять строк-титров на экране блокировки, по одной; титул — последняя; уезд в чат.
import { useEffect, useRef, useState } from 'react'
import { useGameApi } from './useGame'
import type { IntroView } from './view'

/** Карточки 0–3 — строки ~1,8 с; 4 — титул ~2,5 с. */
type Card = 0 | 1 | 2 | 3 | 4

const LINE_MS = 1800
const TITLE_MS = 2500

const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Intro({ data, gate, onDone }: { data: IntroView; gate: boolean; onDone: () => void }) {
  const game = useGameApi()
  const [started, setStarted] = useState(!gate)
  const [card, setCard] = useState<Card>(0)
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

  // Цепочка карточек — настенные часы: анимация для человека, не игровой темп.
  useEffect(() => {
    if (!started) return
    const T = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms))
    T(LINE_MS, () => setCard(1))
    T(LINE_MS * 2, () => setCard(2))
    T(LINE_MS * 3, () => setCard(3))
    T(LINE_MS * 4, () => {
      setCard(4)
      game.mooSound()
    })
    T(LINE_MS * 4 + TITLE_MS, () => finishRef.current(!reduced))
    return () => { for (const t of timers.current) clearTimeout(t) }
  }, [started, game, reduced])

  const tap = () => {
    if (!started) setStarted(true)
    else finishRef.current(false)
  }

  const lines = [
    'Вы положили плитку на объекте Алика.',
    `Объект сдан ${data.date}.`,
    `Алик: «${data.vow}»`,
    data.gap,
  ]

  return (
    <div
      className={`intro card-${card}${leaving ? ' intro-leave' : ''}${reduced ? ' intro-reduced' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="Интро: коснитесь, чтобы пропустить"
      onClick={tap}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap() } }}
    >
      <div className="intro-clock">
        <div className="intro-date">{data.date}</div>
        <div className="intro-time">{game.clockText}</div>
      </div>
      {started && lines.map((text, i) => (
        <div key={i} className={`intro-line${card === i ? ' on' : ''}`}>{text}</div>
      ))}
      {started && (
        <div className={`intro-title${card === 4 ? ' on' : ''}`}>
          <div className="intro-title-big">Алик,<br />где деньги?</div>
          {card === 4 && <div className="intro-moo">Мууууу</div>}
        </div>
      )}
      {!started && <div className="intro-hint">Коснитесь, чтобы начать</div>}
    </div>
  )
}
