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
    // на дне следом предложение кредита перекрывает последнюю СМС
    expect(game.ui.notif?.text).toMatch(/недостаточно средств|Всё будет/i)
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
  it('два платежа в один день — каждое списание ровно одно за несколько сроков', async () => {
    const { game } = makeGame()
    game.S.money = 10_000_000
    const pending = (id: string) => game.rules.state.schedule.filter(
      (e) => e.kind === 'event' && e.event === 'BillDue' && (e as { facts?: { bill?: string } }).facts?.bill === id,
    )
    for (let round = 0; round < 4; round++) {
      const day = game.S.day
      game.S.mem[billDueAt('rent')] = day
      game.S.mem[billDueAt('transit')] = day
      game.rules.state.schedule = game.rules.state.schedule.filter((e) => !(e.kind === 'event' && e.event === 'BillDue'))
      game.rules.schedule({ at: day, kind: 'event', event: 'BillDue', facts: { bill: 'rent' } })
      game.rules.schedule({ at: day, kind: 'event', event: 'BillDue', facts: { bill: 'transit' } })
      await game.rules.runDue(game, game.facts)
      expect(pending('rent'), `после списания round ${round}`).toHaveLength(1)
      expect(pending('transit'), `после списания round ${round}`).toHaveLength(1)
      const next = Math.min(Number(game.S.mem[billDueAt('rent')]), Number(game.S.mem[billDueAt('transit')]))
      expect(next).toBeGreaterThan(day)
      game.S.day = next
    }
  })
  it('негативный контроль: existing > day снова плодит дубли', () => {
    const { game } = makeGame()
    const day = game.S.day
    game.S.mem[billDueAt('phone')] = day
    game.rules.state.schedule = game.rules.state.schedule.filter((e) => !(e.kind === 'event' && e.event === 'BillDue' && (e as { facts?: { bill?: string } }).facts?.bill === 'phone'))
    // старое условие existing > day: сегодня не «строгое будущее» → поставили бы ещё раз
    const buggyWouldReschedule = !(Number(game.S.mem[billDueAt('phone')]) > day)
    expect(buggyWouldReschedule).toBe(true)
    game.scheduleBills()
    const phoneDues = game.rules.state.schedule.filter((e) => e.kind === 'event' && e.event === 'BillDue' && (e as { facts?: { bill?: string } }).facts?.bill === 'phone')
    expect(phoneDues).toHaveLength(0)
    expect(Number(game.S.mem[billDueAt('phone')])).toBe(day)
  })
})
