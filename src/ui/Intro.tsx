// Интро v2: пять строк-титров на экране блокировки, по одной; титул — последняя; уезд в чат.
// Разметку, тайминги и поведение держит src/intro/mount.ts — тот же модуль играет титры шелла
// холодной загрузки (#1444). Здесь только мост к игре: звук, отметка «показано», снятие экрана.
import { useEffect, useRef } from 'react'
import { useGameApi } from './useGame'
import { mountIntro } from '../intro/mount'
import { introLinesOf } from '../intro/cards'
import { isOn } from '../analytics/metrics'
import type { IntroView } from './view'

export function Intro({ data, gate, onDone }: { data: IntroView; gate: boolean; onDone: () => void }) {
  const game = useGameApi()
  const host = useRef<HTMLDivElement>(null)
  // пролог не меняется по ходу партии: снимок строк и часов берётся один раз, иначе цепочка перезапустится
  const first = useRef({ data, gate, clock: game.clockText, note: isOn(), moo: () => game.mooSound(), done: () => game.introDone(), gone: onDone })
  useEffect(() => {
    const parent = host.current
    if (!parent) return
    const s = first.current
    const intro = mountIntro(parent, {
      lines: introLinesOf(s.data),
      date: s.data.date,
      clock: s.clock,
      gate: s.gate,
      onMoo: s.moo,
      onFinish: s.done,
      onGone: s.gone,
      trackNote: s.note,
    })
    return () => intro.remove()
  }, [])
  return <div ref={host} className="intro-host" />
}
