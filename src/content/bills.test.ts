import { describe, it, expect } from 'vitest'
import { makeGame, setMoney } from '../test/helpers'
import { BILLS, billUnpaid, billStreak, lightOff, billDueAt } from './bills'
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
    const phone = BILLS.find((b) => b.id === 'phone')!
    game.chargeBill('phone')
    game.flushBankCharges()
    expect(game.S.money).toBe(before - phone.amount)
    expect(game.S.mem[billUnpaid('phone')]).toBe(false)
    expect(game.ui.notif?.text).toMatch(/Списание/)
  })
  it('неоплата не эхо: банк говорит один раз за полосу, а не каждый срок (#184)', () => {
    const { game } = makeGame()
    const said: string[] = []
    const orig = game.notify.bind(game)
    game.notify = (icon: string, app: string, text: string): boolean => { said.push(text); return orig(icon, app, text) }
    const refusals = (): number => said.filter((t) => /недостаточно средств/i.test(t)).length
    setMoney(game, 100)
    game.chargeBill('phone')
    expect(refusals()).toBe(1)
    game.chargeBill('phone') // срок прошёл снова, полоса та же
    expect(game.S.mem[billStreak('phone')]).toBe(2)
    expect(refusals()).toBe(1) // эха нет
    setMoney(game, 2000)
    game.chargeBill('phone') // заплатили — полоса закрыта
    expect(game.S.mem[billStreak('phone')]).toBe(0)
    setMoney(game, 100)
    game.chargeBill('phone') // новый срыв — банк говорит снова
    expect(refusals()).toBe(2)
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
  it('«Завтра списание» — только коммуналка; связь молчит (#178)', async () => {
    const { game } = makeGame()
    const texts: string[] = []
    const notify = game.notify.bind(game)
    game.notify = (icon, app, text) => { texts.push(text); return notify(icon, app, text) }
    await game.fire('BillWarn', { bill: 'phone', at: game.S.mem[billDueAt('phone')] })
    expect(texts.some((t) => /Завтра списание/.test(t))).toBe(false)
    expect(game.S.mem['bills.phone.due']).toBeFalsy()
    await game.fire('BillWarn', { bill: 'rent', at: game.S.mem[billDueAt('rent')] })
    expect(texts.some((t) => /Завтра списание.*Коммуналка/.test(t))).toBe(true)
  })
  it('два списания в один день — одно СМС-дайджест (#178)', async () => {
    const { game } = makeGame()
    setMoney(game, 10_000_000)
    const texts: string[] = []
    const notify = game.notify.bind(game)
    game.notify = (icon, app, text) => { texts.push(text); return notify(icon, app, text) }
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
    game.notify = (icon, app, text) => { texts.push(text); return notify(icon, app, text) }
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
  it('ход игрока со сроком платежа — сводка СМС уходит (#251)', async () => {
    const { game } = makeGame()
    setMoney(game, 10_000_000)
    const texts: string[] = []
    const notify = game.notify.bind(game)
    game.notify = (icon, app, text) => { texts.push(text); return notify(icon, app, text) }
    const day = game.S.day
    game.S.mem[billDueAt('phone')] = day + 1 // после advanceTurnDay станет сегодня
    game.rules.state.schedule = game.rules.state.schedule.filter((e) => !(e.kind === 'event' && e.event === 'BillDue'))
    game.rules.schedule({ at: day + 1, kind: 'event', event: 'BillDue', facts: { bill: 'phone', at: day + 1 } })
    await game.send({ text: 'Алик?', tone: 'polite' })
    expect(texts.some((t) => /Списани/.test(t) && t.includes('Связь'))).toBe(true)
  })
  it('одинаковое банковское SMS не дважды за день; разные суммы — разные события (#251/#265)', () => {
    const { game } = makeGame()
    const shown: string[] = []
    const notify = game.notify.bind(game)
    game.notify = (icon, app, text) => {
      const ok = notify(icon, app, text)
      if (ok) shown.push(text)
      return ok
    }
    game.notify('🏦', 'Банк', 'Не прошло: недостаточно средств. Связь, 400 ₽.')
    game.notify('🏦', 'Банк', 'Не прошло: недостаточно средств. Связь, 550 ₽.')
    expect(shown).toHaveLength(2) // суммы разные — два события
    game.notify('🏦', 'Банк', 'Не прошло: недостаточно средств. Связь, 550 ₽.')
    expect(shown).toHaveLength(2) // повтор той же суммы — дедуп
    // поступления с разным балансом, одна сумма и причина — одно событие
    shown.length = 0
    const { game: g2 } = makeGame()
    const n2 = g2.notify.bind(g2)
    g2.notify = (icon, app, text) => { const ok = n2(icon, app, text); if (ok) shown.push(text); return ok }
    g2.notify('🏦', 'Банк', 'Поступление 50 ₽. Перевод от Алика. Баланс: 12 450 ₽')
    g2.notify('🏦', 'Банк', 'Поступление 50 ₽. Перевод от Алика. Баланс: 12 500 ₽')
    expect(shown).toHaveLength(1)
    g2.notify('🏦', 'Банк', 'Поступление 500 ₽. Выплата. Баланс: 13 000 ₽')
    expect(shown).toHaveLength(2)
  })
  it('доля банковских СМС к репликам Алика ниже порога оракула (#178)', async () => {
    // оракул: NOTIF_SHARE = 0.25; до фикса сид 7 давал ~0.9. Считаем только показанные (#265).
    const { botTurn } = await import('../tools/bot')
    for (const seed of [1, 7]) {
      const { game } = makeGame({ seed })
      let bank = 0
      const notify = game.notify.bind(game)
      game.notify = (icon, app, text) => {
        const ok = notify(icon, app, text)
        if (ok && (app === 'Банк' || app === 'МФО')) bank++
        return ok
      }
      for (let i = 0; i < 200; i++) await botTurn(game)
      const alik = game.S.msgs.filter((m) => m.kind === 'text' && m.from === 'alik').length
      expect(alik, `seed ${seed} alik`).toBeGreaterThan(50)
      expect(bank / alik, `seed ${seed} bank=${bank} alik=${alik}`).toBeLessThan(0.25)
    }
  }, 120_000)
  it('paymentDueTomorrow только после предупреждения с SMS (#251)', () => {
    const { game } = makeGame()
    game.S.mem[billDueAt('phone')] = game.S.day + 1
    expect(game.facts().paymentDueTomorrow).toBe(false)
    game.S.mem[billDueAt('rent')] = game.S.day + 1
    game.S.mem['bills.rent.due'] = true
    expect(game.facts().paymentDueTomorrow).toBe(true)
  })
})
