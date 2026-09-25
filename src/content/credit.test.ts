import { describe, it, expect } from 'vitest'
import { makeGame , setMoney} from '../test/helpers'
import { NOTIF } from './life'
import {
  LOANS, THINGS, MOM_HELPS, creditOffer, creditStage, creditBroke, momDone,
  sold, momHelp, loanTaken, loanDueAt, allSold,
} from './credit'

describe('кредитная лестница', () => {
  it('на дне банк предлагает первую ступень', () => {
    const { game } = makeGame()
    setMoney(game, 6001)
    expect(game.adjustMoney(-1, 'Гречка')).toBe(true)
    expect(game.S.mem[creditOffer]).toBe(true)
    // списание и «критический» идут первыми; оффер — в очереди (#211), и это оффер именно первой ступени (#272)
    for (let i = 0; i < 8 && game.ui.notif && game.ui.notif.text !== LOANS[0].offer; i++) {
      game.dismissNotif()
    }
    expect(game.ui.notif?.text).toBe(LOANS[0].offer)
  })

  it('каждая ступень предлагает свой текст; после микрозайма — ничего (#272)', () => {
    for (const stage of [0, 1, 2, 3]) {
      const { game } = makeGame()
      const said: string[] = []
      const orig = game.notify.bind(game)
      game.notify = (icon, app, text) => { said.push(text); orig(icon, app, text) }
      game.S.mem[creditStage] = stage
      setMoney(game, 1000)
      game.maybeCreditOffer()
      const offers = said.filter((t) => LOANS.some((l) => l.offer === t))
      expect(offers, `ступень ${stage}`).toEqual(stage < 3 ? [LOANS[stage].offer] : [])
      expect(!!game.S.mem[creditOffer], `ступень ${stage}`).toBe(stage < 3)
    }
  })

  it('ступени не перепрыгнуть: без consumer нет refi', () => {
    const { game } = makeGame()
    setMoney(game, 1000)
    game.S.mem[creditOffer] = true
    game.S.mem[creditStage] = 0
    game.takeCredit()
    expect(game.S.mem[loanTaken('consumer')]).toBe(true)
    expect(game.S.mem[creditStage]).toBe(1)
    expect(game.S.mem[loanTaken('refi')]).toBeFalsy()
  })

  it('взять кредит — деньги через adjustMoney и срок платежа', () => {
    const { game } = makeGame()
    setMoney(game, 1000)
    game.S.mem[creditOffer] = true
    const before = game.S.money
    game.takeCredit()
    expect(game.S.money).toBe(before + LOANS[0].amount)
    expect(Number(game.S.mem[loanDueAt('consumer')])).toBeGreaterThan(game.S.day)
    expect(game.S.mem[creditOffer]).toBeFalsy()
  })

  it('продать вещь — sold.* и деньги; выбор помнит порядок', () => {
    const { game } = makeGame()
    setMoney(game, 1000)
    game.S.mem[creditOffer] = true
    game.sellThing()
    expect(game.S.mem[sold('microwave')]).toBe(true)
    expect(game.S.money).toBe(1000 + THINGS[0].amount)
    setMoney(game, 1000)
    game.S.mem[creditOffer] = true
    game.sellThing()
    expect(game.S.mem[sold('guitar')]).toBe(true)
  })

  it('кнопки взять/продать только при credit.offer', () => {
    const { game } = makeGame()
    const acts = () => game.buildChoices().map((c) => c.act)
    expect(acts()).not.toContain('creditTake')
    game.S.mem[creditOffer] = true
    expect(acts()).toContain('creditTake')
    expect(acts()).toContain('creditSell')
  })

  it('после продажи всех вещей без кредита — мама', () => {
    const { game } = makeGame()
    for (const t of THINGS) game.S.mem[sold(t.id)] = true
    expect(allSold(game.S.mem)).toBe(true)
    setMoney(game, 1000)
    game.maybeCreditOffer()
    expect(game.S.mem[momHelp('pension')]).toBe(true)
    expect(game.S.money).toBe(1000 + MOM_HELPS[0].amount)
  })

  it('отказ платежа по микрозайму — credit.broke и СМС', () => {
    const { game } = makeGame()
    game.S.mem[loanTaken('micro')] = true
    game.S.mem[creditStage] = 3
    setMoney(game, 100)
    game.chargeCredit('micro')
    expect(game.S.mem[creditBroke]).toBe(true)
    expect(game.S.mem[creditStage]).toBe(4)
    // мама на том же тике перебивает последнюю СМС — сам факт broke важнее
    expect(game.S.mem[momHelp('pension')]).toBe(true)
  })

  it('отказ по займу не эхо: банк говорит один раз за полосу (#184)', () => {
    const { game } = makeGame()
    const said: string[] = []
    const orig = game.notify.bind(game)
    game.notify = (icon: string, app: string, text: string): void => { said.push(text); orig(icon, app, text) }
    const refusals = (): number => said.filter((t) => /недостаточно средств/i.test(t)).length
    game.S.mem[loanTaken('consumer')] = true
    setMoney(game, 100)
    game.chargeCredit('consumer')
    expect(refusals()).toBe(1)
    game.chargeCredit('consumer') // следующая неделя, полоса та же
    expect(refusals()).toBe(1) // эха нет
    setMoney(game, 30000)
    game.chargeCredit('consumer') // платёж прошёл — полоса закрыта
    setMoney(game, 100)
    game.chargeCredit('consumer') // новый срыв — банк говорит снова
    expect(refusals()).toBe(2)
  })

  it('после broke мама выручает; после последней — mom.done', () => {
    const { game } = makeGame()
    game.S.mem[creditBroke] = true
    setMoney(game, 500)
    game.maybeCreditOffer()
    expect(game.S.mem[momHelp('pension')]).toBe(true)
    setMoney(game, 500)
    game.maybeCreditOffer()
    expect(game.S.mem[momHelp('pickles')]).toBe(true)
    setMoney(game, 500)
    game.maybeCreditOffer()
    expect(game.S.mem[momHelp('dacha')]).toBe(true)
    expect(game.S.mem[momDone]).toBe(true)
    setMoney(game, 500)
    game.maybeCreditOffer()
    expect(game.S.money).toBe(500)
  })

  it('в эндгейме лестница молчит', () => {
    const { game } = makeGame()
    game.S.mem.payday = 'default'
    setMoney(game, 1000)
    game.maybeCreditOffer()
    expect(game.S.mem[creditOffer]).toBeFalsy()
    game.S.mem[creditOffer] = true
    const before = game.S.money
    game.takeCredit()
    expect(game.S.money).toBe(before)
  })

  it('Says_creditTake проводит зачисление', async () => {
    const { game } = makeGame()
    setMoney(game, 1000)
    game.S.mem[creditOffer] = true
    await game.fire('PlayerSays', { intent: 'creditTake' })
    expect(game.S.mem[loanTaken('consumer')]).toBe(true)
    expect(game.S.money).toBe(1000 + LOANS[0].amount)
  })

  it('CreditDue списывает платёж', async () => {
    const { game } = makeGame()
    game.S.mem[loanTaken('consumer')] = true
    setMoney(game, 50000)
    game.scheduleCredits()
    const at = Number(game.S.mem[loanDueAt('consumer')])
    game.S.day = at
    await game.fire('CreditDue', { credit: 'consumer', at })
    game.flushBankCharges()
    expect(game.S.money).toBe(50000 - LOANS[0].payment)
    await game.fire('CreditDue', { credit: 'consumer', at })
    await game.fire('CreditDue', { credit: 'consumer' })
    expect(game.S.money, 'устаревшее событие не списывает второй раз').toBe(50000 - LOANS[0].payment)
  })
  it('у каждого займа одно событие платежа, когда дни перескакивают через сроки (#181)', async () => {
    const { game } = makeGame()
    setMoney(game, 10_000_000)
    const texts: string[] = []
    const notify = game.notify.bind(game)
    game.notify = (icon, app, text) => { texts.push(text); notify(icon, app, text) }
    for (const l of LOANS) game.S.mem[loanTaken(l.id)] = true
    game.scheduleCredits()
    const pending = (id: string) => game.rules.state.schedule.filter((it) => it.kind === 'event' && it.event === 'CreditDue' && it.facts?.credit === id).length
    const start = game.S.day
    const jumps = [1, 2, 3]
    for (let i = 0; game.S.day < start + 140; i++) {
      game.nextDay(jumps[i % 3])
      await game.afterTurn()
      for (const l of LOANS) expect(pending(l.id), `${l.id} на день ${game.S.day}`).toBe(1)
    }
    const weeks = Math.ceil((game.S.day - start) / 7)
    for (const l of LOANS) {
      const n = texts.filter((t) => t.includes(l.label) && /Списани/.test(t)).length
      expect(n, l.id).toBeGreaterThanOrEqual(weeks - 1)
      expect(n, l.id).toBeLessThanOrEqual(weeks)
    }
  })
})

