import { describe, it, expect } from 'vitest'
import { Game } from '../engine/game'
import { makeGame, setMoney, cards, moneyLog, memStorage } from '../test/helpers'
import { NOTIF } from './life'
import { moneyPoor } from './memkeys'
import {
  LOANS, THINGS, MOM_HELPS, creditOffer, creditStage, creditBroke, momDone,
  sold, momHelp, loanTaken, loanDueAt, allSold,
} from './credit'
import { SAVE_KEY, freshState, setCount } from '../engine/state'

describe('кредитная лестница', () => {
  it('на дне банк предлагает первую ступень', () => {
    const { game } = makeGame()
    setMoney(game, 6001)
    expect(game.adjustMoney(-1, 'Гречка')).toBe(true)
    expect(game.S.mem[creditOffer]).toBe(true)
    // одна карточка: причина рядом с офером первой ступени (#272/#287), баннера нет
    const [card] = cards(game, 'Банк')
    expect(card.text).toBe(`Остаток критический: ${(6000).toLocaleString('ru-RU')} ₽ после «Гречка». ${LOANS[0].offer}`)
    expect(card.offer).toEqual({ take: 'Взять кредит «Всё будет»', sell: THINGS[0].choice })
    expect(cards(game)).toHaveLength(1)
    expect(game.ui.notif).toBeNull()
  })

  it('каждая ступень предлагает свой текст; после микрозайма — ничего (#272)', () => {
    for (const stage of [0, 1, 2, 3]) {
      const { game } = makeGame()
      const said: string[] = []
      const orig = game.notify.bind(game)
      game.notify = (icon, app, text) => { said.push(text); return orig(icon, app, text) }
      game.S.mem[creditStage] = stage
      setMoney(game, 1000)
      game.maybeCreditOffer()
      const offers = said.flatMap((t) => LOANS.filter((l) => t.endsWith(`. ${l.offer}`)).map((l) => l.offer))
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

  it('кредит больше не вытесняет ответы Алику: вариантов кредита нет (#287)', () => {
    const { game } = makeGame()
    setMoney(game, 1000)
    game.S.mem[creditOffer] = true
    const texts = game.buildChoices().map((c) => c.text)
    expect(texts.some((t) => /кредит|микрозайм|Продать/i.test(t))).toBe(false)
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
    game.notify = (icon: string, app: string, text: string): boolean => { said.push(text); return orig(icon, app, text) }
    const refusals = (): number => said.filter((t) => /^Не прошло: Платёж по кредиту «Всё будет»/.test(t)).length
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

  it('CreditDue списывает платёж', async () => {
    const { game } = makeGame()
    game.S.mem[loanTaken('consumer')] = true
    setMoney(game, 50000)
    game.scheduleCredits()
    const at = Number(game.S.mem[loanDueAt('consumer')])
    game.S.day = at
    await game.fire('CreditDue', { credit: 'consumer', at })
    game.flushBankWeek()
    expect(game.S.money).toBe(50000 - LOANS[0].payment)
    await game.fire('CreditDue', { credit: 'consumer', at })
    await game.fire('CreditDue', { credit: 'consumer' })
    expect(game.S.money, 'устаревшее событие не списывает второй раз').toBe(50000 - LOANS[0].payment)
  })
  it('у каждого займа одно событие платежа, когда дни перескакивают через сроки (#181)', async () => {
    const { game } = makeGame()
    setMoney(game, 10_000_000)
    const charged = moneyLog(game)
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
      const n = charged.filter((t) => t === `-${l.label}`).length
      expect(n, l.id).toBeGreaterThanOrEqual(weeks - 1)
      expect(n, l.id).toBeLessThanOrEqual(weeks)
    }
  })
})

describe('карточка банка с кнопками (#287)', () => {
  const bottom = () => {
    const { game } = makeGame()
    setMoney(game, 100)
    game.chargeBill('rent') // не прошло → на дне отказ и предложение одной карточкой
    const card = cards(game, 'Банк').at(-1)!
    return { game, card }
  }
  const mine = (g: ReturnType<typeof makeGame>['game']) => g.S.msgs.filter((m) => m.kind === 'text' && m.from === 'me').length

  it('причина рядом с предложением', () => {
    const { card } = bottom()
    expect(card.text).toMatch(/^Не прошло: Коммуналка, 2\s500 ₽\. Вам одобрен кредит «Всё будет»/)
    expect(card.offer?.take).toBe('Взять кредит «Всё будет»')
  })

  it('«Взять кредит» даёт кредит и не пишет Алику', () => {
    const { game, card } = bottom()
    const msgs = game.S.msgs.length
    const me = mine(game)
    game.answerCard(card.id, 'take')
    expect(game.S.mem[loanTaken('consumer')]).toBe(true)
    expect(game.S.money).toBe(100 + LOANS[0].amount)
    expect(mine(game), 'реплики игрока нет').toBe(me)
    expect(game.S.msgs.length, 'в ленту ничего не добавилось — изменилась сама карточка').toBe(msgs)
    const after = cards(game, 'Банк').at(-1)!
    expect(after.answered).toBe(true)
    expect(after.result).toMatch(/^Кредит взят: \+30\s000 ₽\. Баланс: 30\s100 ₽$/)
    game.answerCard(card.id, 'take') // второе нажатие — ничего
    expect(game.S.mem[creditStage]).toBe(1)
  })

  it('«Продать» пишет sold и деньги; мало — банк предлагает снова, ниже, с причиной', () => {
    const { game, card } = bottom()
    game.answerCard(card.id, 'sell')
    expect(game.S.mem[sold('microwave')]).toBe(true)
    expect(game.S.money).toBe(100 + THINGS[0].amount)
    const bank = cards(game, 'Банк')
    expect(bank.find((c) => c.id === card.id)?.result).toMatch(/^Микроволновку забрали/)
    const again = bank.at(-1)!
    expect(again.id).not.toBe(card.id)
    expect(again.text).toMatch(/^Продано, а остаток 4\s600 ₽\. Вам одобрен/)
    expect(again.offer?.sell).toBe(THINGS[1].choice)
  })

  it('«Не сейчас»: без новой причины банк молчит, отказ платежа — новая карточка, старая закрыта', () => {
    const { game, card } = bottom()
    game.answerCard(card.id, 'later')
    expect(game.S.mem[creditOffer]).toBe(false)
    const n = cards(game).length
    game.chargeBill('transit') // отказ другого платежа — новая причина
    expect(cards(game).length).toBe(n + 1)
    const fresh = cards(game).at(-1)!
    expect(fresh.text).toMatch(/^Не прошло: Проездной/)
    expect(fresh.offer).toBeDefined()
    game.maybeCreditOffer() // без причины — после «не сейчас» не повторяет
    expect(cards(game).length).toBe(n + 1)
  })

  it('переписка без выбора предложение не снимает: открытая карточка остаётся (новый отказ переносит её ниже)', async () => {
    const { game } = bottom()
    for (let i = 0; i < 3; i++) await game.send({ text: 'Алик, где деньги?', tone: 'polite' })
    const open = cards(game, 'Банк').filter((c) => c.offer && !c.answered)
    expect(open).toHaveLength(1)
    expect(game.S.mem[creditOffer]).toBe(true)
    game.answerCard(open[0].id, 'take')
    expect(game.S.mem[loanTaken('consumer')]).toBe(true)
  })

  it('после Дня выплаты кнопка ничего не меняет и закрывается', () => {
    const { game, card } = bottom()
    game.S.mem.payday = 'default'
    game.answerCard(card.id, 'take')
    expect(game.S.mem[loanTaken('consumer')]).toBeFalsy()
    expect(cards(game, 'Банк').find((c) => c.id === card.id)?.answered).toBe(true)
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

describe('после первого дна бедность до выплаты (#279)', () => {
  it('кредит не возвращает в норму, пока money.poor', () => {
    const { game } = makeGame()
    setMoney(game, Game.MONEY_BOTTOM + 100)
    expect(game.adjustMoney(-200, 'Продукты')).toBe(true)
    expect(game.S.mem[moneyPoor]).toBe(true)
    expect(game.moneyLevel()).toBe('bottom')
    setMoney(game, 50_000)
    expect(game.moneyLevel()).toBe('low')
    expect(game.facts().moneyNormal).toBe(false)
    expect(game.facts().moneyLow).toBe(true)
  })

  it('без money.poor большой баланс — норма (NC)', () => {
    const { game } = makeGame()
    setMoney(game, 50_000)
    expect(game.S.mem[moneyPoor]).toBeFalsy()
    expect(game.moneyLevel()).toBe('normal')
  })

  it('кривая: после первого дна баланс не выше порога «мало» до выплаты (#299)', async () => {
    const { botTurn } = await import('../tools/bot')
    const { Game } = await import('../engine/game')
    const peaks: number[] = []
    for (const seed of [1, 2, 3, 5, 8, 13]) {
      const { game } = makeGame({ seed })
      let firstBottom: number | null = null
      let peak = 0
      let daysAfter = 0
      for (let i = 0; i < 200; i++) {
        await botTurn(game)
        if (game.S.mem[moneyPoor] && firstBottom == null) firstBottom = game.S.day
        if (firstBottom != null && !game.S.mem['payday.chain'] && !game.S.mem['endgame.active']) {
          daysAfter++
          peak = Math.max(peak, game.S.money)
          expect(game.S.money, `seed ${seed} day ${game.S.day}`).toBeLessThanOrEqual(Game.MONEY_LOW)
        }
        if (game.S.mem['payday.chain'] || game.S.mem['endgame.active']) break
      }
      expect(firstBottom, `seed ${seed} never bottom`).not.toBeNull()
      expect(daysAfter, `seed ${seed}`).toBeGreaterThan(0)
      peaks.push(peak)
    }
    console.log('balance peaks after bottom (≤9000):', peaks.join(', '))
  }, 180_000)

  it('после дна кредит/продажа не поднимают баланс выше MONEY_LOW (#299)', () => {
    const { game } = makeGame()
    setMoney(game, 100)
    game.S.mem[moneyPoor] = true
    expect(game.adjustMoney(30_000, 'Кредит: Всё будет')).toBe(true)
    expect(game.S.money).toBe(Game.MONEY_LOW)
    expect(game.adjustMoney(5_000, 'Авито')).toBe(true)
    expect(game.S.money).toBe(Game.MONEY_LOW)
  })

  it('без money.poor кредит даёт полную сумму (NC #299)', () => {
    const { game } = makeGame()
    setMoney(game, 100)
    expect(game.S.mem[moneyPoor]).toBeFalsy()
    expect(game.adjustMoney(30_000, 'Кредит: Всё будет')).toBe(true)
    expect(game.S.money).toBe(30_100)
  })
})

describe('негативные контроли', () => {
  it('без moneyBottom предложение не открывается', () => {
    const { game } = makeGame()
    setMoney(game, 10000)
    game.maybeCreditOffer()
    expect(game.S.mem[creditOffer]).toBeFalsy()
  })

  it('старое сохранение с credit.offer без карточки — снова карточка, не кнопка Алику (#300)', () => {
    const storage = memStorage()
    const s = freshState()
    setCount(s, 'money', 100)
    s.mem[creditOffer] = true
    s.mem[creditStage] = 0
    s.choices = [{ text: 'Взять кредит «Всё будет»', tone: 'polite', act: 'creditTake' }]
    s.msgs = [{ id: 1, kind: 'text', from: 'alik', text: 'Брат', time: '14:00' }]
    s.nextId = 2
    storage.setItem(SAVE_KEY, JSON.stringify(s))
    const { game } = makeGame({ storage, seed: 2 })
    expect(game.choices.some((c) => /Взять кредит/.test(c.text) || c.act === 'creditTake')).toBe(false)
    const offer = game.S.msgs.find((m) => m.kind === 'card' && m.offer && !m.answered)
    expect(offer?.kind === 'card' && offer.offer?.take).toMatch(/Взять кредит/)
    expect(game.S.mem[creditOffer]).toBe(true)
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
