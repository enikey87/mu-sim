import { describe, it, expect, vi } from 'vitest'
import { RuleSet, specificityOf, type Clock } from './ruleset'
import { makeHub } from './blackboard'
import { eq, gte, is, add, set, during, of } from './criteria'
import { freshRuleState, type Facts, type Rule, type RuleState, type Trace } from './types'
import { seededRng } from '../rng'

type G = { log: string[] }

function mk(opts: { seed?: number; world?: Facts; actors?: Record<string, Facts>; state?: RuleState } = {}) {
  const clock: Clock = { turn: 0, day: 100 }
  const world = opts.world ?? {}
  const actors = opts.actors ?? {}
  const state = opts.state ?? freshRuleState()
  const rs = new RuleSet<G>({ rng: seededRng(opts.seed ?? 1), hub: makeHub(world, actors), state, now: () => ({ ...clock }) })
  const game: G = { log: [] }
  const factsFor = (x: Facts) => ({ ...x })
  return { rs, clock, world, actors, state, game, factsFor }
}
const say = (name: string, event: string, when: Rule<G>['when'] = [], extra: Partial<Rule<G>> = {}): Rule<G> => ({
  name, event, when, respond: ({ game }) => { game.log.push(name) }, ...extra,
})

describe('специфичность', () => {
  it('условия + sender + target + bonus; явная — перекрывает', () => {
    expect(specificityOf(say('a', 'E', [eq('x', 1), eq('y', 2)]))).toBe(2)
    expect(specificityOf(say('a', 'E', [eq('x', 1)], { sender: 's', target: 't', bonus: 2 }))).toBe(5)
    expect(specificityOf(say('a', 'E', [eq('x', 1)], { specificity: 0 }))).toBe(0)
  })
})

describe('RuleSet.add / rules', () => {
  it('дубли имён запрещены; неизвестное событие — пустой список', () => {
    const { rs } = mk()
    rs.add(say('X', 'E'))
    expect(() => rs.add(say('X', 'F'))).toThrow(/Duplicate/)
    expect(rs.rules('none')).toEqual([])
    expect(rs.all).toHaveLength(1)
  })
})

