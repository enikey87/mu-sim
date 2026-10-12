// Инвариант видимых чисел банка (#553): карточка, сводка и отказ не противоречат друг другу —
// числа восстанавливаются из других видимых чисел при любом порядке нажатий.
import { describe, it, expect } from 'vitest'
import { makeGame, setMoney, cards } from '../test/helpers'
import { billDueAt } from './bills'
import { LOANS, loanTaken, loanDueAt, creditStage } from './credit'
import { weekOf, dateOf } from '../engine/time'
import type { Game } from '../engine/game'

/** Накопитель ушедших недель: неделя, баланс и сумма строк — то, что напечатала сводка. */
const weeks = (game: Game): { week: number; bal: number; delta: number }[] => {
  const log: { week: number; bal: number; delta: number }[] = []
  const flush = game.flushBankWeek.bind(game)
  game.flushBankWeek = () => {
    const b = game.S.bank
    flush()
    if (b && b.week < weekOf(game.S.day)) {
      const delta = Object.entries(b.lines).reduce((s, [k, v]) => s + (k[0] === '+' ? v.sum : k[0] === '-' ? -v.sum : 0), 0)
      log.push({ week: b.week, bal: b.bal, delta })
    }
  }
  return log
}

const summaries = (game: Game) => cards(game, 'Банк').filter((c) => c.text.startsWith('Сводка'))

describe('ответ на предложение позже показа (#553, случаи 1–2)', () => {
  it('кнопка в новой неделе: результат отдельной карточкой в день нажатия, не на карточке показа', () => {
    const { game } = makeGame()
    setMoney(game, 100)
    game.chargeBill('rent') // дно: отказ и предложение одной карточкой
    const offer = cards(game, 'Банк').at(-1)!
    expect(offer.offer?.take).toBeTruthy()
    const due = Number(game.S.mem[billDueAt('phone')])
    game.S.day = weekOf(due) + 8 // новая неделя
    game.chargeBill('phone') // Связь ушла уже в новой неделе — видимый баланс уехал от базы
    game.answerCard(offer.id, 'take')
    expect(game.S.mem[loanTaken('consumer')]).toBe(true)
    const shown = cards(game, 'Банк').find((c) => c.id === offer.id)!
    expect(shown.answered).toBe(true)
    expect(shown.result, 'на карточке показа чисел нет — они верны на день нажатия').toBeUndefined()
    const res = cards(game, 'Банк').at(-1)!
    expect(res.id).not.toBe(offer.id)
    expect(res.text).toMatch(/^Кредит взят: \+/)
    expect(res.day).toBe(game.S.day)
    // строка кредита — в неделе нажатия: сводка этой недели её и называет
    expect(game.S.bank?.week).toBe(weekOf(game.S.day))
    game.S.day += 7
    game.flushBankWeek()
    expect(summaries(game).at(-1)?.lines?.join(' ')).toMatch(/Кредит: кредиту «Всё будет»/)
  })

  it('кнопка в тот же день — результат на самой карточке', () => {
    const { game } = makeGame()
    setMoney(game, 100)
    game.chargeBill('rent')
    const offer = cards(game, 'Банк').at(-1)!
    const n = cards(game, 'Банк').length
    game.answerCard(offer.id, 'take')
    const shown = cards(game, 'Банк').find((c) => c.id === offer.id)!
    expect(shown.answered).toBe(true)
    expect(shown.result).toMatch(/^Кредит взят: \+/)
    expect(cards(game, 'Банк'), 'лента не растёт').toHaveLength(n)
  })

  it('кнопка в другой день той же недели: результат отдельной карточкой в день нажатия (#556)', () => {
    const { game } = makeGame()
    setMoney(game, 100)
    game.chargeBill('rent')
    const offer = cards(game, 'Банк').at(-1)!
    expect(offer.offer?.take).toBeTruthy()
    const showDay = offer.day!
    expect(weekOf(showDay + 2), 'тот же понедельник недели').toBe(weekOf(showDay))
    game.S.day = showDay + 2
    game.answerCard(offer.id, 'take')
    const shown = cards(game, 'Банк').find((c) => c.id === offer.id)!
    expect(shown.answered).toBe(true)
    expect(shown.result, 'на карточке показа чисел нет — они верны на день нажатия').toBeUndefined()
    const res = cards(game, 'Банк').at(-1)!
    expect(res.id).not.toBe(offer.id)
    expect(res.text).toMatch(/^Кредит взят: \+/)
    expect(res.day).toBe(game.S.day)
  })

  it('отказ между показом и нажатием внутри недели не противоречит балансу результата (#556)', () => {
    const { game } = makeGame()
    setMoney(game, 100)
    game.chargeBill('rent') // дно: отказ + предложение
    const offer = cards(game, 'Банк').at(-1)!
    expect(offer.offer?.take).toBeTruthy()
    const showDay = offer.day!
    // тот же понедельник недели: отказ проездного уводит видимые деньги, потом кнопка
    game.S.day = showDay + 2
    expect(weekOf(game.S.day)).toBe(weekOf(showDay))
    setMoney(game, 10) // как в сиде 76117: перед отказом почти пусто
    game.chargeBill('transit')
    const refuse = cards(game, 'Банк').at(-1)!
    expect(refuse.text).toMatch(/^Не прошло: Проездной/)
    expect(refuse.day).toBe(game.S.day)
    const before = game.S.money
    game.answerCard(offer.id, 'take')
    const shown = cards(game, 'Банк').find((c) => c.id === offer.id)!
    expect(shown.result, 'числа не на карточке показа').toBeUndefined()
    const res = cards(game, 'Банк').at(-1)!
    expect(res.day, 'результат под днём нажатия, не показа').toBe(game.S.day)
    expect(res.day).toBe(refuse.day)
    expect(res.text).toMatch(/^Кредит взят: \+/)
    const bal = Number(res.text.match(/Баланс: ([\d\s]+)/)?.[1]?.replace(/\s/g, ''))
    expect(bal).toBe(game.S.money)
    expect(bal).toBeGreaterThan(before)
  })
})

