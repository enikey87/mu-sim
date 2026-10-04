// Целостность ключей памяти: ключ проверяется в конструкторе условия (is/gte/set…), а не в перечне пулов.
import { describe, it, expect, vi } from 'vitest'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Criterion, Entry } from '../engine/rules'
import { Gated } from '../engine/rules'
import { ACTOR_KEYS, MEM_KEYS } from './memkeys'
import { isFactKey } from './factkeys'
import { momDachaAt, momDachaDays } from './credit'
import { daySinceEvent } from '../engine/rules/days-since'

const flat = (cs: readonly Criterion[]): Criterion[] => cs.flatMap((c) => (c.op === 'all' ? flat(c.all ?? []) : [c]))
/** Ключ счётчика «дней с события» → ключ самого события: реестр registerDaysSince + since.* (#496). */
const eventOfCounter = (key: string): string | null => daySinceEvent(key)
/** «Не позже n дней после события» без «событие было»: нет факта — нет значения, и условие ложно. */
const sinceGuarded = (where: string, cs: readonly Criterion[], bad: string[]) => {
  const all = flat(cs)
  for (const c of all) {
    if (!(c.op === '<' || c.op === '<=')) continue
    const event = eventOfCounter(c.key)
    if (!event) continue
    const lower = all.some((o) =>
      (o.key === c.key && (o.op === '>' || (o.op === '>=' && Number(o.value) > 0)))
      || (o.key === event && (o.op === 'exist' || (o.op === '==' && o.value === true))))
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

const criterionOps = new Set(['==', '!=', '<', '<=', '>', '>=', 'exist', '!exist', 'match', 'all'])
const isCriterion = (v: unknown): v is Criterion => {
  if (!v || typeof v !== 'object') return false
  const o = v as { key?: unknown; op?: unknown }
  return typeof o.key === 'string' && typeof o.op === 'string' && criterionOps.has(o.op)
}

/** Рекурсивный обход экспорта production-модуля: новые пулы и standalone Criterion входят автоматически. */
const scanSince = (value: unknown, where: string, bad: string[], seen = new WeakSet<object>()): void => {
  if (!value || typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)
  if (value instanceof Gated) {
    sinceGuarded(`${where}.gate`, value.when, bad)
    scanSince(value.v, `${where}.value`, bad, seen)
    return
  }
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(isCriterion)) {
      sinceGuarded(where, value, bad)
      return
    }
    value.forEach((item, i) => scanSince(item, `${where}[${i}]`, bad, seen))
    return
  }
  if (isCriterion(value)) {
    sinceGuarded(where, [value], bad)
    return
  }
  for (const [key, child] of Object.entries(value)) scanSince(child, `${where}.${key}`, bad, seen)
}

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

  it('верхняя граница since.* — sinceWithin; сырой lte(since) не компилируется', async () => {
    const { sinceWithin, gte, is } = await import('./typed-criteria')
    const bad: string[] = []
    sinceGuarded('ok1', sinceWithin('dead', 3), bad)
    sinceGuarded('ok2', [is('ach.dead'), ...sinceWithin('dead', 3).slice(1)], bad)
    // sinceWithin уже с нижней; gte+is варианты
    sinceGuarded('ok3', [gte('since.dead', 1), ...sinceWithin('dead', 3).slice(1)], bad)
    expect(bad).toEqual([])
  })

  it('NC: since.* без настоящей нижней границы краснеет — литерал, одиночная верхняя и gte(0)', () => {
    const bad: string[] = []
    sinceGuarded('literal', [{ key: 'since.redo', op: '<=', value: 3 }], bad)
    sinceGuarded('alone', [{ key: 'since.dead', op: '<=', value: 3 }], bad)
    sinceGuarded('zero', [{ key: 'since.dead', op: '>=', value: 0 }, { key: 'since.dead', op: '<=', value: 3 }], bad)
    expect(bad).toEqual([
      'literal: since.redo <= 3 без нижней границы',
      'alone: since.dead <= 3 без нижней границы',
      'zero: since.dead <= 3 без нижней границы',
    ])
  })

  it('счётчик дней без события — нет значения; верхняя граница ложна (#496)', async () => {
    const { makeGame } = await import('../test/helpers')
    const { test: holds } = await import('./fact')
    const { game } = makeGame()
    delete game.S.mem[momDachaAt]
    expect(game.facts()[momDachaDays]).toBeUndefined()
    expect(holds({ key: momDachaDays, op: '<=', value: 40 }, game.lineFacts())).toBe(false)
    delete game.S.mem['alik.day']
    expect(game.facts().sinceAlik).toBeUndefined()
    expect(holds({ key: 'sinceAlik', op: '<=', value: 3 }, game.lineFacts())).toBe(false)
    const bad: string[] = []
    sinceGuarded('dacha', [{ key: momDachaDays, op: '<=', value: 40 }], bad)
    sinceGuarded('dachaOk', [{ key: momDachaAt, op: 'exist' }, { key: momDachaDays, op: '<=', value: 40 }], bad)
    sinceGuarded('alik', [{ key: 'sinceAlik', op: '<=', value: 3 }], bad)
    expect(bad).toEqual([
      'dacha: mom.dacha.days <= 40 без нижней границы',
      'alik: sinceAlik <= 3 без нижней границы',
    ])
  })

  it('движок пишет и читает только ключи памяти из реестра (#473/#496)', async () => {
    const { botTurn } = await import('../tools/bot')
    const { makeGame } = await import('../test/helpers')
    const { watchFactKeys, test: holds } = await import('../engine/rules')
    const keys = new Set<string>()
    watchFactKeys((k) => keys.add(k))
    for (const seed of [1, 2, 3, 5, 8]) {
      const { game } = makeGame({ seed })
      game.S.mem = new Proxy(game.S.mem, {
        get: (t, p) => { if (typeof p === 'string' && p !== 'toJSON') keys.add(p); return Reflect.get(t, p) as unknown },
        set: (t, p, v: unknown) => { if (typeof p === 'string' && p !== 'toJSON') keys.add(p); return Reflect.set(t, p, v) },
      })
      // хаб держит исходный mem — переподключим, иначе чтения через holds не видны Proxy (#496)
      ;(game as { rules: { hub: { world: typeof game.S.mem } } }).rules.hub.world = game.S.mem
      for (let i = 0; i < 150; i++) await botTurn(game)
    }
    // NC: holds незарегистрированного ключа попадает в сверку
    holds({ key: 'probe.read', op: 'exist' }, {})
    expect(keys.has('probe.read')).toBe(true)
    watchFactKeys(null)
    expect([...keys].filter((k) => k !== 'probe.read' && !isFactKey(k)), 'ключ памяти, которого реестр не знает').toEqual([])
    expect(keys.size).toBeGreaterThan(50)
  }, 60_000)

  it('since.* в контенте — с настоящей нижней границей', async () => {
    const bad: string[] = []
    for (const path of contentModules()) scanSince(await import(path), path, bad)
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
  })
})