describe('RuleSet.match', () => {
  it('самое специфичное побеждает; если оно не подходит — следующее', () => {
    const { rs } = mk()
    rs.add(say('General', 'Hit'), say('Axe', 'Hit', [eq('w', 'axe')]), say('AxeBig', 'Hit', [eq('w', 'axe'), gte('dmg', 10)]))
    expect(rs.match({ event: 'Hit' })!.name).toBe('General')
    expect(rs.match({ event: 'Hit', facts: { w: 'axe' } })!.name).toBe('Axe')
    expect(rs.match({ event: 'Hit', facts: { w: 'axe', dmg: 20 } })!.name).toBe('AxeBig')
    expect(rs.match({ event: 'Nope' })).toBeNull()
    expect(rs.match({ event: 'Hit' }, { w: 'axe' })!.name).toBe('Axe') // факты можно передать отдельно
  })
  it('условия читают доски: мир, отправитель, получатель, конкретный персонаж', () => {
    const { rs } = mk({ world: { rain: true }, actors: { boris: { sick: true }, karine: { angry: 1 } } })
    rs.add(
      say('World', 'E', [is('rain')]),
      say('Target', 'E', [gte('angry', 1, 'target'), is('rain')]),
      say('Boris', 'E', [of('boris', is('sick')), is('rain'), gte('angry', 1, 'target')]),
    )
    expect(rs.match({ event: 'E' })!.name).toBe('World')
    expect(rs.match({ event: 'E', target: 'karine' })!.name).toBe('Boris')
  })
  it('sender/target — отдельные условия (+1 к специфичности)', () => {
    const { rs } = mk()
    rs.add(say('Any', 'Mentioned'), say('Garik', 'Mentioned', [], { target: 'garik' }), say('FromKarine', 'Mentioned', [], { sender: 'karine', target: 'garik' }))
    expect(rs.match({ event: 'Mentioned', target: 'boris' })!.name).toBe('Any')
    expect(rs.match({ event: 'Mentioned', target: 'garik' })!.name).toBe('Garik')
    expect(rs.match({ event: 'Mentioned', sender: 'karine', target: 'garik' })!.name).toBe('FromKarine')
  })
  it('ничья — по весу; вес может зависеть от фактов; нулевой вес ничью не выигрывает', () => {
    const { rs } = mk({ seed: 7 })
    rs.add(say('Rare', 'E', [], { weight: 1 }), say('Common', 'E', [], { weight: 99 }), say('Off', 'E', [], { weight: (f) => (f.on ? 1000 : 0) }))
    const n: Record<string, number> = {}
    for (let i = 0; i < 2000; i++) { const r = rs.match({ event: 'E' })!.name; n[r] = (n[r] ?? 0) + 1 }
    expect(n.Common).toBeGreaterThan(1850)
    expect(n.Rare).toBeGreaterThan(0)
    expect(n.Off).toBeUndefined()
    expect(rs.match({ event: 'E', facts: { on: true } })!.name).toBe('Off')
  })
  it('отрицательный вес считается нулём', () => {
    const { rs } = mk()
    rs.add(say('Neg', 'E', [], { weight: -5 }), say('Pos', 'E'))
    for (let i = 0; i < 50; i++) expect(rs.match({ event: 'E' })!.name).toBe('Pos')
  })
  it('шанс (odds) может отклонить подходящее правило', () => {
    const { rs } = mk()
    rs.add(say('Never', 'E', [eq('a', 1)], { odds: 0 }), say('Always', 'E', [eq('a', 1)], { odds: 1, bonus: -1 }), say('Fallback', 'E', [], { specificity: -5 }))
    expect(rs.match({ event: 'E', facts: { a: 1 } })!.name).toBe('Always')
    expect(rs.match({ event: 'E' })!.name).toBe('Fallback')
  })
  it('приоритет ниже порога отклоняется', () => {
    const { rs } = mk()
    rs.add(say('Chatter', 'E', [], { priority: 'chatter', bonus: 1 }), say('Notif', 'E', [], { priority: 'system' }))
    expect(rs.match({ event: 'E' })!.name).toBe('Chatter')
    expect(rs.match({ event: 'E' }, {}, { floor: 'cinematic' })!.name).toBe('Notif')
    expect(rs.match({ event: 'E' }, {}, { floor: 'system' })!.name).toBe('Notif')
  })
})

describe('once и перерывы', () => {
  it('once — один раз за игру, отметка в сохраняемом состоянии', () => {
    const { rs, state } = mk()
    rs.add(say('Once', 'E', [], { once: true, bonus: 1 }), say('Always', 'E'))
    const r = rs.match({ event: 'E' })!
    rs.commit(r, { event: 'E' })
    expect(state.once.Once).toBe(true)
    expect(rs.match({ event: 'E' })!.name).toBe('Always')
  })
  it('перерыв в ходах и в днях', () => {
    const { rs, clock } = mk()
    rs.add(say('Turns', 'T', [], { cooldown: { turns: 3 }, bonus: 1 }), say('TFallback', 'T'))
    rs.add(say('Days', 'D', [], { cooldown: { days: 2 }, bonus: 1 }), say('DFallback', 'D'))
    rs.commit(rs.match({ event: 'T' })!, { event: 'T' })
    rs.commit(rs.match({ event: 'D' })!, { event: 'D' })
    expect(rs.match({ event: 'T' })!.name).toBe('TFallback')
    expect(rs.match({ event: 'D' })!.name).toBe('DFallback')
    clock.turn += 3
    clock.day += 1
    expect(rs.match({ event: 'T' })!.name).toBe('Turns')
    expect(rs.match({ event: 'D' })!.name).toBe('DFallback')
    clock.day += 1
    expect(rs.match({ event: 'D' })!.name).toBe('Days')
  })
  it('правило с перерывом, которое ни разу не срабатывало, доступно', () => {
    const { rs } = mk()
    rs.add(say('Fresh', 'E', [], { cooldown: { turns: 5, days: 5 } }))
    expect(rs.match({ event: 'E' })!.name).toBe('Fresh')
  })
})

