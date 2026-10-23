// Одна реплика не спорит сама с собой (#437, #451, #462): ни строка контента, ни реплика генератора, ни функция сцены.
import { describe, it, expect } from 'vitest'
import { CLAIM_LEDGER, selfConflict } from './ledger'
import { CLAIMS } from './lies'
import { D, make } from './excuses'
import { saidClaims, saidJoin, type LedgerEvent, type Said } from './fact-types'
import type { Entry } from './fact'
import { valueOf } from '../engine/rules'
import type { ClaimKey } from './ids'
import { makeGame } from '../test/helpers'
import { forEachSceneLine } from './scene-walk'

const mods = import.meta.glob(['./**/*.ts', '!./**/*.test.ts'], { eager: true }) as Record<string, Record<string, unknown>>

const isEvent = (x: unknown): x is LedgerEvent =>
  typeof x === 'string' ? x in CLAIM_LEDGER : !!x && typeof x === 'object' && ('move' in x || 'retract' in x)
const keysOf = (e: LedgerEvent): ClaimKey[] => (typeof e === 'string' ? [e] : 'retract' in e ? [e.retract] : e.move.from === 'active' ? [e.move.to] : [e.move.from, e.move.to])

/** claims каждой строки контента: все модули `src/content`, без списка, заведённого руками. */
function lineClaims(): unknown[][] {
  const out: unknown[][] = []
  const seen = new Set<unknown>()
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object' || seen.has(v)) return
    seen.add(v)
    const claims = (v as { claims?: unknown }).claims
    if (Array.isArray(claims)) out.push(claims)
    for (const x of Object.values(v)) walk(x)
  }
  for (const m of Object.values(mods)) walk({ ...m })
  return out
}

/**
 * Реплики сцен, которые собирают функции: makeScenes на партии + перебор init-источников
 * (разные сиды open-пула). Объекты внутри makeScenes не видны glob-обходу модуля — только этот путь.
 */
function sceneFnClaims(): unknown[][] {
  const out: unknown[][] = []
  const pushClaims = (said: string | { t: string; claims?: unknown }) => {
    if (said && typeof said === 'object' && Array.isArray(said.claims)) out.push(said.claims)
  }
  forEachSceneLine(pushClaims, 24)
  return out
}

/** Все проверяемые пакеты claims: glob-модули + функции сцен. */
const allLineClaims = (): unknown[][] => [...lineClaims(), ...sceneFnClaims()]

// --- генератор отмазок: шаблон склеивает выборки из пулов в одну реплику
const SLOT = new Set(['CONSTR', 'ABSURD', 'GROT'])
const ESC = ['ESC1', 'ESC2', 'ESC3']
const pool = (k: string): Entry<Said>[] => (D[k] ?? []) as Entry<Said>[]
/** claims строки пула: у строки-срока (When) их нет — пустой список, а не падение. */
const claimsOf = (e: Entry<unknown>): LedgerEvent[] => saidClaims(valueOf(e) as Said) ?? []

type Run = (X: ReturnType<typeof make>) => Said
const RUNS = (count: number): Array<[string, Run]> => [
  ...Array.from({ length: count }, (_, i): [string, Run] => [`шаблон ${i}`, (X) => saidJoin(...X.excuse().texts)]),
  ['whyRel', (X) => X.whyRel(X.rel()).text],
  ['defend', (X) => X.defend().text],
]

type Assembly = { name: string; slots: number; claims: LedgerEvent[] }

/**
 * Все claims, которые может опубликовать каждая сборка: перебор строк с claims настоящим make().
 * Слот может взять строку из своего пула, из любого пула эскалации (ESC) и, у reason, из любого пула
 * жребия RSRC — но только ту, что пропускает фильтр `eligible`, который передаёт сам генератор.
 * Прочие ключи генератора (WHEN, REL, EVENT…) перебираются по своим строкам с claims так же: claims из них
 * рантайм-фильтр слота не видит — конфликт с ними ловит только этот тест (#462).
 * Перебор идёт по корпусу, а не по числу проб: 4000 случайных сборок игры давали 26 наборов claims,
 * полный перебор — 94, и стоит ~30 мс вместо ~1.3 с (#1279).
 */
