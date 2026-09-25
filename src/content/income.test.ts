// Приход не урезается молча (#322): передышка после дна — до порога «мало», и текст называет зачтённое;
// деньги Алика (переводы, серии, сцены, День выплаты) приходят целиком. NC к каждому — вернуть потолок в adjustMoney.
import { describe, it, expect } from 'vitest'
import { Game } from '../engine/game'
import { makeGame, setMoney, cards } from '../test/helpers'
import { moneyPoor, nextTransfer } from './memkeys'
import { THINGS, MOM_HELPS, creditOffer, creditStage, sold, momHelp, momDone, loanTaken } from './credit'

const poor = (money: number) => {
  const { game } = makeGame()
  setMoney(game, money)
  game.S.mem[moneyPoor] = true
  return game
}
const lastCard = (g: Game, app: string) => cards(g, app).at(-1)!
const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽` // как Game.rub: разделитель тысяч — не обычный пробел

describe('приход после дна (#322)', () => {
  it('adjustMoney не режет: сколько попросили, столько на карте', () => {
    const game = poor(Game.MONEY_LOW)
    expect(game.adjustMoney(500, 'Выплата')).toBe(true)
    expect(game.S.money).toBe(Game.MONEY_LOW + 500)
    expect(game.S.bank?.lines['+Выплата'].sum).toBe(500)
  })

  it('День выплаты: исход «настоящие деньги» кладёт на карту весь долг — путём игрока', async () => {
    const game = poor(5_000)
    Object.assign(game.S.ach, { saint: 1, court: 1, q_hash: 1, q_goat: 1, q_niva: 1, q_mama: 1, q_photo: 1 })
    game.S.mem.caught = 3
    const debt = game.S.debt
    expect(debt).toBeGreaterThan(100_000)
    expect((await game.fire('PaydayOutcome'))?.name).toBe('Payday_real')
    expect(game.S.money).toBe(5_000 + debt)
    expect(game.S.debt).toBe(0)
    expect(game.moneyLevel()).toBe('normal') // после выплаты бедность снята: деньги настоящие
  })

  it('День выплаты: «монетами» — тоже весь долг', async () => {
    const game = poor(Game.MONEY_LOW)
    game.S.mem['payday.caught'] = true
    const debt = game.S.debt
    expect((await game.fire('PaydayOutcome'))?.name).toBe('Payday_coins')
    expect(game.S.money).toBe(Game.MONEY_LOW + debt)
  })

  it('перевод Алика приходит целиком, долг уменьшается на ту же сумму', async () => {
    const game = poor(8_000)
    game.S.mem[nextTransfer] = 5_000
    const debt = game.S.debt
    await game.transfer()
    const bubble = game.S.msgs.findLast((m) => m.kind === 'transfer')!
    expect(bubble.kind === 'transfer' && bubble.amount).toBe(5_000)
    expect(game.S.money).toBe(13_000)
    expect(game.S.debt).toBe(debt - 5_000)
  })

  it('серия с fx.pay: 500 ₽ Алика на карте даже на пороге', async () => {
    const game = poor(Game.MONEY_LOW)
    const debt = game.S.debt
    await game.playEpisode({ m: ['Держи, брат.'], fx: { pay: 500 } })
    expect(game.S.money).toBe(Game.MONEY_LOW + 500)
    expect(game.S.debt).toBe(debt - 500)
  })

  it('Авито: карточка называет зачтённое, сводка — то же число; на пороге продажи нет', () => {
    const game = poor(5_000)
    game.maybeCreditOffer() // дно → карточка с «продать»
    const card = lastCard(game, 'Банк')
    expect(card.offer?.sell).toBeTruthy()
    game.answerCard(card.id, 'sell')
    const got = Game.MONEY_LOW - 5_000
    expect(got).toBeLessThan(THINGS[0].amount) // микроволновка 4 500 не влезает целиком
    expect(game.S.money).toBe(Game.MONEY_LOW)
    expect(game.S.mem[sold('microwave')]).toBe(true)
    expect(game.S.msgs.find((m) => m.id === card.id)).toMatchObject({ answered: true, result: `${THINGS[0].done}. +${rub(got)}. Баланс: ${rub(Game.MONEY_LOW)}` })
    expect(game.S.bank?.lines['+Авито'].sum).toBe(got)
    // места нет — продажа не происходит и вещь не пропадает; карточка ждёт
    setMoney(game, 5_000)
    game.maybeCreditOffer('Продано, а остаток')
    const again = lastCard(game, 'Банк')
    expect(again.id).not.toBe(card.id)
    setMoney(game, Game.MONEY_LOW)
    game.answerCard(again.id, 'sell')
    expect(game.S.mem[sold('guitar')]).toBeFalsy()
    expect(game.S.money).toBe(Game.MONEY_LOW)
    expect((game.S.msgs.find((m) => m.id === again.id) as { answered?: boolean }).answered).toBeFalsy()
  })

  it('кредит даёт ровно обещанное, даже если баланс с тех пор изменился (#337)', () => {
    const game = poor(5_000)
    game.maybeCreditOffer() // обещано 4 000 — до порога от 5 000
    const card = lastCard(game, 'Банк')
    expect(card.text).toContain(rub(4_000))
    setMoney(game, Game.MONEY_LOW) // пришли деньги Алика — обещание не пересчитывается
    game.answerCard(card.id, 'take')
    expect(game.S.mem[loanTaken('consumer')]).toBe(true)
    expect(game.S.money).toBe(Game.MONEY_LOW + 4_000)
    expect(game.S.mem[creditOffer]).toBe(false)
  })

  it('мама: текст называет зачтённое; на пороге помощь не тратится', () => {
    const game = poor(5_000)
    for (const t of THINGS) game.S.mem[sold(t.id)] = true
    game.S.mem[creditStage] = 0
    game.maybeCreditOffer() // всё продано без кредита → мама
    expect(game.S.money).toBe(5_000 + MOM_HELPS[0].amount) // пенсия влезает целиком
    expect(lastCard(game, 'Мама').text).toContain(`перевела с пенсии ${rub(1_500)}`)
    game.tryMomHelp() // закатки 4 000 при месте 2 500
    expect(game.S.money).toBe(Game.MONEY_LOW)
    expect(lastCard(game, 'Мама').text).toContain(`закатки, ${rub(2_500)}`)
    expect(game.S.bank?.lines['+Мама'].sum).toBe(1_500 + 2_500)
    game.tryMomHelp() // места нет — дача остаётся на потом
    expect(game.S.mem[momHelp('dacha')]).toBeFalsy()
    expect(cards(game, 'Мама').length).toBe(2)
    setMoney(game, 4_000)
    game.tryMomHelp()
    expect(game.S.money).toBe(Game.MONEY_LOW)
    expect(lastCard(game, 'Мама').text).toContain(`Перевела ${rub(5_000)}`)
    expect(game.S.mem[momDone]).toBe(true)
  })

  it('без дна помощь и продажа приходят целиком (NC relief)', () => {
    const { game } = makeGame()
    setMoney(game, 5_000)
    expect(game.relief(45_000)).toBe(45_000)
    game.tryMomHelp()
    expect(game.S.money).toBe(5_000 + MOM_HELPS[0].amount)
  })
})