describe('трассировка', () => {
  it('match: победитель и причины для остальных', () => {
    const { rs, clock, state } = mk()
    const traces: Trace[] = []
    rs.tracer = (t) => traces.push(t)
    state.once.Used = true
    state.cooldown.Resting = { turn: 0, day: clock.day }
    rs.add(
      say('Winner', 'E', [eq('a', 1)]),
      say('Unlucky', 'E', [eq('a', 1), eq('b', 1)], { odds: 0 }),
      say('Used', 'E', [eq('a', 1), eq('b', 1)], { once: true }),
      say('Resting', 'E', [eq('a', 1), eq('b', 1)], { cooldown: { turns: 5 } }),
      say('Quiet', 'E', [eq('a', 1), eq('b', 1)], { priority: 'idle' }),
      say('Wrong', 'E', [eq('a', 2), eq('b', 1)]),
      say('NotForYou', 'E', [], { sender: 'x', target: 'y', bonus: 5 }),
      say('Lower', 'E'),
    )
    rs.match({ event: 'E', facts: { a: 1, b: 1 } }, undefined, { floor: 'chatter' })
    const t = traces[0]
    const by = Object.fromEntries(t.candidates.map((c) => [c.name, c]))
    expect(t.mode).toBe('match')
    expect(t.chosen).toEqual(['Winner'])
    expect(by.Unlucky.blocked).toBe('odds')
    expect(by.Used.blocked).toBe('once')
    expect(by.Resting.blocked).toBe('cooldown')
    expect(by.Quiet.blocked).toBe('priority')
    expect(by.Wrong.failed).toEqual(['a == 2'])
    expect(by.NotForYou.failed).toEqual(['sender == x', 'target == y'])
    expect(by.Lower.failed).toEqual(['проиграло по специфичности'])
  })
  it('match без победителя; collect — выбранные по порядку', () => {
    const { rs } = mk()
    const traces: Trace[] = []
    rs.tracer = (t) => traces.push(t)
    rs.add(say('Only', 'E', [eq('a', 1)]), { name: 'A', event: 'C', when: [], slot: 'x' }, { name: 'B', event: 'C', when: [eq('a', 1)], slot: 'y' })
    rs.match({ event: 'E', sender: 's' })
    expect(traces[0]).toMatchObject({ chosen: [], sender: 's' })
    rs.collect({ event: 'C', facts: { a: 1 } })
    expect(traces[1]).toMatchObject({ mode: 'collect', chosen: ['B', 'A'] })
  })
})

describe('RuleSet.collect', () => {
  it('все подходящие, по убыванию специфичности, одно на слот, без слота — все', () => {
    const { rs } = mk()
    rs.add(
      { name: 'Low', event: 'C', when: [], slot: 's1' },
      { name: 'High', event: 'C', when: [eq('a', 1)], bonus: 3, slot: 's2' },
      { name: 'HighSameSlot', event: 'C', when: [eq('a', 1)], slot: 's2' },
      { name: 'Free1', event: 'C', when: [] },
      { name: 'Free2', event: 'C', when: [] },
      { name: 'NoMatch', event: 'C', when: [eq('a', 2)] },
      { name: 'Quiet', event: 'C', when: [], priority: 'idle' },
    )
    const names = rs.collect({ event: 'C' }, { a: 1 }, { floor: 'chatter' }).map((r) => r.name)
    expect(names[0]).toBe('High')
    expect(names).toContain('Low')
    expect(names).toContain('Free1')
    expect(names).toContain('Free2')
    expect(names).not.toContain('HighSameSlot')
    expect(names).not.toContain('NoMatch')
    expect(names).not.toContain('Quiet')
    expect(rs.collect({ event: 'Nope' })).toEqual([])
  })
})

