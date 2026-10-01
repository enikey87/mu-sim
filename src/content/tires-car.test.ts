// Продажа зимней резины не отрицает машину, которую партия уже показала: без «Нивы» продажа
// убирает машину (факт car.gone), а не объявляет «машины у вас нет» (#530).
import { describe, it, expect, vi } from 'vitest'
import { makeGame, cards, setMoney } from '../test/helpers'
import type { Game } from '../engine/game'
import { NOTIF } from './life'
import { THINGS, sold } from './credit'
import { carGone } from './memkeys'
import { is } from './fact'

const fine = NOTIF.find((n) => n.charge === 500)!
const tires = THINGS.find((t) => t.id === 'tires')!

/** Штраф за парковку — через показ карточки, как в партии (life-cards.test.ts). */
const showFine = (game: Game) => {
  const pick = game.lines.pick.bind(game.lines)
  const stub = vi.spyOn(game.lines, 'pick').mockImplementation((key, pool, facts, opts) =>
    pick(key, key === 'NOTIF' ? [fine] : pool, facts, opts))
  try { game.randomNotif() } finally { stub.mockRestore() }
}

/** Карточка банка на дне, где кнопка «продать» предлагает именно резину (остальное уже продано). */
const tiresCard = (game: Game) => {
  game.S.mem[sold('microwave')] = true
  game.S.mem[sold('guitar')] = true
  game.S.mem[sold('tile')] = true
  setMoney(game, 100)
  game.chargeBill('rent') // отказ платежа → карточка с предложением
  const card = cards(game, 'Банк').at(-1)!
  expect(card.offer?.sell).toBe('Продать зимнюю резину')
  return card
}
const sellResult = (game: Game, id: number): string =>
  cards(game, 'Банк').find((c) => c.id === id)?.result ?? ''

describe('продажа резины не отрицает машину (#530)', () => {
  it('путём игрока: штраф за парковку → продажа резины через карточку банка → текст не отрицает машину', () => {
    const { game } = makeGame({ seed: 3 })
    showFine(game)
    expect(cards(game, 'Госуслуги').some((m) => /Штраф/.test(m.text)), 'партия уже показала машину (штраф)').toBe(true)

    const card = tiresCard(game)
    game.answerCard(card.id, 'sell')

    expect(game.S.mem[sold('tires')]).toBe(true)
    expect(game.S.mem[carGone], 'продажа без «Нивы» записала, что машина ушла с ней').toBe(true)
    const result = sellResult(game, card.id)
    expect(result).toContain('Зимнюю резину продали')
    expect(result).not.toContain('Машины у вас нет')
    expect(game.holds(is('has.car')), 'машина ушла с продажей — штрафы и бензин остановлены').toBe(false)
  })

  it('«Нива» из бартера — машина: продажа резины её не отрицает, has.car живёт', () => {
    const { game } = makeGame({ seed: 3 })
    game.S.items.push('«Нива» 1987 года') // бартер, scenes.ts — без финала и niva.player

    const card = tiresCard(game)
    game.answerCard(card.id, 'sell')

    const result = sellResult(game, card.id)
    expect(result).toContain('«Нива»')
    expect(result).not.toContain('Машины у вас нет')
    expect(game.S.mem[carGone], 'с «Нивой» продажа машину не убирает').toBeFalsy()
    expect(game.holds(is('has.car')), 'бартерная «Нива» — машина и после продажи резины').toBe(true)
  })

  it('NC: снять факт car.gone — текст снова отрицает машину', () => {
    const { game } = makeGame({ seed: 3 })
    const card = tiresCard(game)
    game.answerCard(card.id, 'sell')
    expect(game.S.mem[carGone]).toBe(true)

    delete game.S.mem[carGone]
    expect(game.thingDone(tires), 'без факта — прежнее «Машины у вас нет»: контроль жив').toContain('Машины у вас нет')
  })
})
