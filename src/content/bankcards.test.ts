// Деньги в ленте сходятся (#337): обещанное = зачисленное, шапка предложения без остатка,
// «остаток критический» — раз на новое падение (перерыв POOR_REPEAT_DAYS), а не на каждую неделю счетов.
import { describe, it, expect } from 'vitest'
import { Game } from '../engine/game'
import { makeGame, setMoney, cards } from '../test/helpers'
import { creditOffer, criticalAt, creditOfferSum, moneyPoor } from './memkeys'
import { LOANS, loanPayment, loanTaken, momHelp, sold } from './credit'

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`
const bank = (g: Game) => cards(g, 'Банк')
const offers = (g: Game) => bank(g).filter((c) => c.offer)
const crit = (g: Game) => bank(g).filter((c) => /критический/.test(c.text)) // без недельных сводок: смена недели их выпускает сама

describe('карточки банка (#337)', () => {
  it('кредит обещает ровно то, что даст: сумма в шапке = зачислено, остаток — только в результате', () => {
    const { game } = makeGame()
    setMoney(game, 12_400)
    game.adjustMoney(-9_000, 'Гречка') // 3 400 — дно; до порога влезает 5 600
    const [card] = offers(game)
    expect(card.text).toBe(`Остаток критический после «Гречка». ${LOANS[0].offer.replace('{sum}', rub(5_600))}`)
    expect(card.text.match(/₽/g)).toHaveLength(1) // единственное число — обещанная сумма
    expect(game.S.mem[creditOfferSum]).toBe(5_600)
    game.adjustMoney(-1_000, 'Связь') // карточку жмут позже — деньги успели уйти
    game.answerCard(card.id, 'take')
    expect(game.S.money).toBe(2_400 + 5_600) // не 6 600 «до порога» на момент нажатия
    expect(bank(game).find((c) => c.id === card.id)?.result).toBe(`Кредит взят: +${rub(5_600)}. Баланс: ${rub(8_000)}`)
    expect(Number(game.S.mem[loanPayment('consumer')])).toBe(Math.round(LOANS[0].payment * 5_600 / LOANS[0].amount))
    expect(game.S.mem[creditOfferSum]).toBeUndefined()
  })

  it('«не сейчас» и продажа снимают обещание; без карточки takeCredit считает сам (NC)', () => {
    const { game } = makeGame()
    setMoney(game, 5_000)
    game.S.mem[moneyPoor] = true
    game.maybeCreditOffer()
    game.answerCard(offers(game).at(-1)!.id, 'later')
    expect(game.S.mem[creditOfferSum]).toBeUndefined()
    game.S.mem[creditOffer] = true
    game.takeCredit()
    expect(game.S.money).toBe(Game.MONEY_LOW)
  })

  it('новое падение — не раньше чем через POOR_REPEAT_DAYS: неделя счетов у дна не даёт карточки', () => {
    const { game } = makeGame()
    setMoney(game, 12_400)
    game.adjustMoney(-7_000, 'Гречка') // 5 400 — первое дно, карточка с кнопками
    expect(offers(game)).toHaveLength(1)
    expect(game.S.mem[criticalAt]).toBe(game.S.day)
    game.answerCard(offers(game)[0].id, 'sell') // микроволновка: 5 400 → 9 000
    expect(game.S.money).toBe(Game.MONEY_LOW)
    game.adjustMoney(-4_000, 'Коммуналка') // 5 000 — снова дно, но тот же день: не новость
    expect(crit(game)).toHaveLength(1)
    expect(game.S.mem[creditOffer]).toBe(false)
    game.S.day += 13
    game.adjustMoney(4_000, 'Перевод от Алика')
    game.adjustMoney(-4_000, 'Коммуналка') // 13 дней — ещё рано
    expect(crit(game)).toHaveLength(1)
    game.S.day += 1
    game.adjustMoney(4_000, 'Перевод от Алика')
    game.adjustMoney(-4_000, 'Связь') // 14 дней — новое падение: карточка с новой причиной
    expect(crit(game)).toHaveLength(2)
    expect(crit(game).at(-1)!.text).toMatch(/^Остаток критический после «Связь»\. Вам одобрен кредит «Всё будет»/)
  })

  it('ход игрока — не падение: продажа, не вытащившая со дна, предлагает следующую сразу', () => {
    const { game } = makeGame()
    setMoney(game, 7_000)
    game.adjustMoney(-6_000, 'Гречка') // 1 000 — дно
    const first = offers(game)[0]
    game.answerCard(first.id, 'sell') // +4 500 → 5 500, всё ещё дно
    const again = offers(game).at(-1)!
    expect(again.id).not.toBe(first.id)
    expect(again.text).toMatch(/^Продано, а остаток всё ещё критический\. /)
    expect(again.text.match(/₽/g)).toHaveLength(1)
  })

  it('без ступени лестницы «критический» и мама — тоже раз на новое падение', () => {
    const { game } = makeGame()
    game.S.mem['credit.broke'] = true
    setMoney(game, 7_000)
    game.adjustMoney(-6_000, 'Гречка')
    expect(bank(game).at(-1)!.text).toMatch(/^Остаток критический: /)
    expect(game.S.mem[momHelp('pension')]).toBe(true)
    game.adjustMoney(7_000, 'Перевод от Алика')
    game.adjustMoney(-7_000, 'Гречка') // тот же день — ни карточки, ни закаток
    expect(crit(game)).toHaveLength(1)
    expect(game.S.mem[momHelp('pickles')]).toBeFalsy()
    game.S.day += 14
    game.adjustMoney(7_000, 'Перевод от Алика')
    game.adjustMoney(-7_000, 'Гречка')
    expect(crit(game)).toHaveLength(2)
    expect(game.S.mem[momHelp('pickles')]).toBe(true)
  })

  it('NC: без перерыва каждое падение снова несёт карточку (первое дно — всегда)', () => {
    const { game } = makeGame()
    setMoney(game, 12_400)
    expect(game.S.mem[criticalAt]).toBeUndefined()
    game.adjustMoney(-7_000, 'Гречка')
    expect(offers(game)).toHaveLength(1)
    expect(game.S.mem[sold('microwave')]).toBeFalsy()
    expect(game.S.mem[loanTaken('consumer')]).toBeFalsy()
  })
})
