import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeGame } from '../test/helpers'
import { fieldWrites, inMethod, sources } from '../test/field'

// Долг пишет только Game.adjustDebt: прямую запись `S.debt = …` не пропускает тип (readonly в GameState),
// а разбор `test/field.ts` ловит то, что тип пропускает (переменную, Object.assign, defineProperty, Reflect.set).
const game = join('src', 'engine', 'game.ts')
const debtWrites = (file: string, allowAdjust = true) => fieldWrites(file, 'debt', allowAdjust ? inMethod(game, 'adjustDebt') : undefined)

describe('долг: одна точка записи', () => {
  it('страж видит исходники и единственную законную запись', () => {
    const game = join('src', 'engine', 'game.ts')
    expect(sources).toContain(game)
    // без исключения страж находит ровно одну запись — ту, что в adjustDebt
    expect(debtWrites(game, false)).toHaveLength(1)
  })

  it('никто, кроме Game.adjustDebt, не пишет в debt', () => {
    expect(sources.flatMap((f) => debtWrites(f))).toEqual([])
  })

  it('после Дня выплаты: сообщение о долге — только если он изменился, работа не двигает календарь, перевода нет', async () => {
    const { ARCS } = await import('../content/arcs')
    const { game } = makeGame()
    game.S.mem.payday = 'default' // выплата состоялась: долг запечатан
    const debt = game.S.debt
    const sys = () => game.S.msgs.filter((m) => m.kind === 'sys').map((m) => m.text)
    // серия с fx.debt и sys «Алик вычел из долга 10 000 ₽»
    const ep = ARCS.tile.eps.find((e) => e.fx?.debt === -10000)!
    await game.playEpisode(ep, 'tile')
    expect(sys().join(' ')).not.toMatch(/вычел из долга/)
    // узел сцены с fx.debt и sys «Долг Алика вырос на 1 800 ₽»
    await game.enterNode('meet', 'cafe3')
    expect(sys().join(' ')).not.toMatch(/Долг Алика вырос/)
    game.S.scene = null
    // допработа: «Да» не двигает ни долг, ни календарь
    game.alikMsg({ kind: 'job', from: 'alik', text: 'Сделаешь забор?' })
    const job = game.S.msgs.find((m) => m.kind === 'job')!
    const day = game.S.day
    await game.answerJob(job.id, true)
    expect(game.S.day).toBe(day)
    // перевод: пузыря без денег нет
    const n = game.S.msgs.length
    await game.transfer()
    game.awayMsg('transfer') // перевод в пачке «пока тебя не было»
    expect(game.S.msgs.slice(n).some((m) => m.kind === 'transfer')).toBe(false)
    expect(game.S.debt).toBe(debt)
  })

  it('до Дня выплаты те же пути двигают долг и объявляют это', async () => {
    const { ARCS } = await import('../content/arcs')
    const { game } = makeGame()
    const debt = game.S.debt
    await game.playEpisode(ARCS.tile.eps.find((e) => e.fx?.debt === -10000)!, 'tile')
    expect(game.S.debt).toBe(debt - 10000)
    expect(game.S.msgs.some((m) => m.kind === 'sys' && /вычел из долга 10 000/.test(m.text))).toBe(true)
    await game.enterNode('meet', 'cafe3')
    expect(game.S.debt).toBe(debt - 10000 + 1800)
    expect(game.S.msgs.some((m) => m.kind === 'sys' && /Долг Алика вырос на 1 800/.test(m.text))).toBe(true)
  })
})
