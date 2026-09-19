import { describe, it, expect, vi } from 'vitest'
import { RuleSet, eq, ne, gt, gte, lt, lte, exists, missing, matches, is, set, add, test, specificityOf, applyFactOps, type Rule, type Facts } from './rules'
import { seededRng } from './rng'

type G = { log: string[] }
const mk = (memory: Facts = {}, seed = 1) => new RuleSet<G>(seededRng(seed), memory)
const say = (name: string, event: string, when: Rule<G>['when'], extra: Partial<Rule<G>> = {}): Rule<G> => ({
  name, event, when, respond: ({ game }) => { game.log.push(name) }, ...extra,
})

describe('criteria', () => {
  it('compare operators', () => {
    const f: Facts = { n: 5, s: 'abc', t: true, z: 0, e: '' }
    expect(test(eq('n', 5), f)).toBe(true)
    expect(test(ne('n', 5), f)).toBe(false)
    expect(test(gt('n', 4), f)).toBe(true)
    expect(test(gte('n', 5), f)).toBe(true)
    expect(test(lt('n', 5), f)).toBe(false)
    expect(test(lte('n', 5), f)).toBe(true)
    expect(test(matches('s', /b/), f)).toBe(true)
    expect(test(matches('n', /5/), f)).toBe(false) // только строки
    expect(test(is('t'), f)).toBe(true)
  })
  it('exist treats undefined/null/false/"" as missing, 0 as present', () => {
    const f: Facts = { a: undefined, b: null, c: false, d: '', z: 0 }
    for (const k of ['a', 'b', 'c', 'd', 'nope']) {
      expect(test(exists(k), f)).toBe(false)
      expect(test(missing(k), f)).toBe(true)
    }
    expect(test(exists('z'), f)).toBe(true)
  })
  it('eq false matches missing fact; numbers compare missing as 0', () => {
    expect(test(eq('x', false), {})).toBe(true)
    expect(test(gte('x', 0), {})).toBe(true)
    expect(test(gt('x', 0), {})).toBe(false)
  })
  it('specificity = criteria + bonus unless explicit', () => {
    expect(specificityOf<G>({ name: 'a', event: 'e', when: [eq('a', 1), eq('b', 2)] })).toBe(2)
    expect(specificityOf<G>({ name: 'a', event: 'e', when: [eq('a', 1)], bonus: 3 })).toBe(4)
    expect(specificityOf<G>({ name: 'a', event: 'e', when: [eq('a', 1)], specificity: 0 })).toBe(0)
  })
  it('fact ops set/add', () => {
    const m: Facts = { a: 1 }
    applyFactOps(m, [add('a'), add('b', 2), set('c', 'x')])
    expect(m).toEqual({ a: 2, b: 2, c: 'x' })
  })
})

describe('RuleSet.match', () => {
  it('most specific rule wins', () => {
    const rs = mk().add(
      say('General', 'Hit', []),
      say('Specific', 'Hit', [eq('weapon', 'axe')]),
      say('MoreSpecific', 'Hit', [eq('weapon', 'axe'), gte('dmg', 10)]),
    )
    expect(rs.match('Hit', {})?.name).toBe('General')
    expect(rs.match('Hit', { weapon: 'axe' })?.name).toBe('Specific')
    expect(rs.match('Hit', { weapon: 'axe', dmg: 12 })?.name).toBe('MoreSpecific')
    expect(rs.match('Other', {})).toBeNull()
  })
  it('falls back to less specific when specific does not pass', () => {
    const rs = mk().add(say('A', 'E', [eq('x', 1)]), say('B', 'E', [eq('x', 1), eq('y', 1)]))
    expect(rs.match('E', { x: 1, y: 2 })?.name).toBe('A')
  })
  it('ties are picked by weight', () => {
    const rs = mk({}, 7).add(say('Rare', 'E', [], { weight: 1 }), say('Common', 'E', [], { weight: 99 }))
    const n: Record<string, number> = { Rare: 0, Common: 0 }
    for (let i = 0; i < 2000; i++) n[rs.match('E', {})!.name]++
    expect(n.Common).toBeGreaterThan(1850)
    expect(n.Rare).toBeGreaterThan(0)
  })
  it('weight can be a function of facts; zero weight never wins a tie', () => {
    const rs = mk().add(say('A', 'E', [], { weight: (f) => (f.on ? 1 : 0) }), say('B', 'E', [], { weight: 1 }))
    for (let i = 0; i < 200; i++) expect(rs.match('E', { on: false })!.name).toBe('B')
  })
  it('odds can veto a rule', () => {
    const rs = mk().add(say('Never', 'E', [eq('a', 1)], { odds: 0 }), say('Fallback', 'E', []))
    expect(rs.match('E', { a: 1 })?.name).toBe('Fallback')
  })
  it('duplicate names are rejected', () => {
    expect(() => mk().add(say('X', 'E', []), say('X', 'F', []))).toThrow(/Duplicate/)
  })
})

