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
    game.S.day = Number(game.S.mem[billDueAt('phone')]) - 1
    await game.fire('BillWarn', { bill: 'phone', at: game.S.mem[billDueAt('phone')] })
    expect(texts.some((t) => /Завтра списание/.test(t))).toBe(false)
    expect(game.S.mem['bills.phone.due']).toBeFalsy()
    game.S.day = Number(game.S.mem[billDueAt('rent')]) - 1
    await game.fire('BillWarn', { bill: 'rent', at: game.S.mem[billDueAt('rent')] })
    expect(texts.some((t) => /Завтра списание.*Коммуналка/.test(t))).toBe(true)
  })
  it('«Завтра списание» — только накануне: перескок через канун молчит, канун говорит (#272)', async () => {
    // идём днями до нужного расстояния от срока коммуналки; срок после списания уезжает на следующий месяц
    const walkTo = async (g: ReturnType<typeof makeGame>['game'], gap: number) => {
      for (let i = 0; i < 70 && Number(g.S.mem[billDueAt('rent')]) - g.S.day !== gap; i++) { g.nextDay(1); await g.afterTurn() }
      expect(Number(g.S.mem[billDueAt('rent')]) - g.S.day).toBe(gap)
    }
    const listen = (g: ReturnType<typeof makeGame>['game']) => {
      const texts: string[] = []
      const notify = g.notify.bind(g)
      g.notify = (icon, app, text) => { texts.push(text); return notify(icon, app, text) }
      return texts
    }
    const { game: skip } = makeGame()
    setMoney(skip, 1_000_000)
    await walkTo(skip, 2)
    const skipped = listen(skip)
    skip.nextDay(2) // через канун — предупреждение и списание в одной пачке
    await skip.afterTurn()
    expect(skipped.some((t) => /Коммуналка/.test(t) && /Списани/.test(t))).toBe(true)
    expect(skipped.some((t) => /Завтра списание/.test(t))).toBe(false)

    const { game: eve } = makeGame()
    setMoney(eve, 1_000_000)
    await walkTo(eve, 2)
    const heard = listen(eve)
    eve.nextDay(1)
    await eve.afterTurn()
    expect(heard.some((t) => /Завтра списание.*Коммуналка/.test(t))).toBe(true)
    expect(eve.facts().paymentDueTomorrow).toBe(true)
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
    game.S.day = Number(game.S.mem[billDueAt('rent')]) - 1
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
  it('два счёта с одним сроком: игрок перескакивает дни, каждый срок списан ровно один раз (#272)', async () => {
    const { game } = makeGame()
    setMoney(game, 10_000_000)
    const charges: Record<string, number> = { Коммуналка: 0, Проездной: 0 }
    const notify = game.notify.bind(game)
    game.notify = (icon, app, text) => {
      if (/Списани/.test(text)) for (const label of Object.keys(charges)) if (text.includes(label)) charges[label]++
      notify(icon, app, text)
    }
    // сроки коммуналки и проездного совпали (#183) — дальше только путь игрока: +1…3 дня за ход
    const same = Number(game.S.mem[billDueAt('rent')])
    game.S.mem[billDueAt('transit')] = same
    game.rules.state.schedule = game.rules.state.schedule.filter((e) => !(e.kind === 'event' && e.event === 'BillDue' && e.facts?.bill === 'transit'))
    game.rules.schedule({ at: same, kind: 'event', event: 'BillDue', facts: { bill: 'transit', at: same } })
    const passed: Record<string, Set<number>> = { rent: new Set(), transit: new Set() }
    const jumps = [2, 3, 1]
    for (let i = 0; game.S.day < same + 60; i++) {
      for (const id of ['rent', 'transit'] as const) passed[id].add(Number(game.S.mem[billDueAt(id)]))
      game.nextDay(jumps[i % 3])
      await game.afterTurn()
    }
    // каждый срок, который остался позади, списан один раз — не ноль и не дважды
    const behind = (id: 'rent' | 'transit') => [...passed[id]].filter((at) => at <= game.S.day).length
    expect(behind('transit')).toBeGreaterThanOrEqual(8)
    expect(charges.Проездной).toBe(behind('transit'))
    expect(behind('rent')).toBeGreaterThanOrEqual(2)
    expect(charges.Коммуналка).toBe(behind('rent'))
  })
  it('срок стоит, а события в сохранении нет — при загрузке событие возвращается и платёж списывается (#272)', async () => {
    const { game, storage } = makeGame()
    setMoney(game, 1_000_000)
    const at = Number(game.S.mem[billDueAt('phone')])
    game.S.mem['credit.consumer.taken'] = true
    game.scheduleCredits()
    const loanAt = Number(game.S.mem['credit.consumer.dueAt'])
    game.rules.state.schedule = game.rules.state.schedule.filter((e) => !(e.kind === 'event' && (e.event === 'BillDue' && e.facts?.bill === 'phone' || e.event === 'CreditDue')))
    game.save()
    const { game: loaded } = makeGame({ storage })
    const due = (event: string, k: string, id: string) => loaded.rules.state.schedule.filter((e) => e.kind === 'event' && e.event === event && e.facts?.[k] === id)
    expect(due('BillDue', 'bill', 'phone').map((e) => e.at)).toEqual([at])
    expect(due('CreditDue', 'credit', 'consumer').map((e) => e.at)).toEqual([loanAt])
    // событие, которое есть, второй раз не ставится: у остальных счетов по одному
    for (const id of ['rent', 'transit']) expect(due('BillDue', 'bill', id), id).toHaveLength(1)
    const texts: string[] = []
    const notify = loaded.notify.bind(loaded)
    loaded.notify = (icon, app, text) => { texts.push(text); return notify(icon, app, text) }
    while (loaded.S.day < Math.max(at, loanAt)) { loaded.nextDay(1); await loaded.afterTurn() }
    expect(texts.filter((t) => /Списани/.test(t) && t.includes('Связь'))).toHaveLength(1)
    expect(texts.filter((t) => /Списани/.test(t) && t.includes('Всё будет'))).toHaveLength(1)
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
