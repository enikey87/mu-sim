// Интро v2: пять строк-титров на экране блокировки, по одной; титул — последняя; уезд в чат.
import { useEffect, useRef, useState } from 'react'
import { useGameApi } from './useGame'
import type { IntroView } from './view'

/** Карточки 0–3 — строки ~1,8 с; 4 — титул ~2,5 с. */
type Card = 0 | 1 | 2 | 3 | 4
type LinePhase = 'in' | 'out'

export const LINE_MS = 1800
export const FADE_MS = 280
export const TITLE_MS = 2500

const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** fmtDate уже с «г.» — не клеим вторую точку. */
export const introDateLine = (date: string): string =>
  `Объект сдан ${date.replace(/\.$/, '')}.`

/** Обещание на карточке — как реплика, с заглавной (в STARTS.vow может быть обрывок со строчной). */
export const introVowLine = (vow: string): string =>
  `Алик: «${vow.charAt(0).toUpperCase()}${vow.slice(1)}»`

export function Intro({ data, gate, onDone }: { data: IntroView; gate: boolean; onDone: () => void }) {
  const game = useGameApi()
  const [started, setStarted] = useState(!gate)
  const [card, setCard] = useState<Card>(0)
  const [linePhase, setLinePhase] = useState<LinePhase>('in')
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

  // Цепочка: удержание → затухание → следующая (без наложения). Reduced — мгновенная смена.
  useEffect(() => {
    if (!started) return
    const T = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms))
    for (let i = 1; i <= 4; i++) {
      if (!reduced) T(LINE_MS * i - FADE_MS, () => setLinePhase('out'))
      T(LINE_MS * i, () => {
        setCard(i as Card)
        setLinePhase('in')
        if (i === 4) game.mooSound()
      })
    }
    T(LINE_MS * 4 + TITLE_MS, () => finishRef.current(!reduced))
    return () => { for (const t of timers.current) clearTimeout(t) }
  }, [started, game, reduced])

  const tap = () => {
    if (!started) setStarted(true)
    else finishRef.current(false)
  }

  const lines = [
    'Вы положили плитку на объекте Алика.',
    introDateLine(data.date),
    introVowLine(data.vow),
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
      {/* одна строка: .on появляется, .out гаснет; одновременно не две (#500) */}
      {started && card < 4 && (
        <div
          key={card}
          className={`intro-line ${linePhase === 'out' ? 'out' : 'on'}`}
          data-phase={linePhase}
        >
          {lines[card]}
        </div>
      )}
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
