import { describe, it, expect } from 'vitest'
import { makeGame , setMoney} from '../test/helpers'
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
    game.flushBankCharges()
    expect(game.S.money).toBe(before - 550)
    expect(game.S.mem[billUnpaid('phone')]).toBe(false)
    expect(game.ui.notif?.text).toMatch(/Списание/)
  })
  it('не хватает — СМС отказа, unpaid и последствие', () => {
    const { game } = makeGame()
    setMoney(game, 100)
    game.chargeBill('rent')
    expect(game.S.money).toBe(100)
    expect(game.S.mem[billUnpaid('rent')]).toBe(true)
    expect(game.S.mem[lightOff]).toBe(true)
    expect(game.ui.notif?.text).toMatch(/недостаточно средств/i)
  })
  it('повтор той же неоплаты — без второго СМС; последствие остаётся (#178)', () => {
    const { game } = makeGame()
    setMoney(game, 100)
    const texts: string[] = []
    const notify = game.notify.bind(game)
    game.notify = (icon, app, text) => { texts.push(text); notify(icon, app, text) }
    game.chargeBill('phone')
    expect(texts.filter((t) => /недостаточно/i.test(t))).toHaveLength(1)
    // новый срок той же связи — снова отказать
    game.S.mem[billDueAt('phone')] = game.S.day
    game.chargeBill('phone')
    expect(texts.filter((t) => /недостаточно/i.test(t))).toHaveLength(1)
    expect(game.S.mem[billUnpaid('phone')]).toBe(true)
    expect(Number(game.S.mem['bills.phone.streak'])).toBe(2)
    // негативный контроль: streak сбросили — снова СМС
    game.S.mem['bills.phone.streak'] = 0
    game.S.mem[billDueAt('phone')] = game.S.day
    game.chargeBill('phone')
    expect(texts.filter((t) => /недостаточно/i.test(t))).toHaveLength(2)
  })
  it('«Завтра списание» — только коммуналка; связь молчит (#178)', async () => {
    const { game } = makeGame()
    const texts: string[] = []
    const notify = game.notify.bind(game)
    game.notify = (icon, app, text) => { texts.push(text); notify(icon, app, text) }
    await game.fire('BillWarn', { bill: 'phone', at: game.S.mem[billDueAt('phone')] })
    expect(texts.some((t) => /Завтра списание/.test(t))).toBe(false)
    expect(game.S.mem['bills.phone.due']).toBe(true)
    await game.fire('BillWarn', { bill: 'rent', at: game.S.mem[billDueAt('rent')] })
    expect(texts.some((t) => /Завтра списание.*Коммуналка/.test(t))).toBe(true)
  })
  it('два списания в один день — одно СМС-дайджест (#178)', async () => {
    const { game } = makeGame()
    setMoney(game, 10_000_000)
    const texts: string[] = []
    const notify = game.notify.bind(game)
    game.notify = (icon, app, text) => { texts.push(text); notify(icon, app, text) }
    const day = game.S.day
    game.S.mem[billDueAt('rent')] = day
    game.S.mem[billDueAt('transit')] = day
    game.rules.state.schedule = game.rules.state.schedule.filter((e) => !(e.kind === 'event' && e.event === 'BillDue'))
    game.rules.schedule({ at: day, kind: 'event', event: 'BillDue', facts: { bill: 'rent' } })
    game.rules.schedule({ at: day, kind: 'event', event: 'BillDue', facts: { bill: 'transit' } })
    await game.afterTurn()
    const digests = texts.filter((t) => t.startsWith('Списания:') || (t.startsWith('Списание') && t.includes('Коммуналка')))
    expect(digests.some((t) => t.includes('Коммуналка') && t.includes('Проездной'))).toBe(true)
    expect(texts.filter((t) => t.startsWith('Списание ') || t.startsWith('Списания:'))).toHaveLength(1)
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
    await game.fire('BillWarn', { bill: 'rent', at: game.S.mem[billDueAt('rent')] })
    expect(game.S.mem['bills.rent.due']).toBe(true)
    expect(game.ui.notif?.text).toMatch(/Завтра списание/)
  })
  it('у каждого счёта одно списание за срок, даже когда сроки двух счетов совпали (#181)', async () => {
    const { game } = makeGame()
    setMoney(game, 1_000_000)
    const texts: string[] = []
    const notify = game.notify.bind(game)
    game.notify = (icon, app, text) => { texts.push(text); notify(icon, app, text) }
    const pending = (id: string) => game.rules.state.schedule.filter((it) => it.kind === 'event' && it.event === 'BillDue' && it.facts?.bill === id).length
    const start = game.S.day
    const jumps = [1, 2, 3]
    for (let i = 0; game.S.day < start + 140; i++) {
      game.nextDay(jumps[i % 3])
      await game.afterTurn()
      for (const b of BILLS) expect(pending(b.id), `${b.id} на день ${game.S.day}`).toBe(1)
    }
    const weeks = Math.ceil((game.S.day - start) / 7)
    for (const label of ['Связь', 'Проездной']) {
      const n = texts.filter((t) => /Списани/.test(t) && t.includes(label)).length
      expect(n, label).toBeGreaterThanOrEqual(weeks - 1)
      expect(n, label).toBeLessThanOrEqual(weeks)
    }
  })
  it('устаревшее событие платежа из старого сохранения не списывает второй раз', async () => {
    const { game } = makeGame()
    const at = Number(game.S.mem[billDueAt('phone')])
    game.S.day = at
    await game.fire('BillDue', { bill: 'phone', at })
    const after = game.S.money
    await game.fire('BillDue', { bill: 'phone', at })
    await game.fire('BillDue', { bill: 'phone' })
    expect(game.S.money).toBe(after)
  })
  it('два платежа в один день — каждое списание ровно одно за несколько сроков', async () => {
    const { game } = makeGame()
    setMoney(game, 10_000_000)
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
  it('доля банковских СМС к репликам Алика ниже порога оракула (#178)', async () => {
    // оракул: NOTIF_SHARE = 0.25; до фикса сид 7 давал ~0.9. Здесь — бот 200 ходов, сиды 1/7.
    const { botTurn } = await import('../tools/bot')
    for (const seed of [1, 7]) {
      const { game } = makeGame({ seed })
      let bank = 0
      const notify = game.notify.bind(game)
      game.notify = (icon, app, text) => {
        if (app === 'Банк' || app === 'МФО') bank++
        notify(icon, app, text)
      }
      for (let i = 0; i < 200; i++) await botTurn(game)
      const alik = game.S.msgs.filter((m) => m.kind === 'text' && m.from === 'alik').length
      expect(alik, `seed ${seed} alik`).toBeGreaterThan(50)
      expect(bank / alik, `seed ${seed} bank=${bank} alik=${alik}`).toBeLessThan(0.25)
    }
  })
})
