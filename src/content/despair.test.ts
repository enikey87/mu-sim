// Деньги на карте, MVP 4 (docs/design/money.md): чем беднее игрок, тем отчаяннее варианты его реплик.
// Каждая строка отчаяния опирается на факт (#187): срок, проданное, уровень «дно» — не голод.
import { describe, it, expect } from 'vitest'
import { makeGame, setMoney } from '../test/helpers'
import { Game } from '../engine/game'
import { valueOf, test as holds, missing } from './fact'
import type { Choice } from '../engine/state'
import { P_MONEY, P_DESPERATE, DESPERATE_PAIRS, DESPERATE_REPLY, MONEY_REPLY_POLITE, MONEY_REPLY_NEUTRAL, MONEY_REPLY_REGIMENT } from './topics'
import { sold } from './credit'
import { billDueAt } from './bills'
import { Gated } from '../engine/rules'

const rebuilds = (g: Game, n: number): Choice[][] => Array.from({ length: n }, () => { g.S.choices = null; return g.buildChoices() })
const fromPool = (text: string, pool: readonly unknown[]) => pool.some((p) => {
  const v = valueOf(p as never)
  return text.includes(typeof v === 'string' ? v : (v as { t: string }).t)
})
const LOW = [...P_MONEY.low.polite, ...P_MONEY.low.neutral, ...P_DESPERATE.low]
const BOTTOM = [...P_MONEY.bottom.polite, ...P_MONEY.bottom.neutral, ...P_DESPERATE.bottom]
/** Любой вариант с намерением desperate — любого тона (#494). */
const desperate = (sets: Choice[][]) => sets.flat().filter((c) => c.act === 'desperate')
const expectPoolTones = (choices: Choice[], level: 'low' | 'bottom') => {
  const pools = [
    { lines: P_DESPERATE[level], tone: 'neutral' },
    { lines: P_MONEY[level].polite, tone: 'polite' },
    { lines: P_MONEY[level].neutral, tone: 'neutral' },
  ] as const
  for (const c of choices) {
    const matches = pools.filter((pool) => fromPool(c.text, pool.lines))
    expect(matches.length, c.text).toBe(1)
    expect(c.tone, c.text).toBe(matches[0].tone)
  }
  for (const pool of pools) expect(choices.some((c) => fromPool(c.text, pool.lines)), level).toBe(true)
}
const SELL_TILE = 'ПРОДАМ ПЛИТКУ'
const SOLD_TILE = 'УЖЕ ПРОДАЛ ПЛИТКУ'
const DUE_TOMORROW = 'Списание завтра'
/** Все пулы общего ответа на деньги — сторож «дна» видит каждый (#495). */
const MONEY_REPLY_POOLS = [
  ['DESPERATE_REPLY', DESPERATE_REPLY],
  ['MONEY_REPLY_POLITE', MONEY_REPLY_POLITE],
  ['MONEY_REPLY_NEUTRAL', MONEY_REPLY_NEUTRAL],
  ['MONEY_REPLY_REGIMENT', MONEY_REPLY_REGIMENT],
] as const
const hasMoneyBottom = (e: unknown): e is Gated<string> =>
  e instanceof Gated && e.when.some((c) => c.key === 'moneyBottom' && c.op === '==' && c.value === true)
const bottomReplies = (pool: readonly unknown[]): string[] =>
  pool.filter(hasMoneyBottom).map((e) => valueOf(e))