describe('RuleSet.collect', () => {
  it('orders by specificity and keeps one rule per slot', () => {
    const rs = mk().add(
      { name: 'Low', event: 'C', when: [], slot: 's1' },
      { name: 'High', event: 'C', when: [eq('a', 1)], bonus: 3, slot: 's2' },
      { name: 'HighSameSlot', event: 'C', when: [eq('a', 1)], slot: 's2' },
      { name: 'NoSlotMatch', event: 'C', when: [eq('a', 2)] },
    )
    expect(rs.collect('C', { a: 1 }).map((r) => r.name)).toEqual(['High', 'Low'])
  })
})

describe('RuleSet.fire', () => {
  it('remember writes memory before respond and memory is visible to next events', async () => {
    const memory: Facts = {}
    const game: G = { log: [] }
    const rs = mk(memory).add(
      say('First', 'Greet', [], { remember: [add('greets')] }),
      say('Again', 'Greet', [gte('greets', 1)], { remember: [add('greets')] }),
    )
    const factsFor = (x: Facts) => ({ ...memory, ...x })
    await rs.fire('Greet', game, factsFor)
    await rs.fire('Greet', game, factsFor)
    await rs.fire('Greet', game, factsFor)
    expect(game.log).toEqual(['First', 'Again', 'Again'])
    expect(memory.greets).toBe(3)
  })
  it('once rules fire only once', async () => {
    const memory: Facts = {}
    const game: G = { log: [] }
    const rs = mk(memory).add(say('Once', 'E', [], { once: true, bonus: 1 }), say('Always', 'E', []))
    const f = (x: Facts) => ({ ...memory, ...x })
    await rs.fire('E', game, f)
    await rs.fire('E', game, f)
    expect(game.log).toEqual(['Once', 'Always'])
  })
  it('trigger chains events with their own facts', async () => {
    const game: G = { log: [] }
    const rs = mk().add(
      say('Blue_SeeBarrel', 'See', [eq('obj', 'barrel')], { trigger: [{ event: 'FriendSaw', facts: { from: 'blue' } }] }),
      say('Red_Reply', 'FriendSaw', [eq('from', 'blue')]),
    )
    await rs.fire('See', game, (x) => x, { obj: 'barrel' })
    expect(game.log).toEqual(['Blue_SeeBarrel', 'Red_Reply'])
  })
  it('guards against infinite trigger loops', async () => {
    const rs = mk().add(say('Loop', 'L', [], { trigger: [{ event: 'L' }] }))
    await expect(rs.fire('L', { log: [] }, (x) => x)).rejects.toThrow(/too deep/)
  })
  it('returns null and does nothing when no rule matches', async () => {
    const respond = vi.fn()
    const rs = mk().add({ name: 'A', event: 'E', when: [eq('x', 1)], respond })
    expect(await rs.fire('E', { log: [] }, (x) => x)).toBeNull()
    expect(respond).not.toHaveBeenCalled()
  })
})
