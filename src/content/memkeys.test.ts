// Целостность ключей памяти: ключ проверяется в конструкторе условия (is/gte/set…), а не в перечне пулов.
import { describe, it, expect, vi } from 'vitest'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Criterion, Entry, LineSpec } from '../engine/rules'
import { Gated } from '../engine/rules'
import { ACTOR_KEYS, MEM_KEYS, caughtPair } from './memkeys'
import { isFactKey } from './factkeys'

const flat = (cs: readonly Criterion[]): Criterion[] => cs.flatMap((c) => (c.op === 'all' ? flat(c.all ?? []) : [c]))
/** «Не позже n дней после события» без «событие было»: нет факта — число 0, и условие всегда истинно.
 *  `gte(since.x, 0)` нижней границей не считается: без факта оно тоже всегда истинно. */
const sinceGuarded = (where: string, cs: readonly Criterion[], bad: string[]) => {
  const all = flat(cs)
  for (const c of all) {
    if (!(c.op === '<' || c.op === '<=') || !c.key.startsWith('since.')) continue
    const ach = 'ach.' + c.key.slice('since.'.length)
    const lower = all.some((o) =>
      (o.key === c.key && (o.op === '>' || (o.op === '>=' && Number(o.value) > 0)))
      || (o.key === ach && (o.op === 'exist' || (o.op === '==' && o.value === true))))
    if (!lower) bad.push(`${where}: ${c.key} ${c.op} ${String(c.value)} без нижней границы`)
  }
}

/** Все прод-модули content/ (без тестов): новый пул подхватывается без правки списка (#218). */
const contentModules = (): string[] => {
  const root = 'src/content'
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name)
      if (e.isDirectory()) return walk(p)
      if (!e.name.endsWith('.ts') || e.name.endsWith('.test.ts')) return []
      return ['./' + relative(root, p).replace(/\\/g, '/').replace(/\.ts$/, '')]
    })
  return walk(root)
}

/** Ключи листьев условия — в том числе литералы `{ key, op }`, мимо конструкторов (#218). */
const leafKeys = (cs: readonly Criterion[]): string[] =>
  flat(cs).flatMap((c) => (c.key && c.op !== 'all' ? [c.key] : []))