const BOTTOM_REPLIES = MONEY_REPLY_POOLS.flatMap(([, pool]) => bottomReplies(pool))
const choiceWith = (game: Game, text: string): Choice => {
  for (let i = 0; i < 160; i++) {
    game.S.choices = null
    const found = game.buildChoices().find((c) => c.text.includes(text))
    if (found) return found
  }
  throw new Error(`Нет варианта «${text}»`)
}
const firstReply = (game: Game, from: number): string | undefined =>
  game.S.msgs.slice(from).flatMap((m) => m.kind === 'text' && m.from === 'alik' ? [m.text] : [])[0]

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
    const all = desperate(sets)
    expect(all.length).toBeGreaterThan(0)
    for (const c of all) expect(fromPool(c.text, LOW), c.text).toBe(true)
    expectPoolTones(all, 'low')
    expect(all.some((c) => fromPool(c.text, P_DESPERATE.low))).toBe(true)
    for (const set of sets) expect(set.some((c) => c.tone === 'polite' && (!c.act || c.act === 'desperate'))).toBe(true)
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
    const lowAll = desperate(lowSets)
    const bottomAll = desperate(bottomSets)
    expect(bottomAll.length).toBeGreaterThan(lowAll.length)
    for (const set of bottomSets) expect(set.some((c) => c.tone === 'polite' && (!c.act || c.act === 'desperate')), 'вежливый вариант на дне').toBe(true)
    for (const c of lowAll) expect(fromPool(c.text, LOW), c.text).toBe(true)
    for (const c of bottomAll) expect(fromPool(c.text, BOTTOM), c.text).toBe(true)
    expectPoolTones(bottomAll, 'bottom')
    expect(bottomAll.some((c) => fromPool(c.text, P_DESPERATE.bottom))).toBe(true)
    expect(bottomSets.flat().filter((c) => fromPool(c.text, LOW))).toEqual([])
  })

  it('отчаянная реплика: ссора не греется, Алик отвечает «дыши» и отмазывается как обычно', async () => {
    const replies = new Set(DESPERATE_REPLY.map(valueOf))
    let sent = 0
    for (let seed = 1; seed <= 20 && sent < 5; seed++) {
      const { game } = makeGame({ seed })
      setMoney(game, Game.MONEY_BOTTOM)
      const c = rebuilds(game, 30).flat().find((x) => x.act === 'desperate' && x.text.includes('на карте ДНО'))
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

  it('конкретные реплики получают ответ на свой предмет, общая фраза — общий ответ (#446)', async () => {
    const cases = [
      { level: 'low', ask: 'банк звонит чаще', reply: /банк.*звон/i },
      { level: 'low', ask: 'Списание завтра', reply: /списани[ея]|завтра/i, due: true },
      { level: 'bottom', ask: 'Я ПРОДАМ ПЛИТКУ', reply: /плитк/i },
      { level: 'bottom', ask: 'УЖЕ ПРОДАЛ ПЛИТКУ', reply: /плитк/i, soldTile: true },
      { level: 'bottom', ask: 'банк прислал соболезнования', reply: /соболезн/i },
      { level: 'bottom', ask: 'Банкомат посмотрел', reply: /банкомат/i },
    ] as const
    for (const c of cases) {
      const { game } = makeGame({ seed: 7 })
      setMoney(game, c.level === 'low' ? Game.MONEY_LOW : Game.MONEY_BOTTOM)
      if ('soldTile' in c) game.S.mem[sold('tile')] = true
      if ('due' in c) {
        game.S.mem[billDueAt('rent')] = game.S.day + 1
        game.S.mem['bills.rent.due'] = true
      }
      const choice = choiceWith(game, c.ask)
      expect(choice.act, c.ask).toBe('desperate')
      const from = game.S.msgs.length
      await game.send(choice)
      expect(firstReply(game, from), c.ask).toMatch(c.reply)
    }

    const { game } = makeGame({ seed: 7 })
    setMoney(game, Game.MONEY_BOTTOM)
    const generic = choiceWith(game, 'на карте ДНО')
    const from = game.S.msgs.length
    await game.send(generic)
    expect(new Set(DESPERATE_REPLY.map(valueOf)).has(firstReply(game, from)!)).toBe(true)
  })

  it('перефразированная конкретная реплика сохраняет адрес ответа (#446)', () => {
    const { game } = makeGame({ seed: 7 })
    const pool = [{ t: DESPERATE_PAIRS.atm.ask, arg: 'atm' }]
    const first = game.poorChoice('ATM_REPEAT', pool, { act: true })
    const repeated = game.poorChoice('ATM_REPEAT', pool, { act: true })
    expect(first?.text).toBe(DESPERATE_PAIRS.atm.ask)
    expect(repeated?.text).toContain(DESPERATE_PAIRS.atm.ask)
    expect(repeated?.text).not.toBe(first?.text)
    expect(repeated?.value).toEqual(pool[0])
  })

  it('повтор конкретной реплики не дублирует дословно ответ Алика (#446)', async () => {
    const { game } = makeGame({ seed: 7 })
    const from = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'desperate', arg: 'atm' })
    const first = firstReply(game, from)
    const again = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'desperate', arg: 'atm' })
    const second = firstReply(game, again)
    expect(first).toMatch(/банкомат/i)
    expect(second).toMatch(/банкомат/i)
    expect(second).not.toBe(first)
  })

  it('прямой ответ о банке предшествует реакции на отключённый свет; свет звучит позже (#446)', async () => {
    const { game } = makeGame({ seed: 7 })
    setMoney(game, Game.MONEY_LOW)
    game.S.mem['light.off'] = true
    const choice = choiceWith(game, 'банк уже спрашивает про вас')
    const from = game.S.msgs.length
    await game.send(choice)
    expect(firstReply(game, from)).toMatch(/банк.*имени/i)
    expect(game.S.msgs.slice(from).some((m) => m.kind === 'text' && /Свет отключили/.test(m.text))).toBe(false)
    expect(game.S.rules.once.Idle_LightOff).toBeUndefined()

    expect(game.rules.collect({ event: 'AlikIdle' }, game.facts()).some((r) => r.name === 'Idle_LightOff')).toBe(true)
    let lightReply: string | undefined
    for (let i = 0; i < 40 && !lightReply; i++) {
      const later = game.S.msgs.length
      if ((await game.fire('AlikIdle'))?.name === 'Idle_LightOff') lightReply = firstReply(game, later)
    }
    expect(lightReply).toMatch(/Свет отключили/)
    expect(game.S.rules.once.Idle_LightOff).toBe(true)
  })

  it('любая реплика P_MONEY получает ответ раньше фоновых последствий (#459), общий ответ — в её тоне (#480)', async () => {
    const pol = new Set(MONEY_REPLY_POLITE.map(valueOf))
    const neu = new Set(MONEY_REPLY_NEUTRAL.map(valueOf))
    const cases = [
      { level: 'low', ask: 'я не давлю. Но банк давит', pool: pol },
      { level: 'low', ask: 'банк уже спрашивает про вас', reply: /банк.*имени/i },
      { level: 'low', ask: 'до списания. Оно не ждёт', pool: pol },
      { level: 'low', ask: 'карта худеет', pool: neu },
      { level: 'low', ask: 'низкий остаток', pool: neu },
      { level: 'low', ask: 'у меня мало', pool: neu },
      { level: 'bottom', ask: 'всё ещё вежливый', pool: pol },
      { level: 'bottom', ask: 'не берёт трубку', pool: pol },
      { level: 'bottom', ask: 'до конца недели', pool: pol },
      { level: 'bottom', ask: 'Ниже только фундамент', pool: neu },
      { level: 'bottom', ask: 'платил улыбкой', pool: neu },
    ] as const
    for (const c of cases) {
      const { game } = makeGame({ seed: 7 })
      setMoney(game, c.level === 'low' ? Game.MONEY_LOW : Game.MONEY_BOTTOM)
      game.S.mem['light.off'] = true
      const choice = choiceWith(game, c.ask)
      expect(choice.act, c.ask).toBe('desperate')
      const from = game.S.msgs.length
      await game.send(choice)
      const first = firstReply(game, from)
      if ('reply' in c) expect(first, c.ask).toMatch(c.reply)
      else expect(c.pool.has(first!), `${c.ask} → ${first ?? 'молчание'}`).toBe(true)
      expect(game.S.msgs.slice(from).some((m) => m.kind === 'text' && /Свет отключили/.test(m.text)), c.ask).toBe(false)
      expect(game.S.rules.once.Idle_LightOff, c.ask).toBeUndefined()
    }
    // свет звучит, но позже — своей инициативой
    const { game } = makeGame({ seed: 7 })
    setMoney(game, Game.MONEY_LOW)
    game.S.mem['light.off'] = true
    await game.send(choiceWith(game, 'карта худеет'))
    let light: string | undefined
    for (let i = 0; i < 40 && !light; i++) {
      const later = game.S.msgs.length
      if ((await game.fire('AlikIdle'))?.name === 'Idle_LightOff') light = firstReply(game, later)
    }
    expect(light).toMatch(/Свет отключили/)
  })

  it('общий ответ на реплику о деньгах звучит в её тоне, не голосом крика (#480)', async () => {
    const shout = new Set(DESPERATE_REPLY.map(valueOf))
    const pol = new Set(MONEY_REPLY_POLITE.map(valueOf))
    const neu = new Set(MONEY_REPLY_NEUTRAL.map(valueOf))
    // вежливая реплика на дне — вежливый ответ
    const p = makeGame({ seed: 7 }).game
    setMoney(p, Game.MONEY_BOTTOM)
    const pc = choiceWith(p, 'всё ещё вежливый')
    const pFrom = p.S.msgs.length
    await p.send(pc)
    const pFirst = firstReply(p, pFrom)!
    expect(pol.has(pFirst), pFirst).toBe(true)
    expect(shout.has(pFirst), pFirst).toBe(false)
    // спокойная реплика — спокойный ответ
    const n = makeGame({ seed: 7 }).game
    setMoney(n, Game.MONEY_LOW)
    const nc = choiceWith(n, 'карта худеет')
    const nFrom = n.S.msgs.length
    await n.send(nc)
    const nFirst = firstReply(n, nFrom)!
    expect(neu.has(nFirst), nFirst).toBe(true)
    expect(shout.has(nFirst), nFirst).toBe(false)
    // крик капсом по-прежнему получает пул крика
    const s = makeGame({ seed: 7 }).game
    setMoney(s, Game.MONEY_BOTTOM)
    const sc = choiceWith(s, 'на карте ДНО')
    const sFrom = s.S.msgs.length
    await s.send(sc)
    expect(shout.has(firstReply(s, sFrom)!)).toBe(true)
  })

  it('вежливый режим Алика отвечает на деньги голосом регламента (#480)', async () => {
    const regiment = new Set(MONEY_REPLY_REGIMENT.map(valueOf))
    const shout = new Set(DESPERATE_REPLY.map(valueOf))
    const game = makeGame({ seed: 7 }).game
    setMoney(game, Game.MONEY_BOTTOM)
    game.S.mem.polite = true
    const c = choiceWith(game, 'всё ещё вежливый')
    expect(c.act).toBe('desperate')
    const from = game.S.msgs.length
    await game.send(c)
    const first = firstReply(game, from)!
    expect(regiment.has(first), first).toBe(true)
    expect(shout.has(first), first).toBe(false)
    // и спокойная реплика о деньгах — тем же голосом режима
    const n = makeGame({ seed: 7 }).game
    setMoney(n, Game.MONEY_LOW)
    n.S.mem.polite = true
    const nc = choiceWith(n, 'карта худеет')
    const nFrom = n.S.msgs.length
    await n.send(nc)
    expect(regiment.has(firstReply(n, nFrom)!)).toBe(true)
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

  it('ответы про «дно» — только на moneyBottom; на «мало» их нет (#187/#495)', async () => {
    // каждый пул общего ответа держит ≥1 гейт moneyBottom — снять гейт с любого → красный
    for (const [name, pool] of MONEY_REPLY_POOLS) {
      expect(bottomReplies(pool).length, name).toBeGreaterThan(0)
    }
    expect(BOTTOM_REPLIES.length).toBeGreaterThanOrEqual(MONEY_REPLY_POOLS.length)

    const low = makeGame({ seed: 3 }).game
    setMoney(low, Game.MONEY_LOW)
    for (let i = 0; i < 40; i++) {
      setMoney(low, Game.MONEY_LOW) // уровень держим: партия тратит деньги, и «мало» уезжает в «дно»
      low.S.choices = null
      const c = low.buildChoices().find((x) => x.act === 'desperate')
      if (!c) continue
      const from = low.S.msgs.length
      await low.send(c)
      const first = firstReply(low, from)
      expect(BOTTOM_REPLIES.includes(first!), first).toBe(false)
    }
    // на дне — путём игрока (buildChoices→send) доезжаем до gated-строк каждого пула
    const routes: { ask: string; polite?: boolean }[] = [
      { ask: 'на карте ДНО' }, // DESPERATE_REPLY (крик)
      { ask: 'всё ещё вежливый' }, // MONEY_REPLY_POLITE
      { ask: 'Ниже только фундамент' }, // MONEY_REPLY_NEUTRAL
      { ask: 'всё ещё вежливый', polite: true }, // MONEY_REPLY_REGIMENT
    ]
    for (const route of routes) {
      let hit = false
      for (let seed = 1; seed <= 24 && !hit; seed++) {
        const bottom = makeGame({ seed }).game
        setMoney(bottom, Game.MONEY_BOTTOM)
        if (route.polite) bottom.S.mem.polite = true
        const c = choiceWith(bottom, route.ask)
        expect(c.act, route.ask).toBe('desperate')
        const from = bottom.S.msgs.length
        await bottom.send(c)
        const first = firstReply(bottom, from)
        if (first && BOTTOM_REPLIES.includes(first)) hit = true
      }
      expect(hit, `дно-ответ для «${route.ask}»${route.polite ? ' (регламент)' : ''}`).toBe(true)
    }
  })

  it('в пуле отчаяния нет голода и табу money.md (#187)', () => {
    const all = [...P_DESPERATE.low, ...P_DESPERATE.bottom, ...DESPERATE_REPLY].map((e) => {
      const v = valueOf(e)
      return typeof v === 'string' ? v : v.t
    }).join('\n')
    expect(all).not.toMatch(/я ел|голод|есть нечего|не ем|голодаю/i)
  })
})