describe('один платёж по метке в неделю (#553, случай 3)', () => {
  it('успех с опозданием выносит следующий срок за текущую неделю: «списано» не соседствует с «не прошло»', async () => {
    const { game } = makeGame()
    game.S.mem[loanTaken('consumer')] = true
    setMoney(game, 50000)
    game.scheduleCredits()
    const at = Number(game.S.mem[loanDueAt('consumer')])
    game.S.day = at + 8 // срок в прошлой неделе, платёж проходит сейчас
    await game.fire('CreditDue', { credit: 'consumer', at })
    expect(game.S.money).toBe(50000 - LOANS[0].payment)
    const successDay = game.S.day
    const next = Number(game.S.mem[loanDueAt('consumer')])
    expect(weekOf(next), 'следующая попытка — не в той же неделе').toBeGreaterThan(weekOf(successDay))
    // сводка недели успеха называет платёж
    game.S.day = weekOf(successDay) + 8
    game.flushBankWeek()
    expect(summaries(game).at(-1)?.lines?.join(' ')).toMatch(/Платёж по кредиту «Всё будет»/)
    // отказ случится не раньше следующей недели: в неделе успеха отказов по метке нет
    game.S.day = next
    setMoney(game, 100)
    await game.fire('CreditDue', { credit: 'consumer', at: next })
    expect(cards(game, 'Банк').at(-1)?.text).toMatch(/^Не прошло: Платёж по кредиту/)
    const refusalsInSuccessWeek = cards(game, 'Банк')
      .filter((c) => /^Не прошло: Платёж по кредиту/.test(c.text) && c.day != null && weekOf(c.day) === weekOf(successDay))
    expect(refusalsInSuccessWeek).toEqual([])
  })

  it('успех вовремя не двигает недельный ритм', async () => {
    const { game } = makeGame()
    game.S.mem[loanTaken('consumer')] = true
    setMoney(game, 50000)
    game.scheduleCredits()
    const at = Number(game.S.mem[loanDueAt('consumer')])
    game.S.day = at // срок сегодня (воскресенье)
    await game.fire('CreditDue', { credit: 'consumer', at })
    const next = Number(game.S.mem[loanDueAt('consumer')])
    expect(next).toBeGreaterThan(game.S.day)
    expect(weekOf(next)).toBeGreaterThan(weekOf(game.S.day))
  })

  it('отказ тоже выносит следующую попытку за текущую неделю: «не прошло» не соседствует с «списано»', async () => {
    const { game } = makeGame()
    game.S.mem[loanTaken('consumer')] = true
    setMoney(game, 100)
    game.scheduleCredits()
    const at = Number(game.S.mem[loanDueAt('consumer')])
    game.S.day = at + 2 // срок в воскресенье, попытка во вторник — посреди недели
    await game.fire('CreditDue', { credit: 'consumer', at }) // не хватило
    const next = Number(game.S.mem[loanDueAt('consumer')])
    expect(weekOf(next), 'повторная попытка — не в той же неделе').toBeGreaterThan(weekOf(game.S.day))
  })
})

