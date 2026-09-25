// Сторожа сроков: род обязателен и согласован с датой/оценкой/календарём; горизонт считается по источнику.
// Роды и правила — docs/design/deadline-replies.md.
import { describe, it, expect } from 'vitest'
import { valueOf } from '../engine/rules'
import { D, type Promise3, type When } from './excuses'
import { LEGENDS } from './legends'
import { holidayDays, type HolidayRef } from './holidays'
import { fmtDayMonth } from '../engine/time'
import { sick, wedding } from './memkeys'
import { makeGame } from '../test/helpers'

const KINDS = ['clear', 'dodge', 'event', 'holiday', 'never', 'absurd'] as const

function* allWhens(): Generator<{ src: string; w: When }> {
  for (const [name, pool] of [['WHEN', D.WHEN], ['WHEN1', D.WHEN1], ['WHEN2', D.WHEN2], ['WHEN3', D.WHEN3]] as const)
    for (const e of pool) yield { src: name, w: valueOf(e) }
  for (const [id, l] of Object.entries(LEGENDS)) yield { src: `legend.${id}`, w: l.until }
}

describe('сторожа разметки сроков', () => {
  it('род у каждого срока, и род согласован с датой, оценкой и календарём', () => {
    let n = 0
    for (const { src, w } of allWhens()) {
      n++
      expect(KINDS, `${src}: «${w.t}» — неизвестный род`).toContain(w.kind)
      if (w.kind === 'never' || w.kind === 'absurd') expect(w.d, `${src}: «${w.t}» — ${w.kind} с датой`).toBeNull()
      if (w.kind === 'clear' || w.kind === 'dodge') expect(w.d, `${src}: «${w.t}» — без даты`).not.toBeNull()
      if (w.kind === 'event') expect(typeof w.est, `${src}: «${w.t}» — событие без оценки`).toBe('number')
      if (w.kind === 'holiday') {
        expect(w.holiday, `${src}: «${w.t}» — праздник без ссылки на календарь`).toBeDefined()
        expect(holidayDays(w.holiday as HolidayRef, 200), `${src}: «${w.t}» — нет даты в таблице`).toBeGreaterThanOrEqual(0)
      }
    }
    expect(n).toBeGreaterThanOrEqual(89) // 44 в WHEN + 15 в WHEN1–3 + 30 легенд
  })

  it('календарь: Пасха по григорианскому компуту, Навасард — 11 августа, переход года', () => {
    // день 0 = 18.03.2026 → Пасха-2026 (5 апреля) через 18 дней; день 289 = 01.01.2027 → Пасха-2027 (28 марта) через 86
    expect(holidayDays('easter', 0)).toBe(18)
    expect(holidayDays('easter', 289)).toBe(86)
    expect(holidayDays('navasard', 146)).toBe(0) // 11.08.2026
    expect(holidayDays('navasard', 147)).toBe(364) // следующий Навасард — через год с завтра
    expect(holidayDays('winter', 0)).toBeGreaterThan(200) // к зиме из марта — далеко
  })

  it('праздник, сказанный в разные дни партии, даёт разную даль', () => {
    expect(holidayDays('easter', 10)).toBeLessThan(holidayDays('easter', 0))
  })
})

