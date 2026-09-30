// Карточки ленты: названная сумма — движение денег; машина/сезон — по фактам партии (#488).
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { NOTIF, SPEND } from './life'
import { THINGS, sold } from './credit'
import { nivaPlayer } from './memkeys'
import { is } from './fact'
import { dateOf } from '../engine/time'

/** Сумма в тексте как уже случившийся платёж (не вакансия и не оффер). */
const PAID_IN_TEXT = /(?:Штраф|Списание)\s+([\d\s\u00a0]+)\s*₽/i
const parseRub = (s: string) => Number(s.replace(/\s|\u00a0/g, ''))

describe('карточки ленты и суммы (#488)', () => {
  it('NOTIF: сумма «штраф/списание» совпадает с charge или spend', () => {
    const paid = NOTIF.filter((n) => PAID_IN_TEXT.test(n.t))
    expect(paid.length, 'есть хотя бы штраф/списание').toBeGreaterThan(0)
    for (const n of paid) {
      const m = n.t.match(PAID_IN_TEXT)!
      const rub = parseRub(m[1]!)
      if (n.spend) continue
      expect(n.charge, n.t).toBe(rub)
    }
  })

  it('NC: штраф без charge — проверка красная', () => {
    const fine = NOTIF.find((n) => /Штраф/.test(n.t))!
    const saved = fine.charge
    try {
      delete fine.charge
      const paid = NOTIF.filter((n) => PAID_IN_TEXT.test(n.t) && !n.spend)
      expect(paid.every((n) => n.charge === parseRub(n.t.match(PAID_IN_TEXT)![1]!))).toBe(false)
    } finally {
      fine.charge = saved
    }
  })

  it('путём игрока: штраф списывает названные 500 ₽; после продажи резины — не приходит', () => {
    const { game } = makeGame({ seed: 3 })
    const fine = NOTIF.find((n) => n.charge === 500)!
    const before = game.S.money
    const p = game.linePicked('NOTIF_FINE_TEST', [fine])
    expect(p, 'штраф открыт до продажи резины').not.toBeNull()
    // тот же путь, что randomNotif: mark + charge + notify
    game.lines.mark(p!.id)
    if (fine.charge != null && !game.moneySealed()) game.adjustMoney(-fine.charge, fine.app, { group: fine.app })
    game.notify(fine.icon, fine.app, p!.text, { event: 'life' })
    expect(game.S.money).toBe(before - 500)
    expect(game.S.msgs.some((m) => m.kind === 'card' && m.text.includes('Штраф 500'))).toBe(true)

    game.S.mem[sold('tires')] = true
    expect(game.linePicked('NOTIF_FINE_GONE', [fine])).toBeNull()
  })

  it('продажа резины: «Летом» только в июне–августе', () => {
    const tires = THINGS.find((t) => t.id === 'tires')!
    expect(tires.done).not.toMatch(/Летом/)

    const spring = makeGame({ seed: 1 }).game
    spring.S.day = 10 // ~28 марта
    expect(dateOf(spring.S.day).getMonth() + 1).toBe(3)
    expect(spring.thingDone(tires)).not.toMatch(/Летом/)

    const summer = makeGame({ seed: 1 }).game
    summer.S.day = 100 // ~26 июня
    expect(dateOf(summer.S.day).getMonth() + 1).toBe(6)
    expect(summer.thingDone(tires)).toMatch(/Летом/)

    const autumn = makeGame({ seed: 1 }).game
    autumn.S.day = 200 // ~октябрь
    expect(dateOf(autumn.S.day).getMonth() + 1).toBeGreaterThan(8)
    expect(autumn.thingDone(tires)).not.toMatch(/Летом/)
  })
})

// Машина игрока — один факт `has.car`: есть, пока не продана резина, и всегда, пока «Нива» у игрока (#515).
describe('машина игрока — один факт (#515)', () => {
  const fine = NOTIF.find((n) => n.charge === 500)!
  const shop = NOTIF.find((n) => n.app === 'Шиномонтаж')!
  const tires = THINGS.find((t) => t.id === 'tires')!

  it('порядок «продажа резины → карточки»: без «Нивы» машины нет — штраф и шиномонтаж молчат', () => {
    const { game } = makeGame({ seed: 3 })
    expect(game.holds(is('has.car')), 'до продажи машина есть').toBe(true)
    expect(game.linePicked('CAR_A_FINE', [fine])).not.toBeNull()
    game.S.mem[sold('tires')] = true
    expect(game.holds(is('has.car'))).toBe(false)
    expect(game.linePicked('CAR_A_FINE_SOLD', [fine])).toBeNull()
    expect(game.linePicked('CAR_A_SHOP', [shop]), '«где машина» без машины не спрашивают').toBeNull()
    expect(game.thingDone(tires)).toContain('Машины у вас нет')
  })

  it('порядок «Нива у игрока → продажа резины»: машина остаётся, тексты не врут', () => {
    const { game } = makeGame({ seed: 3 })
    game.S.mem[nivaPlayer] = true
    game.S.mem[sold('tires')] = true
    expect(game.holds(is('has.car')), '«Нива» у игрока — машина есть даже без резины').toBe(true)
    expect(game.linePicked('CAR_B_FINE', [fine])).not.toBeNull()
    expect(game.linePicked('CAR_B_SHOP', [shop])).not.toBeNull()
    expect(game.thingDone(tires)).toContain('«Нива»')
    expect(game.thingDone(tires)).not.toContain('Машины у вас нет')
  })

  it('порядок «продажа резины → Нива у игрока»: факт восстанавливается', () => {
    const { game } = makeGame({ seed: 3 })
    game.S.mem[sold('tires')] = true
    expect(game.holds(is('has.car'))).toBe(false)
    game.S.mem[nivaPlayer] = true
    expect(game.holds(is('has.car'))).toBe(true)
    expect(game.linePicked('CAR_C_SHOP', [shop])).not.toBeNull()
    expect(game.linePicked('CAR_C_FINE', [fine])).not.toBeNull()
  })

  it('бензин списывается, только пока есть машина', () => {
    const withCar = makeGame({ seed: 3 }).game
    const spends = Array.from({ length: 200 }, () => withCar.draw('SPEND', SPEND))
    expect(spends).toContain('Бензин до объекта')

    const noCar = makeGame({ seed: 3 }).game
    noCar.S.mem[sold('tires')] = true
    const spendsNoCar = Array.from({ length: 200 }, () => noCar.draw('SPEND', SPEND))
    expect(spendsNoCar).not.toContain('Бензин до объекта')
    expect(new Set(spendsNoCar).size).toBeGreaterThan(3)
  })

  it('NC: снять гейт has.car со штрафа — противоречие возвращается', () => {
    const saved = fine.when
    try {
      fine.when = fine.when!.filter((c) => c.key !== 'has.car')
      const { game } = makeGame({ seed: 3 })
      game.S.mem[sold('tires')] = true
      expect(game.linePicked('CAR_NC_FINE', [fine]), 'без гейта штраф открыт после продажи — тест обязан быть красным').not.toBeNull()
    } finally {
      fine.when = saved
    }
  })
})
