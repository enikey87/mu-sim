// Ставка «сбрею усы» (docs/design/moustache.md): запись в журнале, исполнение в срок, факт ~40 дней.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { spec } from './fact'
import { OATH_FORMS } from './misc'
import { WORLD, meet } from './world'
import { alikShaved } from './memkeys'
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
    const form = OATH_FORMS.map(spec).find((s) => s.id === 'oath_stake_moustache')!
    expect(form.t).toMatch(/сбрею усы/)
    expect(oathOpen(game)).toBe(true)
    game.S.mem[alikShaved] = true
    expect(oathOpen(game)).toBe(false)
    delete game.S.mem[alikShaved]
    game.S.mem['endgame.active'] = true
    expect(oathOpen(game)).toBe(false)
  })

  it('негатив: без гейта moustache форма осталась бы открыта после бритья', () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('karine'), {})
    game.S.mem[alikShaved] = true
    expect(oathOpen(game)).toBe(false)
    expect(game.holds(WORLD.moustache)).toBe(false)
  })
})