describe('строка не встаёт в неделю с ушедшей сводкой (#553)', () => {
  it('опоздавший платёж при открытом буфере срока остаётся в неделе срока (#300)', async () => {
    const { game } = makeGame()
    setMoney(game, 10_000_000)
    const due = Number(game.S.mem[billDueAt('transit')])
    expect(dateOf(due).getDay(), 'проездной — воскресенье').toBe(0)
    game.chargeBill('phone') // строка в текущей неделе открывает буфер недели срока
    expect(game.S.bank?.week).toBe(weekOf(due))
    game.S.day = due + 1
    await game.fire('BillDue', { bill: 'transit', at: due })
    expect(game.S.bank?.week, 'неделя срока ещё не ушла — строка в ней').toBe(weekOf(due))
    game.S.day = due + 8
    game.flushBankWeek()
    const summary = summaries(game).at(-1)!
    expect(summary.lines?.join(' ')).toMatch(/Проездной 500 ₽/)
    expect(summary.lines?.join(' ')).not.toMatch(/2 раза/)
  })

  it('опоздавший платёж при ушедшей сводке срока встаёт в неделю обработки', async () => {
    const { game } = makeGame()
    setMoney(game, 10_000_000)
    const due = Number(game.S.mem[billDueAt('transit')])
    game.S.day = due + 1
    await game.fire('BillDue', { bill: 'transit', at: due })
    expect(game.S.bank?.week).toBe(weekOf(game.S.day))
    game.S.day = due + 8
    game.flushBankWeek()
    expect(summaries(game).at(-1)?.lines?.join(' ')).toMatch(/Проездной 500 ₽/)
  })
})

describe('цепочка видимых чисел сходится (#553)', () => {
  it('баланс каждой сводки — предыдущий плюс её строки', async () => {
    const { game } = makeGame()
    const log = weeks(game)
    game.S.mem[loanTaken('consumer')] = true
    game.scheduleCredits()
    setMoney(game, 100)
    for (let d = 0; d < 90; d++) {
      game.S.day += 1
      game.adjustMoney(3000, 'Зарплата')
      const due = Number(game.S.mem[billDueAt('phone')])
      if (game.S.day >= due) await game.fire('BillDue', { bill: 'phone', at: due })
      const creditAt = Number(game.S.mem[loanDueAt('consumer')])
      if (game.S.day >= creditAt) await game.fire('CreditDue', { credit: 'consumer', at: creditAt })
      game.flushBankWeek()
      const w = log[log.length - 1]
      const prev = log[log.length - 2]
      if (log.length > 1 && w && prev) expect(w.bal, `неделя ${w.week}`).toBe(prev.bal + w.delta)
    }
    expect(log.length, 'сводки за период были').toBeGreaterThan(5)
  })
})

// форма сида 79031: сводка утром, тихое списание в новый буфер, кредит в тот же день
const num = (text: string, re: RegExp): number => Number(text.match(re)?.[1]?.replace(/\s/g, ''))

describe('результат кнопки называет строки недели, которых игрок ещё не видел (#563)', () => {
  it('сводка, тихое списание и кредит в один день: баланс сходится через строку результата', () => {
    const { game } = makeGame()
    setMoney(game, 6800)
    game.chargeBill('phone') // строка недели: у сводки будут и баланс, и «Списано»
    expect(cards(game, 'Банк'), 'предложения ещё нет — падение впереди').toHaveLength(0)
    game.S.day = weekOf(game.S.day) + 7 // новая неделя, понедельник — срок связи
    game.chargeBill('phone') // −400: сводка уходит в ленту, строка — в новый буфер, деньги на дне → предложение
    const offer = cards(game, 'Банк').at(-1)!
    expect(offer.offer?.take).toBeTruthy()
    const B = num(summaries(game).at(-1)!.text, /баланс ([\d\s]+) ₽/)
    expect(game.S.money, 'видимый баланс уехал от сводки — форма 79031').not.toBe(B)
    game.answerCard(offer.id, 'take')
    const res = cards(game, 'Банк').at(-1)!
    expect(res.id).toBe(offer.id) // ответ в тот же день — итог на самой карточке
    const A = num(res.result!, /\+([\d\s]+) ₽/)
    const Y = num(res.result!, /Баланс: ([\d\s]+) ₽/)
    expect(res.lines, 'тихое списание названо на карточке результата').toEqual(['Списано: Связь 400 ₽'])
    expect(Y).toBe(B - 400 + A)
  })

  it('ответ кнопкой позже показа: отдельная карточка результата тоже называет строки', () => {
    const { game } = makeGame()
    setMoney(game, 100)
    game.chargeBill('rent') // дно: отказ и предложение одной карточкой
    const offer = cards(game, 'Банк').at(-1)!
    expect(offer.offer?.take).toBeTruthy()
    const showDay = offer.day!
    game.S.day = showDay + 2 // другой день той же недели
    expect(weekOf(game.S.day)).toBe(weekOf(showDay))
    game.adjustMoney(2000, 'Зарплата')
    game.chargeBill('phone')
    game.answerCard(offer.id, 'take')
    const res = cards(game, 'Банк').at(-1)!
    expect(res.id).not.toBe(offer.id)
    expect(res.day).toBe(game.S.day)
    expect(res.lines?.map((l) => l.replace(/\s/g, ' '))).toEqual(['Списано: Связь 400 ₽', 'Поступило: Зарплата 2 000 ₽'])
  })
})

