import { describe, it, expect } from 'vitest'
import { makeGame, flush, type CardMsg } from '../test/helpers'
import { creditOffer } from '../content/memkeys'

/** Баги оператора 23.10: варианты ответа менялись «на ходу» без фазы «?» —
 *  клик по карточке оффера (продать чайник и т.п.) и клик «Мууу» пересобирали ряд
 *  мгновенно; карточка при этом была некликабельной во время хода мира, но выглядела
 *  доступной. Здесь: маска «?» прячет пересборку (ряд за ней собирается синхронно —
 *  бот и рендер не видят старого), маска не блокирует ходы, карточка безопасна в ходе. */
describe('пересборка вариантов за маской «?» (баги 23.10)', () => {
  function offerCard(game: ReturnType<typeof makeGame>['game']): CardMsg {
    const card = game.push({ kind: 'card', time: '12:00', icon: '🏦', app: 'Банк', text: 'Вам одобрен кредит «Всё будет»', offer: { take: 'Взять кредит', sell: 'Продать микроволновку' } })
    if (card.kind !== 'card') throw new Error('карточка не собралась')
    return card
  }
  const answered = (game: ReturnType<typeof makeGame>['game'], id: number): boolean | undefined => {
    const m = game.S.msgs.find((x) => x.id === id)
    return m?.kind === 'card' ? m.answered : undefined
  }

  it('клик по карточке: ряд скрыт маской «?» и уже собран за ней — не прыжком на глазах', async () => {
    const { game, clock } = makeGame()
    game.S.mem[creditOffer] = true
    const before = game.choices
    const card = offerCard(game)
    game.answerCard(card.id, 'later')
    expect(game.ui.masked, 'сразу после клика ряд скрыт маской «?»').toBe(true)
    expect(game.ui.busy, 'маска не блокирует ходы').toBe(false)
    expect(game.S.choices, 'новый ряд собран синхронно — бот не видит старого').not.toBe(before)
    await flush()
    clock.runTimers()
    await flush()
    expect(game.ui.masked, 'маска снята').toBe(false)
    expect(answered(game, card.id), 'карточка отвечена').toBe(true)
  })

  it('карточка во время хода мира: мир меняется, маска хода не сорвана, варианты ждут его конца', () => {
    const { game } = makeGame()
    game.S.mem[creditOffer] = true
    const card = offerCard(game)
    const before = game.choices
    game.ui.busy = true // ход мира
    game.answerCard(card.id, 'later')
    expect(answered(game, card.id), 'карточка отвечена и в ходе: answerCard синхронен и безопасен').toBe(true)
    expect(game.ui.busy, 'маска хода не сорвана кликом').toBe(true)
    expect(game.ui.masked, 'своя маска не встаёт поверх хода').toBe(false)
    expect(game.S.choices, 'варианты не тронуты — ход сам пересоберёт').toBe(before)
  })

  it('«Мууу» вне хода: ряд меняется за маской, не прыжком', async () => {
    const { game, clock } = makeGame()
    const before = game.choices
    game.moo()
    expect(game.ui.masked, 'сразу после «Мууу» ряд скрыт маской «?»').toBe(true)
    expect(game.ui.busy, 'хода нет — только маска').toBe(false)
    expect(game.S.choices, 'ряд пересобран за маской — «Это корова?» доступен боту').not.toBe(before)
    await flush()
    clock.runTimers()
    await flush()
    expect(game.ui.masked).toBe(false)
  })

  it('«Мууу» во время хода мира: пересборки нет — её сделает сам ход', () => {
    const { game } = makeGame()
    const before = game.choices
    game.ui.busy = true
    game.moo()
    expect(game.ui.moos, 'само «Мууу» живёт').toHaveLength(1)
    expect(game.ui.masked, 'маски поверх хода нет').toBe(false)
    expect(game.S.choices, 'варианты не тронуты в ходе').toBe(before)
  })
})
