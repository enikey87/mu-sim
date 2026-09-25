import { describe, it, expect } from 'vitest'
import { makeGame, setMoney, cards, moneyLog, memStorage } from '../test/helpers'
import { BILLS, billUnpaid, billStreak, lightOff, billDueAt } from './bills'
import { NOTIF } from './life'
import { dateOf, dueIn, weekOf } from '../engine/time'
import { test } from '../engine/rules'

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
    game.flushBankWeek()
    expect(game.S.money).toBe(before - phone.amount)
    expect(game.S.mem[billUnpaid('phone')]).toBe(false)
    // списание — строка недельной сводки, не карточка (#287)
    expect(cards(game)).toHaveLength(0)
    expect(game.S.bank?.lines['-Связь']).toEqual({ sum: phone.amount, n: 1 })
  })
  it('неоплата не эхо: банк говорит один раз за полосу, а не каждый срок (#184)', () => {
    const { game } = makeGame()
    const said: string[] = []
    const orig = game.notify.bind(game)
    game.notify = (icon: string, app: string, text: string): boolean => { said.push(text); return orig(icon, app, text) }
    // на дне отказ приходит вместе с предложением кредита — одной карточкой с причиной (#287)
    const refusals = (): number => said.filter((t) => /^Не прошло: Связь/.test(t)).length
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
    expect(cards(game, 'Банк').at(-1)?.text).toMatch(/^Не прошло: Коммуналка, 2\s500 ₽\./)
    expect(game.ui.notif).toBeNull()
  })
  it('не хватило денег, а кредит уже не дают — отдельная карточка отказа (#287)', () => {
    const { game } = makeGame()
    game.S.mem['credit.stage'] = 3
    setMoney(game, 100)
    game.chargeBill('phone')
    expect(cards(game, 'Банк').map((c) => c.text)).toEqual([`Не прошло: Связь, 400 ₽. Недостаточно средств. Достоинство не принимается.`])
    expect(cards(game, 'Банк')[0].offer).toBeUndefined()
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
    const charged = moneyLog(skip)
    skip.nextDay(2) // через канун — предупреждение и списание в одной пачке
    await skip.afterTurn()
    expect(charged).toContain('-Коммуналка')
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
  it('неделя списаний — одна сводка: что списано и баланс; прочих карточек банка без нехватки нет (#287)', async () => {
    const { game } = makeGame()
    setMoney(game, 10_000_000)
    const weeks = new Set<number>()
    for (let d = 0; d < 28; d++) {
      game.nextDay(1)
      await game.afterTurn()
      weeks.add(weekOf(game.S.day))
    }
    const all = cards(game, 'Банк')
    const bank = all.filter((c) => c.text.startsWith('Сводка'))
    // денег хватает: кроме сводок — только «завтра коммуналка» раз в месяц
    expect(all.filter((c) => !bank.includes(c)).map((c) => c.text.split(':')[0])).toEqual(['Завтра списание'])
    // последняя неделя ещё идёт — её сводка впереди
    expect(bank).toHaveLength(weeks.size - 1)
    for (const [i, c] of bank.entries()) {
      expect(c.text).toMatch(/^Сводка за неделю \d+ \S+ – \d+ \S+: баланс [\d\s]+ ₽$/)
      // первая неделя партии неполная: понедельник связи мог пройти до старта
      if (i > 0) expect(c.lines?.[0]).toMatch(/^Списано: (?=.*Связь 400 ₽)(?=.*Проездной 500 ₽)/)
    }
    expect(new Set(bank.map((c) => c.text.split('.')[0])).size, 'одна сводка на неделю').toBe(bank.length)
    expect(game.ui.notif, 'банк не приходит баннером').toBeNull()
  })
  it('коммуналка — один срок на месяц: партия днями по 1–3 через концы месяцев (#292)', async () => {
    const { game } = makeGame()
    setMoney(game, 10_000_000)
    const charged = moneyLog(game)
    const dues = new Set<number>()
    const start = game.S.day
    const jumps = [1, 2, 3, 1, 1]
    for (let i = 0; game.S.day < start + 200; i++) {
      dues.add(Number(game.S.mem[billDueAt('rent')]))
      game.nextDay(jumps[i % jumps.length])
      await game.afterTurn()
    }
    const passed = [...dues].filter((at) => at <= game.S.day).sort((a, b) => a - b)
    expect(passed.length).toBeGreaterThanOrEqual(6)
    for (const at of passed) expect(dateOf(at + 1).getDate(), `срок ${at} — последний день месяца`).toBe(1)
    const months = passed.map((at) => dateOf(at).getFullYear() * 12 + dateOf(at).getMonth())
    expect(new Set(months).size, 'два срока в одном месяце').toBe(months.length)
    expect(charged.filter((t) => t === '-Коммуналка')).toHaveLength(passed.length)
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
    expect(cards(game, 'Банк').at(-1)?.text).toMatch(/Завтра списание/)
  })
  it('у каждого счёта одно списание за срок, даже когда сроки двух счетов совпали (#181)', async () => {
    const { game } = makeGame()
    setMoney(game, 1_000_000)
    const charged = moneyLog(game)
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
      const n = charged.filter((t) => t === `-${label}`).length
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
    const charged = moneyLog(game)
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
    const n = (label: string) => charged.filter((t) => t === `-${label}`).length
    expect(n('Проездной')).toBe(behind('transit'))
    expect(behind('rent')).toBeGreaterThanOrEqual(2)
    expect(n('Коммуналка')).toBe(behind('rent'))
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
    const charged = moneyLog(loaded)
    while (loaded.S.day < Math.max(at, loanAt)) { loaded.nextDay(1); await loaded.afterTurn() }
    expect(charged.filter((t) => t === '-Связь')).toHaveLength(1)
    expect(charged.filter((t) => t.startsWith('-') && t.includes('Всё будет'))).toHaveLength(1)
  })
  it('ход игрока со сроком платежа — платёж списан и попал в сводку недели (#251/#287)', async () => {
    const { game } = makeGame()
    setMoney(game, 10_000_000)
    const charged = moneyLog(game)
    const day = game.S.day
    game.S.mem[billDueAt('phone')] = day + 1 // после advanceTurnDay станет сегодня
    game.rules.state.schedule = game.rules.state.schedule.filter((e) => !(e.kind === 'event' && e.event === 'BillDue'))
    game.rules.schedule({ at: day + 1, kind: 'event', event: 'BillDue', facts: { bill: 'phone', at: day + 1 } })
    await game.send({ text: 'Алик?', tone: 'polite' })
    expect(charged).toContain('-Связь')
    const week = [...cards(game, 'Банк').flatMap((c) => c.lines ?? []), ...Object.keys(game.S.bank?.lines ?? {})].join(' ')
    expect(week).toContain('Связь')
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
  it('доля банковских уведомлений к репликам Алика до Дня выплаты (#301/#323)', async () => {
    // после #293/#316 на расширенной выборке (не только «удобные» 8) max ≈ 0.24–0.27; порог 0.30 — с запасом
    const { botTurn } = await import('../tools/bot')
    const seeds = [1, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89]
    const ratios: number[] = []
    for (const seed of seeds) {
      const { game } = makeGame({ seed })
      let bank = 0
      const notify = game.notify.bind(game)
      game.notify = (icon, app, text, card) => {
        const ok = notify(icon, app, text, card)
        if (ok && (app === 'Банк' || app === 'МФО')) bank++
        return ok
      }
      for (let i = 0; i < 300; i++) {
        if (game.S.mem.payday || game.S.mem['endgame.active']) break
        await botTurn(game)
      }
      const alik = game.S.msgs.filter((m) => m.kind === 'text' && m.from === 'alik').length
      expect(alik, `seed ${seed} alik`).toBeGreaterThan(50)
      ratios.push(bank / alik)
      expect(bank / alik, `seed ${seed} bank=${bank} alik=${alik}`).toBeLessThan(0.30)
    }
    expect(Math.max(...ratios), `max ratio ${Math.max(...ratios)}`).toBeGreaterThan(0.15) // выборка видит нагрузку, не пустой набор
  }, 480_000)
  it('выселение — после трёх неоплат коммуналки подряд, не по календарю (#301)', () => {
    const { game } = makeGame()
    game.S.day = 500
    setMoney(game, 0)
    const eviction = (g: typeof game) =>
      g.lines.eligible('NOTIF', NOTIF, g.lineFacts()).some((p) => /Выселяю/.test(p.text))
    expect(eviction(game)).toBe(false)
    for (let i = 0; i < 2; i++) game.chargeBill('rent')
    expect(game.S.mem[billStreak('rent')]).toBe(2)
    expect(eviction(game)).toBe(false)
    game.chargeBill('rent')
    expect(game.S.mem[billStreak('rent')]).toBe(3)
    expect(eviction(game)).toBe(true)
    const hit = game.linePicked('NOTIF_EVICT', NOTIF.filter((n) => /Выселяю/.test(n.t)))
    expect(hit?.text).toMatch(/Выселяю/)
    expect(game.S.mem.evicted).toBe(true)

    // оплачивал — полоса 0: даже на дне 500 не выселяют (NC к gte(day, 250))
    const paid = makeGame().game
    paid.S.day = 500
    setMoney(paid, 100_000)
    for (let i = 0; i < 5; i++) paid.chargeBill('rent')
    expect(paid.S.mem[billStreak('rent')]).toBe(0)
    expect(eviction(paid)).toBe(false)
    const line = NOTIF.find((n) => /Выселяю/.test(n.t))!
    expect((line.when ?? []).every((c) => test(c, { day: 500, 'bills.rent.streak': 0 }))).toBe(false)
    expect((line.when ?? []).every((c) => test(c, { 'bills.rent.streak': 3 }))).toBe(true)
  })
  it('выселение только до выплаты — через BillDue, после payday закрыто (#323)', async () => {
    const { game } = makeGame()
    setMoney(game, 0)
    game.chargeBill('rent')
    game.chargeBill('rent')
    const at = Number(game.S.mem[billDueAt('rent')])
    game.S.day = at
    await game.fire('BillDue', { bill: 'rent', at })
    expect(game.S.mem[billStreak('rent')]).toBe(3)
    expect(game.lines.eligible('NOTIF', NOTIF, game.lineFacts()).some((p) => /Выселяю/.test(p.text))).toBe(true)
    const hit = game.linePicked('NOTIF_EVICT2', NOTIF.filter((n) => /Выселяю/.test(n.t)))
    expect(hit?.text).toMatch(/Выселяю/)
    expect(game.S.mem.evicted).toBe(true)

    const after = makeGame().game
    setMoney(after, 0)
    after.chargeBill('rent')
    after.chargeBill('rent')
    const at2 = Number(after.S.mem[billDueAt('rent')])
    after.S.day = at2
    await after.fire('BillDue', { bill: 'rent', at: at2 })
    after.S.mem.payday = 'default'
    expect(after.lines.eligible('NOTIF', NOTIF, after.lineFacts()).some((p) => /Выселяю/.test(p.text))).toBe(false)
    after.S.mem['endgame.active'] = true
    delete after.S.mem.payday
    expect(after.lines.eligible('NOTIF', NOTIF, after.lineFacts()).some((p) => /Выселяю/.test(p.text))).toBe(false)
  })
  it('NC: без гейта выплаты выселение открыто и после payday (#323)', () => {
    const { game } = makeGame()
    game.S.mem[billStreak('rent')] = 3
    game.S.mem.payday = 'default'
    const live = NOTIF.find((n) => /Выселяю/.test(n.t))!
    const ungated = { ...live, when: (live.when ?? []).filter((c) => !('key' in c && (c.key === 'payday' || c.key === 'endgame.active'))) }
    expect(game.lines.eligible('NOTIF', [ungated], game.lineFacts()).some((p) => /Выселяю/.test(p.text))).toBe(true)
    expect(game.lines.eligible('NOTIF', [live], game.lineFacts()).some((p) => /Выселяю/.test(p.text))).toBe(false)
  })
  it('платёж после перескока срока идёт в сводку недели срока, не обработки (#300)', async () => {
    const { game } = makeGame()
    setMoney(game, 10_000_000)
    const due = Number(game.S.mem[billDueAt('transit')])
    expect(dateOf(due).getDay(), 'проездной — воскресенье').toBe(0)
    game.S.day = due + 1 // понедельник следующей недели
    await game.fire('BillDue', { bill: 'transit', at: due })
    expect(game.S.bank?.week).toBe(weekOf(due))
    expect(weekOf(due)).not.toBe(weekOf(game.S.day))
    game.S.day = due + 8
    game.flushBankWeek()
    const summary = cards(game, 'Банк').filter((c) => c.text.startsWith('Сводка')).at(-1)!
    expect(summary.lines?.join(' ')).toMatch(/Проездной 500 ₽/)
    expect(summary.lines?.join(' ')).not.toMatch(/2 раза/)
    const { fmtShortDate } = await import('../engine/time')
    expect(summary.text).toMatch(new RegExp(`Сводка за неделю ${fmtShortDate(weekOf(due))}`))
  })
  it('карточка банка во время сцены ждёт её конца (#300)', async () => {
    const { game } = makeGame()
    game.S.scene = { id: 'meet', node: game.scenes.meet.start, vars: {} }
    const n = game.S.msgs.length
    game.notify('🏦', 'Банк', 'Сводка за неделю тест: баланс 1 ₽', { lines: ['Списано: Связь 400 ₽'] })
    expect(game.S.msgs.slice(n).filter((m) => m.kind === 'card')).toEqual([])
    expect(game.S.pendingCards.length).toBe(1)
    await game.enterNode('meet', null)
    expect(game.S.scene).toBeNull()
    expect(game.S.pendingCards).toEqual([])
    expect(game.S.msgs.some((m) => m.kind === 'card' && m.app === 'Банк' && /Сводка за неделю тест/.test(m.text))).toBe(true)
  })
  it('после выплаты отложенные банк/МФО из сцены не выходят (#323)', async () => {
    const { game } = makeGame()
    game.S.scene = { id: 'meet', node: game.scenes.meet.start, vars: {} }
    game.notify('🏦', 'Банк', 'Кредит одобрен! после сцены', { offer: { take: 'Взять' } })
    game.notify('🏦', 'МФО', 'Мы записываем после сцены')
    game.notify('👩', 'Мама', 'Сынок, держись')
    expect(game.S.pendingCards.length).toBe(3)
    game.S.mem.payday = 'default'
    expect(game.moneySealed()).toBe(true)
    const n = game.S.msgs.length
    await game.enterNode('meet', null)
    const cards = game.S.msgs.slice(n).filter((m) => m.kind === 'card')
    expect(cards.every((m) => m.kind === 'card' && m.app !== 'Банк' && m.app !== 'МФО')).toBe(true)
    expect(cards.some((m) => m.kind === 'card' && m.app === 'Мама')).toBe(true)
  })
  it('NC: без moneySealed отложенный банк выходит после сцены (#323)', async () => {
    const { game } = makeGame()
    game.S.scene = { id: 'meet', node: game.scenes.meet.start, vars: {} }
    game.notify('🏦', 'Банк', 'Кредит без печати')
    expect(game.S.pendingCards.length).toBe(1)
    await game.enterNode('meet', null)
    expect(game.S.msgs.some((m) => m.kind === 'card' && m.app === 'Банк' && /Кредит без печати/.test(m.text))).toBe(true)
  })
  it('очередь карточек переживает перезагрузку (#323)', () => {
    const storage = memStorage()
    const { game } = makeGame({ storage })
    game.S.scene = { id: 'meet', node: game.scenes.meet.start, vars: {} }
    game.notify('🏦', 'Банк', 'Сводка в очереди: баланс 7 ₽')
    game.save()
    const { game: loaded } = makeGame({ storage, seed: 2 })
    expect(loaded.S.scene?.id).toBe('meet')
    expect(loaded.S.pendingCards.some((c) => /Сводка в очереди/.test(c.text))).toBe(true)
  })
  it('варианты ответа переживают перезагрузку — migrate не сбрасывает весь пул (#323)', () => {
    const storage = memStorage()
    const { game } = makeGame({ storage })
    const offered = game.choices.map((c) => c.text)
    expect(offered.length).toBeGreaterThan(2)
    game.save()
    const { game: loaded } = makeGame({ storage, seed: 3 })
    expect(loaded.choices.map((c) => c.text)).toEqual(offered)
  })
  it('paymentDueTomorrow только после предупреждения с SMS (#251)', () => {
    const { game } = makeGame()
    game.S.mem[billDueAt('phone')] = game.S.day + 1
    expect(game.facts().paymentDueTomorrow).toBe(false)
    game.S.mem[billDueAt('rent')] = game.S.day + 1
    game.S.mem['bills.rent.due'] = true
    expect(game.facts().paymentDueTomorrow).toBe(true)
  })
})