describe('горизонт по источнику', () => {
  it('событие с идущей свадьбой — остаток её срока из расписания; без неё — оценка автора', () => {
    const { game } = makeGame()
    const p = { text: 'сразу после свадьбы — отдам', t: 'сразу после свадьбы', d: 7, kind: 'event' as const, est: 7, state: { prefix: 'wedding.' } }
    expect(game.ctxFromPromise(p).whenDays).toBe(7) // свадьбы нет — оценка
    game.rules.applyOps([{ key: wedding('samvel'), op: '=', value: true, forDays: 8 }], {})
    expect(game.ctxFromPromise(p).whenDays).toBe(8) // идёт свадьба Самвела — её остаток
    game.S.day += 2
    expect(game.ctxFromPromise(p).whenDays).toBe(6) // свадьба идёт, остаток убыл
  })

  it('болезнь Бориса — остаток состояния на его доске (actor, а не мир)', () => {
    const { game } = makeGame()
    game.rules.applyOps([{ key: sick, op: '=', value: true, forDays: 10, scope: 'target' }], { target: 'boris' })
    const p = { text: 'как баран поправится — отдам', t: 'как баран поправится', d: null, kind: 'event' as const, est: 14, state: { key: sick, actor: 'boris' } }
    expect(game.ctxFromPromise(p).whenDays).toBe(10)
  })

  it('путь игрока: Алик называет срок каждого рода — на доске правильные род и горизонт', async () => {
    const { game } = makeGame()
    const cases: Array<[Promise3, { days: number | undefined; horizon?: string; date: boolean }]> = [
      [{ text: 'завтра — всё отдам', t: 'завтра', d: 1, kind: 'clear', tomorrow: true }, { days: 1, horizon: 'near', date: true }],
      [{ text: 'в пятницу, край — в понедельник — отдам', t: 'в пятницу, край — в понедельник', d: 4, kind: 'dodge', due: { weekday: 5, plus: 3 } }, { days: 10, horizon: 'far', date: true }],
      [{ text: 'как бетон застынет — отдам', t: 'как бетон застынет', d: null, kind: 'event', est: 28 }, { days: 28, horizon: 'far', date: false }],
      [{ text: 'к Пасхе — отдам', t: 'к Пасхе', d: null, kind: 'holiday', holiday: 'easter' }, { days: holidayDays('easter', game.S.day), horizon: 'veryFar', date: false }],
      [{ text: 'когда рак на Арагаце свистнет — отдам', t: 'когда рак на Арагаце свистнет', d: null, kind: 'never' }, { days: undefined, date: false }],
      [{ text: 'в следующем веке — отдам', t: 'в следующем веке, в начале', d: null, kind: 'absurd' }, { days: undefined, date: false }],
    ]
    for (const [p, want] of cases) {
      game.X.promise = () => p
      await game.promiseLine()
      const ctx = game.S.ctx!
      expect(ctx.when, p.t).toBe(p.t)
      expect(ctx.whenNever, p.t).toBe(p.d === null)
      expect(ctx.whenDays, p.t).toBe(want.days)
      expect(ctx.whenHorizon, p.t).toBe(want.horizon ?? undefined)
      // горизонт согласован с журнальным днём срока: у датированных сроков это due − сегодня
      if (p.d != null && ctx.whenDue != null) expect(ctx.whenDue - game.S.day, p.t).toBe(ctx.whenDays)
      const date = game.facts()['ctx.whenDate']
      if (want.date) expect(date, p.t).toBe(fmtDayMonth(game.S.day + (want.days ?? 0)))
      else expect(date, p.t).toBeUndefined()
    }
  })

  it('ctx.whenDate — дата срока, а не день обещания', () => {
    const { game } = makeGame()
    const made = fmtDayMonth(game.S.day)
    const ctx = game.ctxFromPromise({ text: 'завтра', t: 'завтра', d: 1, kind: 'clear', tomorrow: true })
    game.S.ctx = ctx
    const date = game.facts()['ctx.whenDate']
    expect(date).not.toBe(made)
    expect(date).toBe(fmtDayMonth(game.S.day + 1))
  })

  it('правка сообщения пишет срок рода «никогда» и снимает горизонт и дату', async () => {
    const { game } = makeGame()
    const m = game.push({ kind: 'text', from: 'alik', text: 'В среду утром — всё отдам.' })
    await game.editLast(m, { text: 'в среду утром — всё отдам', t: 'в среду утром', d: 3, kind: 'clear' })
    expect(game.S.ctx?.whenKind).toBe('never')
    expect(game.S.ctx?.whenDays).toBeUndefined()
    expect(game.S.ctx?.whenHorizon).toBeUndefined()
    expect(game.facts()['ctx.whenDate']).toBeUndefined()
  })
})