describe('кривая баланса до дна', () => {
  it('дно по пути к выплате: не день 0 и не «никогда» на типичных сидах', () => {
    const bottoms: number[] = []
    for (const seed of [1, 2, 3, 5, 8, 13, 21]) {
      const { game } = makeGame({ seed })
      const start = game.S.day
      let hit: number | null = null
      for (let d = 0; d < 200 && hit == null; d++) {
        const spend = 290
        if (game.S.money >= spend) game.adjustMoney(-spend, 'Продукты')
        else if (game.S.money > 0) game.adjustMoney(-game.S.money, 'Продукты')
        if (game.moneyLevel() === 'bottom') { hit = game.S.day - start; break }
        game.nextDay(1)
        if (game.S.mem[creditOffer]) game.takeCredit()
      }
      expect(hit, `seed ${seed}`).not.toBeNull()
      bottoms.push(hit!)
    }
    expect(Math.min(...bottoms)).toBeGreaterThan(5)
    expect(Math.max(...bottoms)).toBeLessThan(120)
    console.log('money bottom days-from-start by seed:', bottoms.join(', '))
  })
})

describe('негативные контроли', () => {
  it('без moneyBottom предложение не открывается', () => {
    const { game } = makeGame()
    setMoney(game, 10000)
    game.maybeCreditOffer()
    expect(game.S.mem[creditOffer]).toBeFalsy()
  })

  it('реплика про микроволновку — только при sold.microwave', () => {
    const { game } = makeGame()
    const open = () => game.lines.eligible('NOTIF', NOTIF, game.lineFacts()).some((p) => p.text.includes('Микроволновку'))
    expect(open()).toBe(false)
    game.S.mem[sold('microwave')] = true
    expect(open()).toBe(true)
  })

  it('сломанный gate sold — тест красный (NC)', () => {
    const { game } = makeGame()
    const open = () => game.lines.eligible('NOTIF', NOTIF, game.lineFacts()).some((p) => p.text.includes('Микроволновку'))
    game.S.mem[sold('microwave')] = true
    expect(open()).toBe(true)
    delete game.S.mem[sold('microwave')]
    expect(open()).toBe(false)
  })
})
