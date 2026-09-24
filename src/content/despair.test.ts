// Деньги на карте, MVP 4 (docs/design/money.md): чем беднее игрок, тем отчаяннее варианты его реплик.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { Game } from '../engine/game'
import { valueOf } from '../engine/rules'
import type { Choice } from '../engine/state'
import { P_MONEY, P_DESPERATE, DESPERATE_REPLY } from './topics'

const rebuilds = (g: Game, n: number): Choice[][] => Array.from({ length: n }, () => { g.S.choices = null; return g.buildChoices() })
const fromPool = (text: string, pool: readonly unknown[]) => pool.some((p) => text.includes(valueOf(p as never)))
const LOW = [...P_MONEY.low.polite, ...P_MONEY.low.neutral, ...P_DESPERATE.low]
const BOTTOM = [...P_MONEY.bottom.polite, ...P_MONEY.bottom.neutral, ...P_DESPERATE.bottom]
const desperate = (sets: Choice[][]) => sets.flat().filter((c) => c.act === 'desperate')

describe('отчаяние от бедности', () => {
  it('при норме денег — ни отчаяния, ни реплик «мало»/«дна»', () => {
    const { game } = makeGame()
    expect(game.moneyLevel()).toBe('normal')
    const sets = rebuilds(game, 40)
    expect(desperate(sets)).toEqual([])
    expect(sets.flat().filter((c) => fromPool(c.text, [...LOW, ...BOTTOM]))).toEqual([])
  })

  it('«мало»: отчаяние появляется, реплики из пула «мало», вежливый вариант — в каждой сборке', () => {
    const { game } = makeGame()
    game.S.money = Game.MONEY_LOW
    const sets = rebuilds(game, 60)
    expect(desperate(sets).length).toBeGreaterThan(0)
    for (const c of desperate(sets)) { expect(c.tone).toBe('neutral'); expect(fromPool(c.text, P_DESPERATE.low), c.text).toBe(true) }
    for (const set of sets) expect(set.some((c) => c.tone === 'polite' && !c.act)).toBe(true)
    expect(sets.flat().some((c) => fromPool(c.text, P_MONEY.low.polite))).toBe(true)
    expect(sets.flat().filter((c) => fromPool(c.text, BOTTOM))).toEqual([])
  })

  it('«дно»: отчаяния больше, чем при «мало», и один вежливый вариант остаётся всегда', () => {
    const low = makeGame({ seed: 7 }).game
    low.S.money = Game.MONEY_LOW
    const bottom = makeGame({ seed: 7 }).game
    bottom.S.money = Game.MONEY_BOTTOM
    const lowSets = rebuilds(low, 120)
    const bottomSets = rebuilds(bottom, 120)
    expect(desperate(bottomSets).length).toBeGreaterThan(desperate(lowSets).length)
    for (const set of bottomSets) expect(set.some((c) => c.tone === 'polite' && !c.act), 'вежливый вариант на дне').toBe(true)
    for (const c of desperate(bottomSets)) expect(fromPool(c.text, P_DESPERATE.bottom), c.text).toBe(true)
    expect(bottomSets.flat().filter((c) => fromPool(c.text, LOW))).toEqual([])
  })

  it('отчаянная реплика: ссора не греется, Алик отвечает «дыши» и отмазывается как обычно', async () => {
    const replies = new Set(DESPERATE_REPLY)
    let sent = 0
    for (let seed = 1; seed <= 20 && sent < 5; seed++) {
      const { game } = makeGame({ seed })
      game.S.money = Game.MONEY_BOTTOM
      const c = rebuilds(game, 30).flat().find((x) => x.act === 'desperate')
      if (!c) continue
      const [heat, rude, rudeAt, mood] = [game.S.mem['rude.heat'], game.S.mem['count.rude'], game.S.mem.rudeAt, game.S.mood]
      const from = game.S.msgs.length
      await game.send(c)
      const alik = game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
      expect(replies.has(alik[0]), alik[0]).toBe(true)
      expect(alik.length).toBeGreaterThan(1)
      expect([game.S.mem['rude.heat'], game.S.mem['count.rude'], game.S.mem.rudeAt, game.S.mood]).toEqual([heat, rude, rudeAt, mood])
      expect(game.S.ach.rude).toBeUndefined()
      sent++
    }
    expect(sent).toBeGreaterThan(0)
  })

  it('деньги вернулись к норме — отчаяние уходит сразу', () => {
    const { game } = makeGame()
    game.S.money = Game.MONEY_BOTTOM
    expect(desperate(rebuilds(game, 30)).length).toBeGreaterThan(0)
    game.S.money = Game.MONEY_LOW + 1
    expect(desperate(rebuilds(game, 40))).toEqual([])
  })

  it('в эндгейме механики нет', () => {
    const { game } = makeGame()
    game.S.money = Game.MONEY_BOTTOM
    game.S.mem['endgame.active'] = true
    expect(desperate(rebuilds(game, 20))).toEqual([])
  })
})