describe('память: немедленно, с задержкой, на время', () => {
  it('запись в мир и на доску персонажа; нет персонажа у события — пропуск', () => {
    const { rs, world, actors } = mk()
    rs.applyOps([add('n'), set('k', 'v', { scope: 'target' }), set('s', 1, { scope: 'sender' })], { target: 'karine' })
    expect(world.n).toBe(1)
    expect(actors.karine.k).toBe('v')
    expect(actors).not.toHaveProperty('undefined')
    rs.applyOps(undefined, {})
  })
  it('delay: запись откладывается до нужного дня', () => {
    const { rs, clock, world, state } = mk()
    rs.applyOps([set('late', true, { delay: 3 })], {})
    expect(world.late).toBeUndefined()
    expect(state.schedule).toHaveLength(1)
    clock.day += 2
    expect(rs.due()).toEqual([])
    expect(world.late).toBeUndefined()
    clock.day += 1
    rs.due()
    expect(world.late).toBe(true)
    expect(state.schedule).toHaveLength(0)
  })
  it('forDays: временное состояние возвращается к прежнему значению (или исчезает)', () => {
    const { rs, clock, world, actors } = mk({ world: { mood: 'calm' } })
    rs.applyOps([during('wedding', 5), set('mood', 'party', { forDays: 2 })], {})
    rs.applyOps([during('sick', 3, true, 'target')], { target: 'boris' })
    expect(world).toMatchObject({ wedding: true, mood: 'party' })
    expect(actors.boris.sick).toBe(true)
    clock.day += 2
    rs.due()
    expect(world.mood).toBe('calm')
    expect(world.wedding).toBe(true)
    clock.day += 1
    rs.due()
    expect(actors.boris.sick).toBeUndefined()
    clock.day += 2
    rs.due()
    expect(world.wedding).toBeUndefined()
  })
  it('откат для персонажа, которого нет — пропускается', () => {
    const { rs, clock, state } = mk()
    state.schedule.push({ at: clock.day, kind: 'restore', key: 'x', scope: 'sender', value: 1 })
    expect(() => rs.due()).not.toThrow()
  })
  it('forDays работает только для присвоения', () => {
    const { rs, state } = mk()
    rs.applyOps([{ key: 'n', op: '+', value: 1, forDays: 3 }], {})
    expect(state.schedule).toHaveLength(0)
  })
  it('commit: once + перерыв + память', () => {
    const { rs, state, world, clock } = mk()
    const r = say('R', 'E', [], { once: true, cooldown: { turns: 1 }, remember: [add('x')] })
    rs.add(r)
    rs.commit(r, { event: 'E' })
    expect(state.once.R).toBe(true)
    expect(state.cooldown.R).toEqual({ turn: clock.turn, day: clock.day })
    expect(world.x).toBe(1)
  })
})

describe('расписание', () => {
  it('упорядочено по дню; due отдаёт наступившие события', () => {
    const { rs, clock, state } = mk()
    rs.schedule({ at: clock.day + 5, kind: 'event', event: 'Late' })
    rs.schedule({ at: clock.day + 1, kind: 'event', event: 'Soon', facts: { a: 1 }, target: 't' })
    expect(state.schedule.map((s) => s.at)).toEqual([clock.day + 1, clock.day + 5])
    clock.day += 1
    expect(rs.due()).toEqual([{ at: clock.day, kind: 'event', event: 'Soon', facts: { a: 1 }, target: 't' }])
    expect(state.schedule).toHaveLength(1)
  })
  it('runDue вызывает наступившие события с их фактами и персонажами', async () => {
    const { rs, clock, game, factsFor } = mk()
    rs.add(say('Due', 'PromiseDue', [eq('p', 3)], { target: 'garik' }))
    rs.schedule({ at: clock.day + 2, kind: 'event', event: 'PromiseDue', facts: { p: 3 }, target: 'garik' })
    expect(await rs.runDue(game, factsFor)).toBe(0)
    clock.day += 2
    expect(await rs.runDue(game, factsFor)).toBe(1)
    expect(game.log).toEqual(['Due'])
  })
})

