// После Дня выплаты банк/МФО/коллекторы по долгу молчат и в пуле NOTIF (#366).
import { describe, it, expect } from 'vitest'
import { makeGame, setMoney, cards } from '../test/helpers'
import { NOTIF, type Notif } from './life'
import { endgame, paydayScene } from './memkeys'
import { creditStage } from './credit'

/** Приложения денег игрока: без missing(payday)+missing(endgame) новая строка краснеет. */
const MONEY_APPS = new Set(['Банк', 'МФО', 'Коллекторы'])

const sealedOff = (n: Notif): boolean => {
  const when = n.when ?? []
  const miss = (key: string) => when.some((c) => c.key === key && c.op === '!exist')
  return miss(paydayScene) && miss(endgame.active)
}

describe('банк после выплаты молчит во всех путях (#366)', () => {
  it('каждый банк/МФО/коллекторы в NOTIF закрыт печатью денег', () => {
    const money = NOTIF.filter((n) => MONEY_APPS.has(n.app))
    expect(money.length, 'пул денег пуст — проверка была бы пустой').toBeGreaterThan(0)
    for (const n of money) expect(sealedOff(n), n.t).toBe(true)
  })

  it('NC: снять гейт с банка — сторож краснеет', () => {
    const live = NOTIF.find((n) => n.app === 'Банк' && /Кредит одобрен/.test(n.t))!
    const ungated: Notif = {
      ...live,
      when: (live.when ?? []).filter((c) => c.key !== paydayScene && c.key !== endgame.active),
    }
    expect(sealedOff(ungated)).toBe(false)
    expect(sealedOff(live)).toBe(true)
  })

  it('до выплаты банк из пула доступен; после — нет', () => {
    const { game } = makeGame()
    game.S.mem[creditStage] = 1
    game.S.stats.fifty = 3
    const bankOpen = () =>
      game.lines.eligible('NOTIF', NOTIF, game.lineFacts()).some((p) => (p.spec as Notif).app === 'Банк')
    expect(bankOpen()).toBe(true)
    game.S.mem[paydayScene] = 'default'
    expect(game.moneySealed()).toBe(true)
    expect(bankOpen()).toBe(false)
    delete game.S.mem[paydayScene]
    game.S.mem[endgame.active] = true
    expect(bankOpen()).toBe(false)
  })

  it('после выплаты randomNotif и прямой notify не дают карточек банка/МФО', () => {
    const { game } = makeGame()
    setMoney(game, 50_000)
    game.S.mem[creditStage] = 2
    game.S.stats.fifty = 5
    game.S.mem[paydayScene] = 'default'
    expect(game.moneySealed()).toBe(true)
    const before = cards(game, 'Банк').length + cards(game, 'МФО').length
    for (let i = 0; i < 200; i++) game.randomNotif()
    expect(game.notify('🏦', 'Банк', 'Кредит одобрен! после печати', { event: 'bank.offer' })).toBe(false)
    expect(game.notify('🏦', 'МФО', 'Мы записываем после печати', { event: 'bank.refusal' })).toBe(false)
    expect(cards(game, 'Банк').length + cards(game, 'МФО').length).toBe(before)
  })
})