const lineDelta = (lines: string[] | undefined): number => {
  let d = 0
  for (const line of lines ?? []) {
    const sign = line.startsWith('Списано') ? -1 : line.startsWith('Поступило') ? 1 : 0
    for (const m of line.matchAll(/([\d\s]+) ₽/g)) d += sign * Number(m[1].replace(/\s/g, ''))
  }
  return d
}

// форма сида 96002: продажа и кредит в одной неделе; второй итог не пересказывает строки первого
describe('вторая карточка недели не повторяет уже названные строки (#568)', () => {
  const saleThenOffer = () => {
    const { game } = makeGame()
    game.S.mem[creditStage] = 2 // следующая ступень — микрозайм, как в трассировке 96002
    setMoney(game, 420)
    game.chargeBill('phone') // 20 ₽ и строка «Связь» — её назовёт первая карточка
    const offer = cards(game, 'Банк').at(-1)!
    expect(offer.offer?.sell).toBeTruthy()
    game.answerCard(offer.id, 'sell')
    const sold = cards(game, 'Банк').find((c) => c.id === offer.id)!
    const firstBal = num(sold.result!, /Баланс: ([\d\s]+) ₽/)
    expect(firstBal).toBe(4_520)
    expect(sold.lines?.map((l) => l.replace(/\s/g, ' '))).toEqual(['Списано: Связь 400 ₽'])
    const again = cards(game, 'Банк').filter((c) => c.offer && !c.answered).at(-1)!
    expect(again.text).toMatch(/^Продано, а остаток всё ещё критический/)
    return { game, firstBal, again }
  }

  it('продажа, затем кредит: от 4 520 только +4 480, без связи и авито', () => {
    const { game, firstBal, again } = saleThenOffer()
    game.answerCard(again.id, 'take')
    const res = cards(game, 'Банк').find((c) => c.id === again.id)!
    expect(res.result).toMatch(/^Микрозайм взят/)
    const credit = num(res.result!, /\+([\d\s]+) ₽/)
    const secondBal = num(res.result!, /Баланс: ([\d\s]+) ₽/)
    expect(credit).toBe(4_480)
    expect(secondBal).toBe(9_000)
    expect(res.lines, 'весь буфер повторил бы связь и авито').toBeUndefined()
    expect(firstBal + lineDelta(res.lines) + credit).toBe(secondBal)
    game.S.day = weekOf(game.S.day) + 8
    game.flushBankWeek()
    const summary = summaries(game).at(-1)!.lines!.join(' ').replace(/\s/g, ' ')
    expect(summary, 'сводка недели по-прежнему знает все движения').toMatch(/Связь 400 ₽/)
    expect(summary).toMatch(/Авито 4 500 ₽/)
    expect(summary).toMatch(/4 480 ₽/)
  })

  it('та же метка между карточками: вторая называет прирост, не накопленную сумму', () => {
    const { game, firstBal, again } = saleThenOffer()
    game.adjustMoney(-400, 'Связь') // буфер: Связь 800 (2 раза); игрок видел только первые 400
    expect(game.S.money).toBe(4_120)
    game.answerCard(again.id, 'take')
    const res = cards(game, 'Банк').find((c) => c.id === again.id)!
    const credit = num(res.result!, /\+([\d\s]+) ₽/)
    const secondBal = num(res.result!, /Баланс: ([\d\s]+) ₽/)
    expect(res.lines?.map((l) => l.replace(/\s/g, ' '))).toEqual(['Списано: Связь 400 ₽'])
    expect(firstBal + lineDelta(res.lines) + credit).toBe(secondBal)
    expect(game.S.bank?.lines['-Связь'], 'буфер недели не теряет уже показанное').toEqual({ sum: 800, n: 2 })
  })
})