describe('реестр mem-ключей', () => {
  it('ключ из конструктора условия известен реестру — любой пул, без ручного списка', async () => {
    vi.resetModules()
    const { watchFactKeys } = await import('../engine/rules/criteria')
    const keys: string[] = []
    watchFactKeys((k) => keys.push(k))
    for (const m of contentModules()) await import(m)
    // сцены строят gate при вызове makeScenes, не при импорте модуля
    const { makeScenes } = await import('./scenes')
    const { Decks } = await import('../engine/deck')
    const { seededRng } = await import('../engine/rng')
    const { make } = await import('./excuses')
    const { valueOf } = await import('../engine/rules')
    const decks = new Decks({}, seededRng(1))
    const api = make(<T>(k: string, a: readonly Entry<T>[], nr?: boolean) => decks.draw(k, a.map(valueOf), nr), () => 0, seededRng(2))
    makeScenes(api)
    watchFactKeys(null)
    const { isFactKey: check } = await import('./factkeys')
    expect(keys.filter((k) => !check(k)), 'опечатка в ключе условия/записи').toEqual([])
    expect(keys.length).toBeGreaterThan(100)
  })

  it('литеральные when в правилах — те же ключи, что и у конструкторов', async () => {
    const { allRules } = await import('./rules')
    const bad = allRules.flatMap((r) => leafKeys(r.when ?? []).filter((k) => !isFactKey(k)).map((k) => `${r.name}:${k}`))
    expect(bad).toEqual([])
  })

  it('негативный контроль: литерал с опечаткой ключа краснеет', () => {
    const typo = [{ key: 'promiseLvie', op: '==' as const, value: true }]
    expect(leafKeys(typo).filter((k) => !isFactKey(k))).toEqual(['promiseLvie'])
  })

  it('негативные контроли: опечатки из аудита и новый пул краснеют', async () => {
    vi.resetModules()
    const { watchFactKeys, is, missing, gte, exists, ne, add } = await import('../engine/rules/criteria')
    const keys: string[] = []
    watchFactKeys((k) => keys.push(k))
    is('ach.q_hsah')
    missing('ach.rdeo')
    gte('arc.betno', 1)
    is('payday.chian')
    is('newpool.typo_key') // пул, которого старый сканер не перечислял
    exists('exists.typo')
    ne('ne.typo', true)
    add('add.typo')
    watchFactKeys(null)
    const { isFactKey: check } = await import('./factkeys')
    for (const k of ['ach.q_hsah', 'ach.rdeo', 'arc.betno', 'payday.chian', 'newpool.typo_key', 'exists.typo', 'ne.typo', 'add.typo']) {
      expect(keys).toContain(k)
      expect(check(k), k).toBe(false)
    }
  })

  it('негативный контроль: модуль вне ручного списка всё равно в обходе', () => {
    const mods = contentModules()
    expect(mods).toContain('./mirror')
    expect(mods.some((m) => m.endsWith('/world') || m === './world')).toBe(true)
    expect(mods.every((m) => !m.includes('.test'))).toBe(true)
  })

  it('fx.set / state сцен — ключи из объектов: обход сцен и серий', async () => {
    const bad: string[] = []
    const see = (where: string, key: string) => { if (!isFactKey(key)) bad.push(`${where}: ${key}`) }
    const { makeScenes } = await import('./scenes')
    const { QUESTS, COURT_SCENE } = await import('./quests')
    const { PAYDAY_SCENE } = await import('./payday')
    const { Decks } = await import('../engine/deck')
    const { seededRng } = await import('../engine/rng')
    const { make } = await import('./excuses')
    const { valueOf } = await import('../engine/rules')
    const seeNode = (where: string, n: { fx?: { set?: Record<string, unknown>; during?: { key: string } } }) => {
      for (const k of Object.keys(n.fx?.set ?? {})) see(`${where}.fx.set`, k)
      if (n.fx?.during) see(`${where}.fx.during`, n.fx.during.key)
    }
    const seeScene = (where: string, sc: { nodes: Record<string, Parameters<typeof seeNode>[1]> }) => {
      for (const [nid, n] of Object.entries(sc.nodes)) seeNode(`${where}.${nid}`, n)
    }
    const decks = new Decks({}, seededRng(1))
    const api = make(<T>(k: string, a: readonly Entry<T>[], nr?: boolean) => decks.draw(k, a.map(valueOf), nr), () => 0, seededRng(2))
    for (const [qid, sc] of Object.entries(QUESTS)) seeScene(`quest.${qid}`, sc)
    seeScene('court', COURT_SCENE)
    seeScene('payday', PAYDAY_SCENE)
    for (const [sid, sc] of Object.entries(makeScenes(api))) seeScene(`scene.${sid}`, sc)
    const { ARCS } = await import('./arcs')
    const { FINALES } = await import('./finales')
    for (const [aid, arc] of Object.entries(ARCS)) {
      arc.eps.forEach((ep, i) => { if (ep.state) see(`${aid}.ep${i}.state`, ep.state.key) })
    }
    for (const [aid, finales] of Object.entries(FINALES)) {
      finales.forEach((f, i) => { if (f.state) see(`${aid}.finale${i}.state`, f.state.key) })
    }
    expect(bad).toEqual([])
  })

  it('верхняя граница since.* — только рядом с нижней; gte(..., 0) не считается', async () => {
    const { gte, lte, is } = await import('../engine/rules/criteria')
    const bad: string[] = []
    sinceGuarded('ok1', [gte('since.dead', 1), lte('since.dead', 3)], bad)
    sinceGuarded('ok2', [is('ach.dead'), lte('since.dead', 3)], bad)
    expect(bad).toEqual([])
    sinceGuarded('alone', [lte('since.dead', 3)], bad)
    expect(bad).toEqual(['alone: since.dead <= 3 без нижней границы'])
    bad.length = 0
    sinceGuarded('zero', [gte('since.dead', 0), lte('since.dead', 3)], bad)
    expect(bad).toEqual(['zero: since.dead <= 3 без нижней границы'])
  })

  it('since.* в контенте — с настоящей нижней границей', async () => {
    const bad: string[] = []
    const seeCrits = (where: string, cs?: readonly Criterion[]) => sinceGuarded(where, cs ?? [], bad)
    const seeEntry = (where: string, e: Entry<unknown>) => { if (e instanceof Gated) seeCrits(where, e.when) }
    const seeLine = (where: string, l: unknown) => {
      if (typeof l === 'string') return
      if (l instanceof Gated) { seeCrits(where, l.when); l = l.v }
      seeCrits(where, (l as LineSpec).when)
    }
    const { ARCS } = await import('./arcs')
    const { FINALES } = await import('./finales')
    const { LEGENDS } = await import('./legends')
    const { MEMORY } = await import('./memory')
    const { NOTIF } = await import('./life')
    const { MIRROR, MIRROR_AGAIN, MIRROR_OPEN } = await import('./mirror')
    const { WORLD, SPEAKS } = await import('./world')
    const { allRules } = await import('./rules')
    for (const [aid, arc] of Object.entries(ARCS)) {
      arc.follow.forEach((e, i) => seeEntry(`${aid}.follow[${i}]`, e))
      arc.eps.forEach((ep, i) => ep.m.forEach((e, j) => seeEntry(`${aid}.ep${i}.m[${j}]`, e)))
    }
    for (const [aid, finales] of Object.entries(FINALES)) {
      finales.forEach((f, i) => {
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
    for (const r of allRules) seeCrits(`rule.${r.name}`, r.when)
    for (const [k, c] of Object.entries(WORLD)) seeCrits(`WORLD.${k}`, [c])
    for (const [k, c] of Object.entries(SPEAKS)) seeCrits(`SPEAKS.${k}`, [c])
    MIRROR.forEach((e, i) => seeEntry(`mirror[${i}]`, e))
    MIRROR_AGAIN.forEach((e, i) => seeEntry(`mirrorAgain[${i}]`, e))
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
    expect(isFactKey('caught')).toBe(true)
    expect(caughtPair('alik', 'boris')).toBe('caught.alik|boris')
  })
})
