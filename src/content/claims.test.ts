// Одна реплика не спорит сама с собой (#437, #451): ни строка контента, ни реплика, которую склеивает генератор отмазок.
import { describe, it, expect } from 'vitest'
import { CLAIM_LEDGER, selfConflict } from './ledger'
import { CLAIMS } from './lies'
import { D, make } from './excuses'
import { saidClaims, saidJoin, type LedgerEvent, type Said } from './fact-types'
import type { Entry } from './fact'
import { valueOf } from '../engine/rules'
import type { ClaimKey } from './ids'
import { makeGame } from '../test/helpers'

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

// --- генератор отмазок: шаблон склеивает выборки из пулов в одну реплику
const SLOT = new Set(['CONSTR', 'ABSURD', 'GROT'])
const ESC = ['ESC1', 'ESC2', 'ESC3']
const pool = (k: string): Entry<Said>[] => (D[k] ?? []) as Entry<Said>[]
const claimsOf = (e: Entry<Said>): LedgerEvent[] => saidClaims(valueOf(e))

type Run = (X: ReturnType<typeof make>) => Said
const RUNS = (count: number): Array<[string, Run]> => [
  ...Array.from({ length: count }, (_, i): [string, Run] => [`шаблон ${i}`, (X) => saidJoin(...X.excuse().texts)]),
  ['whyRel', (X) => X.whyRel(X.rel()).text],
  ['defend', (X) => X.defend().text],
]

/**
 * Все claims, которые может опубликовать каждая сборка: перебор слотов настоящим make(). Слот может взять строку
 * из своего пула, из любого пула эскалации (ESC) и, у reason, из любого пула жребия RSRC — но только ту,
 * что пропускает фильтр `eligible`, который передаёт сам генератор.
 */
function assemblies(): Array<{ name: string; slots: number; claims: LedgerEvent[] }> {
  const out: Array<{ name: string; slots: number; claims: LedgerEvent[] }> = []
  let count = 1
  const runOnce = (tpl: number, run: Run, script: number[]) => {
    let n = 0, prev = '', branch: number | null = null
    const draw = (k: string, arr: readonly Entry<unknown>[], _nr?: boolean, eligible?: (e: Entry<unknown>) => boolean): unknown => {
      const was = prev
      prev = k
      if (k === 'TPL') { count = arr.length; return valueOf(arr[tpl]) }
      if (k === 'LEGROLL') return 1
      if (k === 'LONGROLL') return 0
      if (!SLOT.has(k) && !ESC.includes(k)) return valueOf(arr[0])
      const pools = new Set([k, ...ESC, ...(was === 'RSRC' ? SLOT : [])])
      const ok = (e: Entry<Said>) => eligible?.(e as Entry<unknown>) ?? true
      const neutral = pool(k).find((e) => !claimsOf(e).length)
      const opts = [neutral, ...[...pools].flatMap((p) => pool(p).filter((e) => claimsOf(e).length && ok(e)))]
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

describe('реплика не спорит сама с собой', () => {
  it('корпус не пуст: строки контента и сборки генератора найдены', () => {
    expect(lineClaims().length).toBeGreaterThan(50)
    const a = assemblies()
    expect(new Set(a.map((x) => x.name)).size).toBeGreaterThan(20)
    expect(a.some((x) => x.slots >= 2 && x.claims.length >= 2)).toBe(true)
  })
  it('каждое утверждение опубликовано хоть одной строкой контента', () => {
    const published = new Set(lineClaims().flat().flatMap((e) => (isEvent(e) ? keysOf(e) : [])))
    for (const c of CLAIMS) expect(published.has(c.key), c.key).toBe(true)
  })
  it('строка контента', () => {
    const bad = lineClaims().map((c) => [c, selfConflict(c)] as const).filter(([, why]) => why).map(([c, why]) => `${JSON.stringify(c)} — ${why}`)
    expect(bad).toEqual([])
  })
  it('реплика, которую склеивает генератор отмазок', () => {
    const bad = assemblies().map((a) => [a, selfConflict(a.claims)] as const).filter(([, why]) => why)
    expect([...new Set(bad.map(([a, why]) => `${a.name}: ${JSON.stringify(a.claims)} — ${why}`))]).toEqual([])
  })
})

describe('отмазки настоящей игры', () => {
  it('на эскалации ни одна собранная отмазка не спорит сама с собой', () => {
    const { game } = makeGame({ seed: 7 })
    game.S.tier = 2
    const bad: string[] = []
    let multi = 0
    for (let i = 0; i < 4000; i++) {
      const claims = saidClaims(saidJoin(...game.X.excuse().texts))
      if (claims.length > 1) multi++
      const why = selfConflict(claims)
      if (why) bad.push(`${JSON.stringify(claims)} — ${why}`)
    }
    expect(multi, 'сборки с несколькими утверждениями').toBeGreaterThan(10)
    expect(bad).toEqual([])
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
