// Ставка «сбрею усы» (docs/design/moustache.md): запись в журнале, исполнение в срок, факт ~40 дней.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { spec } from './fact'
import { OATH_FORMS } from './misc'
import { WORLD, meet } from './world'
import { alikShaved, endgame, nuneKeyPassed } from './memkeys'
import { D } from './excuses'
import type { Entry } from './fact'

const sys = (g: ReturnType<typeof makeGame>['game'], from: number) =>
  g.S.msgs.slice(from).flatMap((m) => (m.kind === 'sys' ? [m.text] : []))
const alik = (g: ReturnType<typeof makeGame>['game'], from: number) =>
  g.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
const oathOpen = (g: ReturnType<typeof makeGame>['game']) =>
  g.lines.eligible('OATH_FORMS', OATH_FORMS, g.lineFacts()).some((p) => p.id === 'oath_stake_moustache')
const oathUsamiOpen = (g: ReturnType<typeof makeGame>['game']) =>
  g.lines.eligible('OATH', D.OATH as Entry<string>[], g.lineFacts()).some((p) => /своими усами/.test(p.text))
const stakeForm = () => OATH_FORMS.map(spec).find((s) => s.id === 'oath_stake_moustache')!

describe('ставка «усы»', () => {
  it('сорванный срок: фото без усов, alik.shaved, ачивка; клятвы усами молчат', async () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    game.S.mood = 3
    game.recordPromise({ text: 'завтра — всё отдам', d: 1, stake: 'moustache' })
    expect(game.S.promises[0].stake).toBe('moustache')
    game.S.day += 1
    const from = game.S.msgs.length
    expect((await game.fire('PromiseDue', { promise: 0 }))?.name).toBe('Due_StakeShave')
    expect(sys(game, from)).toContain('Алик Воздухонесян сменил фото профиля. На фото — Алик без усов.')
    expect(alik(game, from).join(' ').toLowerCase()).toContain('ус')
    expect(alik(game, from).some((t) => /, С[А-Я]/.test(t))).toBe(false)
    expect(game.S.mem[alikShaved]).toBe(true)
    expect(game.S.ach.shaved).toBeDefined()
    expect(game.holds(WORLD.moustache)).toBe(false)
    expect(oathOpen(game)).toBe(false)
    expect(oathUsamiOpen(game)).toBe(false)
  })

  it('~40 дней спустя усы снова «на месте»', async () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    game.S.mood = 3
    game.recordPromise({ text: 'завтра', d: 1, stake: 'moustache' })
    game.S.day += 1
    await game.fire('PromiseDue', { promise: 0 })
    const shavedAt = game.S.day
    expect(game.S.mem[alikShaved]).toBe(true)
    game.S.day = shavedAt + 40
    game.rules.settle()
    expect(game.S.mem[alikShaved]).toBeUndefined()
    expect(game.holds(WORLD.moustache)).toBe(true)
    expect(oathOpen(game)).toBe(true)
  })

  it('«когда-нибудь» ставку не исполняет', async () => {
    const { game } = makeGame()
    game.recordPromise({ text: 'когда-нибудь', d: null, stake: 'moustache' })
    game.S.day += 5
    expect(game.facts({ promise: 0 }).promiseLive).toBe(false)
    expect((await game.fire('PromiseDue', { promise: 0 }))?.name).not.toBe('Due_StakeShave')
    expect(game.S.mem[alikShaved]).toBeUndefined()
  })

  it('сдержал слово — усы спасены, перевод 50', async () => {
    let saved = false
    for (let seed = 1; seed <= 40 && !saved; seed++) {
      const { game } = makeGame({ seed })
      game.S.mood = 9
      game.recordPromise({ text: 'послезавтра — переведу', d: 2, stake: 'moustache' })
      game.S.day += 2
      const from = game.S.msgs.length
      const rule = await game.fire('PromiseDue', { promise: 0 })
      if (rule?.name === 'Due_StakeKept') {
        expect(game.S.msgs.slice(from).some((m) => m.kind === 'transfer')).toBe(true)
        expect(alik(game, from).join(' ').toLowerCase()).toContain('ус')
        expect(game.S.mem[alikShaved]).toBeUndefined()
        expect(game.S.promises[0].kept).toBe(true)
        saved = true
      }
    }
    expect(saved).toBe(true)
  })

  it('форма клятвы пишет stake и молчит без усов / в эндгейме', () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    expect(stakeForm().t).toMatch(/сбрею усы/)
    expect(oathOpen(game)).toBe(true)
    game.S.mem[alikShaved] = true
    expect(oathOpen(game)).toBe(false)
    delete game.S.mem[alikShaved]
    game.S.mem[endgame.active] = true
    expect(oathOpen(game)).toBe(false)
  })

  it('легенда + форма ставки пишет stake (#307)', async () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    game.setLegend('safe_baby', 'nune')
    const pick = game.linePicked.bind(game)
    game.linePicked = (key, pool, o) => {
      if (key === 'OATH_FORMS') {
        const s = stakeForm()
        return { text: s.t, spec: s, id: s.id ?? 'oath_stake_moustache' }
      }
      return pick(key, pool, o)
    }
    await game.promiseLine(undefined, true)
    const last = game.S.promises.at(-1)!
    expect(last.stake).toBe('moustache')
    expect(last.condition).toBe(nuneKeyPassed)
    expect(last.t).toMatch(/как ключ выйдет/)
  })

  it('срок «сегодня» планирует PromiseDue (#307)', () => {
    const { game } = makeGame()
    const day = game.S.day
    game.recordPromise({ text: 'сегодня вечером', d: 0, stake: 'moustache' })
    expect(game.S.promises[0].due).toBe(day)
    expect(game.S.rules.schedule.some((s) => s.kind === 'event' && s.event === 'PromiseDue' && s.at === day)).toBe(true)
  })

  it('событийный срок: условие без денег брит усы (#307)', async () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    game.S.mood = 3
    game.recordPromise({ text: 'как ключ выйдет', d: null, condition: nuneKeyPassed, stake: 'moustache' })
    game.S.mem[nuneKeyPassed] = true
    game.S.promises[0].met = game.S.day
    const from = game.S.msgs.length
    expect((await game.fire('PromiseConditionMet', { promise: 0 }))?.name).toBe('Condition_StakeShave')
    expect(sys(game, from)).toContain('Алик Воздухонесян сменил фото профиля. На фото — Алик без усов.')
    expect(game.S.mem[alikShaved]).toBe(true)
  })

  it('уже сбритые усы: StakeKept/Shave молчат (#307)', async () => {
    const { game } = makeGame()
    game.S.mood = 3
    game.S.mem[alikShaved] = true
    game.recordPromise({ text: 'завтра', d: 1, stake: 'moustache' })
    game.S.day += 1
    const from = game.S.msgs.length
    expect((await game.fire('PromiseDue', { promise: 0 }))?.name).not.toBe('Due_StakeShave')
    expect(sys(game, from)).toEqual([])
  })

  it('в эндгейме ставка не исполняется (#307)', async () => {
    const { game } = makeGame()
    game.S.mood = 3
    game.recordPromise({ text: 'завтра', d: 1, stake: 'moustache' })
    game.S.day += 1
    game.S.mem[endgame.active] = true
    expect((await game.fire('PromiseDue', { promise: 0 }))?.name).not.toBe('Due_StakeShave')
    expect(game.S.mem[alikShaved]).toBeUndefined()
  })

  it('NC: клятвы усами закрыты без WORLD.moustache', () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    expect(oathUsamiOpen(game)).toBe(true)
    game.S.mem[alikShaved] = true
    expect(game.holds(WORLD.moustache)).toBe(false)
    expect(oathUsamiOpen(game)).toBe(false)
    expect(oathOpen(game)).toBe(false)
  })
})