describe('RuleSet.fire', () => {
  it('память пишется до ответа и видна следующим событиям', async () => {
    const { rs, game, world } = mk()
    const factsFor = (x: Facts) => ({ ...world, ...x })
    rs.add(say('First', 'Greet', [], { remember: [add('greets')] }), say('Again', 'Greet', [gte('greets', 1)], { remember: [add('greets')] }))
    for (let i = 0; i < 3; i++) await rs.fire(game, { event: 'Greet' }, factsFor)
    expect(game.log).toEqual(['First', 'Again', 'Again'])
    expect(world.greets).toBe(3)
  })
  it('ответ получает контекст: факты, запрос, доступ к доскам', async () => {
    const { rs, game, factsFor } = mk({ actors: { karine: { angry: 2 } } })
    const respond = vi.fn()
    rs.add({ name: 'R', event: 'E', when: [], respond })
    await rs.fire(game, { event: 'E', target: 'karine', facts: { a: 1 } }, factsFor)
    const ctx = respond.mock.calls[0][0]
    expect(ctx.facts).toEqual({ a: 1 })
    expect(ctx.query).toMatchObject({ event: 'E', target: 'karine' })
    expect(ctx.get('angry', 'target')).toBe(2)
    expect(ctx.rule.name).toBe('R')
    expect(ctx.game).toBe(game)
  })
  it('цепочка: персонажи наследуются или задаются явно, факты — свои', async () => {
    const { rs, game, factsFor } = mk()
    rs.add(
      say('Blue', 'See', [eq('obj', 'barrel')], { trigger: [{ event: 'FriendSaw', facts: { from: 'blue' } }, { event: 'Direct', target: 'red' }] }),
      say('Red', 'FriendSaw', [eq('from', 'blue')], { sender: 'blue' }),
      say('ToRed', 'Direct', [], { target: 'red' }),
    )
    await rs.fire(game, { event: 'See', sender: 'blue', facts: { obj: 'barrel' } }, factsFor)
    expect(game.log).toEqual(['Blue', 'Red', 'ToRed'])
  })
  it('ifResponded: ответ вернул false — цепочка не идёт; probability 0 — тоже', async () => {
    const { rs, game, factsFor } = mk()
    rs.add(
      { name: 'Silent', event: 'A', when: [], respond: () => false, trigger: [{ event: 'Next', ifResponded: true }] },
      { name: 'Talk', event: 'B', when: [], respond: () => {}, trigger: [{ event: 'Next', ifResponded: true }, { event: 'Next', probability: 0 }] },
      say('Next', 'Next'),
    )
    await rs.fire(game, { event: 'A' }, factsFor)
    expect(game.log).toEqual([])
    await rs.fire(game, { event: 'B' }, factsFor)
    expect(game.log).toEqual(['Next'])
  })
  it('отложенный trigger попадает в расписание', async () => {
    const { rs, game, factsFor, state, clock } = mk()
    rs.add(say('Now', 'A', [], { trigger: [{ event: 'Later', delay: 4, facts: { x: 1 } }] }), say('Later', 'Later'))
    await rs.fire(game, { event: 'A', target: 't' }, factsFor)
    expect(state.schedule[0]).toMatchObject({ at: clock.day + 4, kind: 'event', event: 'Later', facts: { x: 1 }, target: 't' })
    clock.day += 4
    await rs.runDue(game, factsFor)
    expect(game.log).toEqual(['Now', 'Later'])
  })
  it('без подходящего правила — null; правило без ответа — ок; порог приоритета передаётся в цепочку', async () => {
    const { rs, game, factsFor } = mk()
    rs.add({ name: 'NoRespond', event: 'X', when: [], priority: 'system', trigger: [{ event: 'Y' }] }, say('Chat', 'Y', [], { priority: 'chatter' }))
    expect(await rs.fire(game, { event: 'None' }, factsFor)).toBeNull()
    expect((await rs.fire(game, { event: 'X' }, factsFor, { floor: 'cinematic' }))!.name).toBe('NoRespond')
    expect(game.log).toEqual([]) // Chat отклонён порогом
  })
  it('защита от бесконечной цепочки', async () => {
    const { rs, game, factsFor } = mk()
    rs.add(say('Loop', 'L', [], { trigger: [{ event: 'L' }] }))
    await expect(rs.fire(game, { event: 'L' }, factsFor)).rejects.toThrow(/too deep/)
  })
})