function enumerateAssemblies(): Assembly[] {
  const out: Assembly[] = []
  let count = 1
  const runOnce = (tpl: number, run: Run, script: number[]) => {
    let n = 0, prev = '', branch: number | null = null
    const draw = (k: string, arr: readonly Entry<unknown>[], _nr?: boolean, eligible?: (e: Entry<unknown>) => boolean): unknown => {
      const was = prev
      prev = k
      if (k === 'TPL') { count = arr.length; return valueOf(arr[tpl]) }
      if (k === 'LEGROLL') return 1
      if (k === 'LONGROLL') return 0
      const ok = (e: Entry<unknown>) => eligible?.(e) ?? true
      if (SLOT.has(k) || ESC.includes(k)) {
        const pools = new Set([k, ...ESC, ...(was === 'RSRC' ? SLOT : [])])
        const neutral = pool(k).find((e) => !claimsOf(e).length)
        const opts = [neutral, ...[...pools].flatMap((p) => pool(p).filter((e) => claimsOf(e).length && ok(e)))]
        if (n === script.length) branch = opts.length
        return valueOf(opts[script[n++] ?? 0])
      }
      // Остальные ключи: на claims влияют только их строки с claims — по ним и ветвимся.
      const list = (arr ?? []) as Entry<Said>[]
      const claims = list.filter((e) => claimsOf(e).length && ok(e))
      if (!claims.length) return valueOf(list[0])
      const opts = [list[0], ...claims]
      if (n === script.length) branch = opts.length
      return valueOf(opts[script[n++] ?? 0])
    }
    const said = run(make(draw as Parameters<typeof make>[0]))
    return { said, branch, slots: n }
  }
  for (let tpl = 0; tpl < count; tpl++) {
    for (const [name, run] of RUNS(count)) {
      if (name.startsWith('шаблон') && name !== `шаблон ${tpl}`) continue
      if (!name.startsWith('шаблон') && tpl !== 0) continue
      const stack: number[][] = [[]]
      while (stack.length) {
        const script = stack.pop()!
        const r = runOnce(tpl, run, script)
        if (r.branch === null) out.push({ name, slots: r.slots, claims: saidClaims(r.said) })
        else for (let i = 0; i < r.branch; i++) stack.push([...script, i])
      }
    }
  }
  return out
}

/** Перебор считается один раз на файл: он нужен трём тестам, а стоит ~30 мс. */
let cachedAssemblies: Assembly[] | null = null
const assemblies = (): Assembly[] => (cachedAssemblies ??= enumerateAssemblies())

describe('реплика не спорит сама с собой', () => {
  it('корпус не пуст: строки контента, функции сцен и сборки генератора найдены', () => {
    expect(lineClaims().length).toBeGreaterThan(50)
    expect(sceneFnClaims().length, 'функции сцен с claims').toBeGreaterThan(0)
    const a = assemblies()
    expect(new Set(a.map((x) => x.name)).size).toBeGreaterThan(20)
    expect(a.some((x) => x.slots >= 2 && x.claims.length >= 2)).toBe(true)
  })
  it('каждое утверждение опубликовано хоть одной строкой контента', () => {
    const published = new Set(allLineClaims().flat().flatMap((e) => (isEvent(e) ? keysOf(e) : [])))
    for (const c of CLAIMS) expect(published.has(c.key), c.key).toBe(true)
  })
  it('строка контента', () => {
    const bad = allLineClaims().map((c) => [c, selfConflict(c)] as const).filter(([, why]) => why).map(([c, why]) => `${JSON.stringify(c)} — ${why}`)
    expect(bad).toEqual([])
  })
  it('реплика, которую склеивает генератор отмазок', () => {
    const bad = assemblies().map((a) => [a, selfConflict(a.claims)] as const).filter(([, why]) => why)
    expect([...new Set(bad.map(([a, why]) => `${a.name}: ${JSON.stringify(a.claims)} — ${why}`))]).toEqual([])
  })
})

describe('отмазки настоящей игры', () => {
  it('на эскалации собранная отмазка входит в проверенный перечень и не спорит сама с собой', () => {
    const { game } = makeGame({ seed: 7 })
    game.S.tier = 2
    // Перечень проверенного: все сборки генератора плюс строки контента (легендарная отмазка — одна строка,
    // её claims проверяет корпус). Проба игры сверяет модель с настоящим путём розыгрыша — охрана свойства
    // на полном переборе выше, и она не зависит от числа проб и загрузки машины (#1279).
    const known = new Set([...assemblies().map((a) => JSON.stringify(a.claims)), ...allLineClaims().map((c) => JSON.stringify(c))])
    const outside: string[] = []
    const bad: string[] = []
    for (let i = 0; i < 600; i++) {
      const claims = saidClaims(saidJoin(...game.X.excuse().texts))
      const sig = JSON.stringify(claims)
      if (!known.has(sig)) outside.push(sig)
      const why = selfConflict(claims)
      if (why) bad.push(`${sig} — ${why}`)
    }
    expect(bad).toEqual([])
    expect([...new Set(outside)], 'сборки игры вне перебора: модель отстала от генератора').toEqual([])
  })
})

describe('selfConflict', () => {
  it('ловит несовместимое и пропускает совместимое', () => {
    expect(selfConflict(['money_jar', 'money_dubai'])).toMatch(/две версии/)
    expect(selfConflict([{ move: { from: 'money_safe', to: 'money_safe' } }])).toMatch(/ту же версию/)
    expect(selfConflict([{ move: { from: 'grandpa_dead', to: 'money_safe' } }])).toMatch(/между предметами/)
    expect(selfConflict([{ retract: 'money_niva' }, 'money_niva'])).toMatch(/отзыв и утверждение/)
    expect(selfConflict([{ move: { from: 'active', to: 'money_wall' } }, 'money_jar'])).toMatch(/две версии/)
    expect(selfConflict(['nope'])).toMatch(/не событие/)
    expect(selfConflict([{ move: { from: 'money_safe', to: 'money_wall' } }, 'money_wall'])).toBeNull()
    expect(selfConflict(['money_jar', 'beton', 'sent'])).toBeNull()
    expect(selfConflict([{ retract: 'money_niva' }, 'money_foundation'])).toBeNull()
  })
})
