// Общий обход сцен для сторожей (#491): бросок функции варианта — красный, не молчаливый catch.
import { makeScenes, type Line, type Vars } from './scenes'
import { make } from './excuses'
import { Decks } from '../engine/deck'
import { seededRng } from '../engine/rng'
import { valueOf, type Entry } from '../engine/rules'

export type SceneVisit = {
  id: string
  node: string
  vars: Vars
}

const baseVars = (): Vars => ({ v: 1, n: 'баран', p: 'x', rows: [['a', 1]], total: 1, r: ['a', 'b', 'c'] })

const scenesOf = () => {
  const decks = new Decks({}, seededRng(1))
  const X = make(<T>(k: string, a: readonly Entry<T>[], nr?: boolean) => decks.draw(k, a.map(valueOf), nr), () => 0, seededRng(2))
  return makeScenes(X)
}

/** Каждая кнопка сцены: текст (после eval) + контекст. Бросок — наружу. */
export function forEachSceneOpt(
  visit: (ctx: SceneVisit & { text: Line }) => void,
  initSeeds = 8,
): void {
  const scenes = scenesOf()
  const openAll = <T,>(arr: readonly Entry<T>[]) => arr.map(valueOf)
  const base = baseVars()
  for (const [id, sc] of Object.entries(scenes)) {
    const list: Vars[] = sc.init
      ? Array.from({ length: initSeeds }, (_, i) => ({ ...base, ...sc.init!(seededRng(i + 1), openAll, 200) }))
      : [base]
    for (const vars of list) {
      for (const [node, n] of Object.entries(sc.nodes)) {
        for (const o of n.opts ?? []) {
          const raw = typeof o.t === 'function' ? o.t(vars) : o.t
          visit({ id, node, vars, text: raw as Line })
        }
      }
    }
  }
}

/** Реплики и кнопки сцены для claims: бросок — наружу. */
export function forEachSceneLine(
  visit: (said: string | { t: string; claims?: unknown }) => void,
  initSeeds = 24,
): void {
  const scenes = scenesOf()
  const openAll = <T,>(arr: readonly Entry<T>[]) => arr.map(valueOf)
  const base = baseVars()
  const evalLine = (l: Line, vars: Vars) => {
    const r = typeof l === 'function' ? l(vars) : l
    visit(r)
  }
  for (const sc of Object.values(scenes)) {
    const list: Vars[] = sc.init
      ? Array.from({ length: initSeeds }, (_, i) => ({ ...base, ...sc.init!(seededRng(i + 1), openAll, 200) }))
      : [base]
    const uniq = new Map(list.map((v) => [JSON.stringify(v), v]))
    for (const vars of uniq.values()) {
      for (const n of Object.values(sc.nodes)) {
        for (const e of [...(n.a ?? []), ...(n.a2 ?? [])]) evalLine(valueOf(e), vars)
        for (const s of [n.sys, n.sys2]) {
          if (!s) continue
          for (const e of (Array.isArray(s) ? s : [s])) evalLine(valueOf(e as Entry<Line>), vars)
        }
        for (const o of n.opts ?? []) {
          if (typeof o.t === 'function') evalLine(o.t, vars)
          else if (o.t) visit(typeof o.t === 'string' ? o.t : (o.t as { t: string }))
        }
      }
    }
  }
}
