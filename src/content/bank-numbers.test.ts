// Инвариант видимых чисел банка (#553): карточка, сводка и отказ не противоречат друг другу —
// числа восстанавливаются из других видимых чисел при любом порядке нажатий.
import { describe, it, expect } from 'vitest'
import { makeGame, setMoney, cards } from '../test/helpers'
import { billDueAt } from './bills'
import { LOANS, loanTaken, loanDueAt } from './credit'
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

  it('кнопка в ту же неделю — как было: результат на самой карточке', () => {
    const { game } = makeGame()
    setMoney(game, 100)
    game.chargeBill('rent')
    const offer = cards(game, 'Банк').at(-1)!
    const n = cards(game, 'Банк').length
    game.S.day += 2 // другой день, та же неделя
    game.answerCard(offer.id, 'take')
    const shown = cards(game, 'Банк').find((c) => c.id === offer.id)!
    expect(shown.answered).toBe(true)
    expect(shown.result).toMatch(/^Кредит взят: \+/)
    expect(cards(game, 'Банк'), 'лента не растёт').toHaveLength(n)
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
