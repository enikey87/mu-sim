import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { BILLS, billUnpaid, lightOff, billDueAt } from './bills'
import { dueIn } from '../engine/time'

describe('платежи по календарю', () => {
  it('на старте стоят сроки трёх платежей', () => {
    const { game } = makeGame()
    for (const b of BILLS) {
      const at = Number(game.S.mem[billDueAt(b.id)])
      expect(at, b.id).toBeGreaterThan(game.S.day)
      expect(at).toBe(game.S.day + dueIn(b.due, game.S.day))
    }
  })
  it('хватает денег — списание через adjustMoney, неоплаты нет', () => {
    const { game } = makeGame()
    const before = game.S.money
    game.chargeBill('phone')
    expect(game.S.money).toBe(before - 550)
    expect(game.S.mem[billUnpaid('phone')]).toBe(false)
    expect(game.ui.notif?.text).toMatch(/Списание/)
  })
  it('не хватает — СМС отказа, unpaid и последствие', () => {
    const { game } = makeGame()
    game.S.money = 100
    game.chargeBill('rent')
    expect(game.S.money).toBe(100)
    expect(game.S.mem[billUnpaid('rent')]).toBe(true)
    expect(game.S.mem[lightOff]).toBe(true)
    expect(game.ui.notif?.text).toMatch(/недостаточно средств/i)
  })
  it('после выселения коммуналка не списывается', () => {
    const { game } = makeGame()
    game.S.mem.evicted = true
    const before = game.S.money
    game.chargeBill('rent')
    expect(game.S.money).toBe(before)
  })
  it('в эндгейме платежи молчат', () => {
    const { game } = makeGame()
    game.S.mem.payday = 'default'
    const before = game.S.money
    game.chargeBill('phone')
    expect(game.S.money).toBe(before)
  })
  it('свет отключили не трогает зарядку', async () => {
    const { game } = makeGame()
    game.S.mem[lightOff] = true
    game.battery.die()
    await game.battery.charge()
    expect(game.S.battery).toBe(100)
  })
  it('реплика про свет — только при light.off', () => {
    const { game } = makeGame()
    const names = (g: typeof game) => g.rules.collect({ event: 'AlikTurn' }, g.facts()).map((r) => r.name)
    expect(names(game)).not.toContain('Turn_LightOff')
    game.S.mem[lightOff] = true
    expect(names(game)).toContain('Turn_LightOff')
  })
  it('BillWarn ставит due и шлёт СМС', async () => {
    const { game } = makeGame()
    await game.fire('BillWarn', { bill: 'transit' })
    expect(game.S.mem['bills.transit.due']).toBe(true)
    expect(game.ui.notif?.text).toMatch(/Завтра списание/)
  })
})
