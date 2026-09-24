// Целостность ключей памяти: ни один контентный ключ (условие, запись, fx, state) не обходит реестр.
import { describe, it, expect } from 'vitest'
import { criterionKeys, Gated, valueOf, type Entry, type Criterion, type FactOp, type LineSpec } from '../engine/rules'
import { Decks } from '../engine/deck'
import { seededRng } from '../engine/rng'
import { make } from './excuses'
import { makeScenes, type Scene, type SceneNode } from './scenes'
import { ARCS, type Episode } from './arcs'
import { FINALES } from './finales'
import { LEGENDS } from './legends'
import { MEMORY } from './memory'
import { NOTIF } from './life'
import { QUESTS, COURT_SCENE } from './quests'
import { PAYDAY_SCENE } from './payday'
import { ACTOR_KEYS, MEM_KEYS, caughtPair } from './memkeys'
import { isFactKey } from './factkeys'
import { allRules } from './rules'
import { WORLD, SPEAKS } from './world'
import { MIRROR, MIRROR_OPEN } from './mirror'

const bad: string[] = []
const see = (where: string, key: string) => { if (!isFactKey(key)) bad.push(`${where}: ${key}`) }
const flat = (cs: readonly Criterion[]): Criterion[] => cs.flatMap((c) => (c.op === 'all' ? flat(c.all ?? []) : [c]))
/** «Не позже n дней после события» без «событие было»: нет факта — число 0, и условие всегда истинно. */
const sinceGuarded = (where: string, cs: readonly Criterion[]) => {
  const all = flat(cs)
  for (const c of all) {
    if (!(c.op === '<' || c.op === '<=') || !c.key.startsWith('since.')) continue
    const ach = 'ach.' + c.key.slice('since.'.length)
    const lower = all.some((o) => (o.key === c.key && (o.op === '>' || o.op === '>=')) || (o.key === ach && (o.op === 'exist' || (o.op === '==' && o.value === true))))
    if (!lower) bad.push(`${where}: ${c.key} ${c.op} ${String(c.value)} без нижней границы`)
  }
}
const seeCrits = (where: string, cs?: readonly Criterion[]) => { for (const k of criterionKeys(cs ?? [])) see(where, k); sinceGuarded(where, cs ?? []) }
const seeOps = (where: string, ops?: readonly FactOp[]) => { for (const o of ops ?? []) see(where, o.key) }
const seeEntry = (where: string, e: Entry<unknown>) => { if (e instanceof Gated) seeCrits(where, e.when) }
const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])
const seeLine = (where: string, l: unknown) => {
  if (typeof l === 'string') return
  if (l instanceof Gated) { seeCrits(where, l.when); l = l.v }
  const s = l as LineSpec
  seeCrits(where, s.when)
  seeOps(where, s.remember)
}
const seeEpisode = (where: string, ep: Episode) => {
  seeOps(`${where}.remember`, ep.remember)
  if (ep.state) see(`${where}.state`, ep.state.key)
  ep.m.forEach((e, i) => seeEntry(`${where}.m[${i}]`, e))
}
const seeNode = (where: string, n: SceneNode) => {
  for (const e of [...(n.a ?? []), ...(n.a2 ?? [])]) seeEntry(where, e)
  for (const e of [...asArray(n.sys), ...asArray(n.sys2)]) seeEntry(where, e)
  for (const k of Object.keys(n.fx?.set ?? {})) see(`${where}.fx.set`, k)
  if (n.fx?.during) see(`${where}.fx.during`, n.fx.during.key)
}
const seeScene = (where: string, sc: Scene) => { for (const [nid, n] of Object.entries(sc.nodes)) seeNode(`${where}.${nid}`, n) }

const api = (seed = 1, tier = 0) => {
  const decks = new Decks({}, seededRng(seed))
  return make(<T>(k: string, a: readonly Entry<T>[], nr?: boolean) => decks.draw(k, a.map(valueOf), nr), () => tier, seededRng(seed + 1))
}

describe('реестр mem-ключей', () => {
  it('все ключи контента известны реестру', () => {
    for (const [aid, arc] of Object.entries(ARCS)) {
      arc.follow.forEach((e, i) => seeEntry(`${aid}.follow[${i}]`, e))
      arc.eps.forEach((ep, i) => seeEpisode(`${aid}.ep${i}`, ep))
    }
    for (const [aid, finales] of Object.entries(FINALES)) {
      finales.forEach((f, i) => {
        seeEpisode(`${aid}.finale${i}`, f)
        seeCrits(`${aid}.finale${i}.when`, f.when)
        seeCrits(`${aid}.finale${i}.orWhen`, f.orWhen)
        f.done.forEach((e, j) => seeEntry(`${aid}.finale${i}.done[${j}]`, e))
      })
    }
    for (const [lid, legend] of Object.entries(LEGENDS)) {
      legend.lines.forEach((l, i) => seeLine(`${lid}.line${i}`, l))
      legend.talk?.forEach((e, i) => seeEntry(`${lid}.talk[${i}]`, e))
    }
    MEMORY.forEach((l, i) => seeLine(`memory[${i}]`, l))
    NOTIF.forEach((n, i) => seeLine(`notif[${i}]`, n))
    for (const [qid, sc] of Object.entries(QUESTS)) seeScene(`quest.${qid}`, sc)
    seeScene('court', COURT_SCENE)
    seeScene('payday', PAYDAY_SCENE)
    for (const [sid, sc] of Object.entries(makeScenes(api()))) seeScene(`scene.${sid}`, sc)
    for (const r of allRules) { seeCrits(`rule.${r.name}`, r.when); seeOps(`rule.${r.name}.remember`, r.remember) }
    for (const [k, c] of Object.entries(WORLD)) seeCrits(`WORLD.${k}`, [c])
    for (const [k, c] of Object.entries(SPEAKS)) seeCrits(`SPEAKS.${k}`, [c])
    MIRROR.forEach((e, i) => seeEntry(`mirror[${i}]`, e))
    seeCrits('MIRROR_OPEN', [MIRROR_OPEN])
    expect(bad).toEqual([])
  })

  it('реестр самосогласован: ключи уникальны и отделены от event-фактов', () => {
    const all = [...MEM_KEYS, ...ACTOR_KEYS]
    expect(new Set(all).size).toBe(all.length)
    for (const k of all) {
      expect(k.length).toBeGreaterThan(0)
      expect(k).not.toMatch(/[\s]/)
    }
    // exact-match раньше семейств: статический caught и пары caught.a|b — оба известны
    expect(isFactKey('caught')).toBe(true)
    expect(caughtPair('alik', 'boris')).toBe('caught.alik|boris')
  })
  it('верхняя граница since.* — только рядом с нижней: иначе «нет факта» читается как «0 дней назад»', () => {
    const { lte, gte, is } = { lte: (k: string, v: number): Criterion => ({ key: k, op: '<=', value: v }), gte: (k: string, v: number): Criterion => ({ key: k, op: '>=', value: v }), is: (k: string): Criterion => ({ key: k, op: '==', value: true }) }
    bad.length = 0
    seeCrits('ok1', [gte('since.dead', 1), lte('since.dead', 3)])
    seeCrits('ok2', [is('ach.dead'), lte('since.dead', 3)])
    expect(bad).toEqual([])
    seeCrits('alone', [lte('since.dead', 3)])
    expect(bad).toEqual(['alone: since.dead <= 3 без нижней границы'])
    bad.length = 0
  })
})
