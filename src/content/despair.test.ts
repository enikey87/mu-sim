// Деньги на карте, MVP 4 (docs/design/money.md): чем беднее игрок, тем отчаяннее варианты его реплик.
// Каждая строка отчаяния опирается на факт (#187): срок, проданное, уровень «дно» — не голод.
import { describe, it, expect } from 'vitest'
import { makeGame, setMoney } from '../test/helpers'
import { Game } from '../engine/game'
import { valueOf, test as holds, missing } from '../engine/rules'
import type { Choice } from '../engine/state'
import { P_MONEY, P_DESPERATE, DESPERATE_REPLY } from './topics'
import { sold } from './credit'
import { billDueAt } from './bills'

const rebuilds = (g: Game, n: number): Choice[][] => Array.from({ length: n }, () => { g.S.choices = null; return g.buildChoices() })
const fromPool = (text: string, pool: readonly unknown[]) => pool.some((p) => text.includes(valueOf(p as never)))
const LOW = [...P_MONEY.low.polite, ...P_MONEY.low.neutral, ...P_DESPERATE.low]
const BOTTOM = [...P_MONEY.bottom.polite, ...P_MONEY.bottom.neutral, ...P_DESPERATE.bottom]
const desperate = (sets: Choice[][]) => sets.flat().filter((c) => c.act === 'desperate')
const SELL_TILE = 'ПРОДАМ ПЛИТКУ'
const SOLD_TILE = 'УЖЕ ПРОДАЛ ПЛИТКУ'
const DUE_TOMORROW = 'Списание завтра'
const BOTTOM_REPLIES = DESPERATE_REPLY.filter((r) => typeof r !== 'string').map(valueOf)

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
    setMoney(game, Game.MONEY_LOW)
    const sets = rebuilds(game, 60)
    expect(desperate(sets).length).toBeGreaterThan(0)
    for (const c of desperate(sets)) { expect(c.tone).toBe('neutral'); expect(fromPool(c.text, P_DESPERATE.low), c.text).toBe(true) }
    for (const set of sets) expect(set.some((c) => c.tone === 'polite' && !c.act)).toBe(true)
    expect(sets.flat().some((c) => fromPool(c.text, P_MONEY.low.polite))).toBe(true)
    expect(sets.flat().filter((c) => fromPool(c.text, BOTTOM))).toEqual([])
  })

  it('«дно»: отчаяния больше, чем при «мало», и один вежливый вариант остаётся всегда', () => {
    const low = makeGame({ seed: 7 }).game
    setMoney(low, Game.MONEY_LOW)
    const bottom = makeGame({ seed: 7 }).game
    setMoney(bottom, Game.MONEY_BOTTOM)
    const lowSets = rebuilds(low, 120)
    const bottomSets = rebuilds(bottom, 120)
    expect(desperate(bottomSets).length).toBeGreaterThan(desperate(lowSets).length)
    for (const set of bottomSets) expect(set.some((c) => c.tone === 'polite' && !c.act), 'вежливый вариант на дне').toBe(true)
    for (const c of desperate(bottomSets)) expect(fromPool(c.text, P_DESPERATE.bottom), c.text).toBe(true)
    expect(bottomSets.flat().filter((c) => fromPool(c.text, LOW))).toEqual([])
  })

  it('отчаянная реплика: ссора не греется, Алик отвечает «дыши» и отмазывается как обычно', async () => {
    const replies = new Set(DESPERATE_REPLY.map(valueOf))
    let sent = 0
    for (let seed = 1; seed <= 20 && sent < 5; seed++) {
      const { game } = makeGame({ seed })
      setMoney(game, Game.MONEY_BOTTOM)
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
    setMoney(game, Game.MONEY_BOTTOM)
    expect(desperate(rebuilds(game, 30)).length).toBeGreaterThan(0)
    setMoney(game, Game.MONEY_LOW + 1)
    expect(desperate(rebuilds(game, 40))).toEqual([])
  })

  it('в эндгейме механики нет', () => {
    const { game } = makeGame()
    setMoney(game, Game.MONEY_BOTTOM)
    game.S.mem['endgame.active'] = true
    expect(desperate(rebuilds(game, 20))).toEqual([])
  })

  it('«списание завтра» — только при paymentDueTomorrow; без факта не звучит (#187)', () => {
    const { game } = makeGame()
    setMoney(game, Game.MONEY_LOW)
    expect(game.facts().paymentDueTomorrow).toBe(false)
    expect(rebuilds(game, 80).flat().some((c) => c.text.includes(DUE_TOMORROW))).toBe(false)
    game.S.mem[billDueAt('rent')] = game.S.day + 1
    game.S.mem['bills.rent.due'] = true
    expect(game.facts().paymentDueTomorrow).toBe(true)
    expect(rebuilds(game, 80).flat().some((c) => c.text.includes(DUE_TOMORROW))).toBe(true)
    // негативный контроль: снять факт — снова тишина
    delete game.S.mem[billDueAt('rent')]
    delete game.S.mem['bills.rent.due']
    game.S.choices = null
    expect(game.facts().paymentDueTomorrow).toBe(false)
    expect(rebuilds(game, 80).flat().some((c) => c.text.includes(DUE_TOMORROW))).toBe(false)
  })

  it('«продам плитку» — пока не sold.tile; после продажи — «уже продал» (#187)', () => {
    const { game } = makeGame()
    setMoney(game, Game.MONEY_BOTTOM)
    expect(holds(missing(sold('tile')), game.lineFacts())).toBe(true)
    const before = rebuilds(game, 100).flat().map((c) => c.text)
    expect(before.some((t) => t.includes(SELL_TILE))).toBe(true)
    expect(before.some((t) => t.includes(SOLD_TILE))).toBe(false)
    game.S.mem[sold('tile')] = true
    const after = rebuilds(game, 100).flat().map((c) => c.text)
    expect(after.some((t) => t.includes(SELL_TILE))).toBe(false)
    expect(after.some((t) => t.includes(SOLD_TILE))).toBe(true)
    // негативный контроль: вернуть плитку — снова «продам»
    delete game.S.mem[sold('tile')]
    expect(rebuilds(game, 100).flat().some((c) => c.text.includes(SELL_TILE))).toBe(true)
  })

  it('ответы про «дно» — только на moneyBottom; на «мало» их нет (#187)', async () => {
    const low = makeGame({ seed: 3 }).game
    setMoney(low, Game.MONEY_LOW)
    for (let i = 0; i < 40; i++) {
      setMoney(low, Game.MONEY_LOW) // уровень держим: партия тратит деньги, и «мало» уезжает в «дно»
      low.S.choices = null
      const c = low.buildChoices().find((x) => x.act === 'desperate')
      if (!c) continue
      const from = low.S.msgs.length
      await low.send(c)
      const first = low.S.msgs.slice(from).find((m) => m.kind === 'text' && m.from === 'alik')
      expect(BOTTOM_REPLIES.includes((first as { text: string }).text), (first as { text: string })?.text).toBe(false)
    }
    const bottom = makeGame({ seed: 3 }).game
    setMoney(bottom, Game.MONEY_BOTTOM)
    let hit = false
    for (let i = 0; i < 60 && !hit; i++) {
      bottom.S.choices = null
      const c = bottom.buildChoices().find((x) => x.act === 'desperate')
      if (!c) continue
      const from = bottom.S.msgs.length
      await bottom.send(c)
      const first = bottom.S.msgs.slice(from).find((m) => m.kind === 'text' && m.from === 'alik')
      if (first && first.kind === 'text' && BOTTOM_REPLIES.includes(first.text)) hit = true
    }
    expect(hit).toBe(true)
  })

  it('в пуле отчаяния нет голода и табу money.md (#187)', () => {
    const all = [...P_DESPERATE.low, ...P_DESPERATE.bottom, ...DESPERATE_REPLY].map(valueOf).join('\n')
    expect(all).not.toMatch(/я ел|голод|есть нечего|не ем|голодаю/i)
  })
})
