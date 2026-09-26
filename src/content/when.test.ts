// Род и горизонт срока: разметка всех сроков и факты контекста (docs/design/deadline-replies.md, #163). Кнопки и ответы Алика не меняются.
import { describe, it, expect, vi } from 'vitest'
import { makeGame } from '../test/helpers'
import { D, type When, type WhenKind } from './excuses'
import { LEGENDS } from './legends'
import { holidayDays, type HolidayRef } from './holidays'
import { sick, wedding } from './memkeys'
import { valueOf, type Entry } from './fact'
import { dueIn, fmtDayMonth, HANDOVER } from '../engine/time'
import type { Game } from '../engine/game'

/** До ближайшей даты — не больше года; Пасха гуляет на 35 дней, и Вардавар вместе с ней. */
const MAX_AHEAD = 366 + 35
const POOLS = ['WHEN', 'WHEN1', 'WHEN2', 'WHEN3'] as const
const terms = (): Array<[string, When]> => [
  ...POOLS.flatMap((k) => (D[k] as Entry<When>[]).map((e): [string, When] => [`D.${k}`, valueOf(e)])),
  ...Object.entries(LEGENDS).map(([id, l]): [string, When] => [`LEGENDS.${id}`, l.until]),
]
const byText = (t: string): When => terms().map(([, w]) => w).find((w) => w.t === t)!
/** Номер игрового дня по дате календаря. */
const dayOf = (y: number, m: number, d: number): number => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(HANDOVER.getFullYear(), HANDOVER.getMonth(), HANDOVER.getDate())) / 864e5)

/** Алик называет срок `w` настоящим путём клятвы; возвращает партию с фактами на доске. */
async function said(w: When, before?: (g: Game) => void): Promise<Game> {
  const { game } = makeGame()
  vi.spyOn(game.X, 'promise').mockImplementation(() => ({ text: `${w.t} — отдам`, ...w }))
  before?.(game)
  await game.promiseLine()
  return game
}
const ctx = (g: Game) => {
  const f = g.facts()
  return { kind: f['ctx.whenKind'], days: f['ctx.whenDays'], horizon: f['ctx.whenHorizon'] }
}

describe('разметка сроков', () => {
  it('у каждого срока есть род и всё, что этому роду положено', () => {
    const all = terms()
    const kinds = new Set<WhenKind>()
    for (const [where, w] of all) {
      const at = `${where}: «${w.t}»`
      kinds.add(w.kind)
      if (w.kind === 'never' || w.kind === 'absurd') {
        expect(w.d, `${at}: нет срока — нет и числа`).toBeNull()
        expect([w.due, w.est, w.state, w.holiday, w.condition], at).toEqual([undefined, undefined, undefined, undefined, undefined])
      }
      if (w.kind === 'clear' || w.kind === 'dodge') expect(w.d !== null || w.due !== undefined, `${at}: ясный срок и увёртка без даты`).toBe(true)
      if (w.kind === 'event') expect(typeof w.est, `${at}: событие без оценки`).toBe('number')
      if (w.est !== undefined) expect(w.kind === 'event' || w.kind === 'dodge', `${at}: оценка не у события и не у увёртки`).toBe(true)
      if (w.state !== undefined) expect(w.kind, `${at}: состояние мира не у события`).toBe('event')
      if (w.kind === 'holiday') {
        expect(w.holiday, `${at}: праздник без даты в календаре`).toBeDefined()
        const days = holidayDays(w.holiday!, 200)
        expect(days >= 0 && days <= MAX_AHEAD, at).toBe(true)
      } else expect(w.holiday, `${at}: ссылка на календарь не у праздника`).toBeUndefined()
    }
    expect([...kinds].sort()).toEqual(['absurd', 'clear', 'dodge', 'event', 'holiday', 'never'])
    expect(all.length, 'сроков в пулах и легендах меньше известных — проверка пустеет').toBeGreaterThanOrEqual(89)
  })

  it('три абсурда с числом больше не числятся датой: в журнале они «когда-нибудь» (цена из документа)', () => {
    for (const t of ['в следующем веке, в начале', 'как только археологи закончат', 'после реставрации Гарни']) {
      const w = byText(t)
      expect([w.kind, w.d], t).toEqual(['absurd', null])
    }
  })

  it('отопление и снег в горах — «никогда»; абрикосы остаются сезоном', () => {
    for (const t of ['как отопление дадут', 'как снег в горах сойдёт']) {
      expect(byText(t), t).toMatchObject({ d: null, kind: 'never' })
      expect(byText(t).holiday, t).toBeUndefined()
    }
    expect(byText('как только абрикосы созреют')).toMatchObject({ d: null, kind: 'holiday', holiday: 'apricots' })
  })

  it('срок легенды — событие своей легенды с оценкой; у свадеб — идущее состояние', () => {
    for (const [id, l] of Object.entries(LEGENDS)) expect(l.until.kind, id).toBe('event')
    expect(LEGENDS.boris_wedding.until.state).toEqual({ key: wedding('boris') })
    expect(LEGENDS.wedding.until.state).toEqual({ key: wedding('samvel') })
    expect(LEGENDS.crane_wedding.until.state).toEqual({ key: wedding('razmik') })
  })
})

describe('календарь праздников и сезонов', () => {
  it('Пасха и Вардавар по годам партии, сезоны по датам; сказанный в разные дни — разная даль', () => {
    const easter26 = dayOf(2026, 4, 5)
    expect(holidayDays('easter', easter26)).toBe(0)
    expect(holidayDays('easter', easter26 - 3)).toBe(3)
    expect(holidayDays('easter', easter26 + 1)).toBe(dayOf(2027, 3, 28) - (easter26 + 1)) // 2027-й: 28 марта
    expect(holidayDays('vardavar', dayOf(2026, 7, 12))).toBe(0) // Пасха + 98
    expect(holidayDays('navasard', dayOf(2026, 8, 1))).toBe(10)
    expect(holidayDays('navasard', dayOf(2026, 8, 12))).toBeGreaterThan(300)
    const seasons: Array<[HolidayRef, number, number]> = [['winter', 12, 1], ['apricots', 7, 1]]
    for (const [ref, m, d] of seasons) expect(holidayDays(ref, dayOf(2027, m, d) - 10), ref).toBe(10)
  })

  it('каждая ссылка отвечает на любой день партии числом от 0 до года с запасом на переходящие даты', () => {
    const refs: HolidayRef[] = ['navasard', 'vardavar', 'easter', 'winter', 'apricots']
    for (const ref of refs) for (let day = 150; day < 150 + 800; day += 7) {
      const n = holidayDays(ref, day)
      expect(n >= 0 && n <= MAX_AHEAD, `${ref} / день ${day}: ${n}`).toBe(true)
    }
  })
})

describe('факты контекста: род и горизонт', () => {
  it('каждый срок из пулов и легенд ложится на доску родом; горизонт есть везде, кроме «никогда» и абсурда', async () => {
    const all = terms()
    for (const [where, w] of all) {
      const g = await said(w)
      const c = ctx(g)
      const none = w.kind === 'never' || w.kind === 'absurd'
      expect(c.kind, `${where}: «${w.t}»`).toBe(w.kind)
      expect(c.days === undefined, `${where}: «${w.t}» — горизонт ${String(c.days)}`).toBe(none)
      expect(c.horizon === undefined, where).toBe(none)
    }
  })

  it('горизонт считается по источнику: дата, поздняя дата увёртки, оценка события, календарь', async () => {
    const g1 = await said(byText('завтра'))
    expect(ctx(g1)).toEqual({ kind: 'clear', days: 1, horizon: 'near' })

    const wed = await said(byText('в среду утром'))
    expect(ctx(wed).days).toBe(dueIn({ weekday: 3 }, wed.S.day))

    const dodge = await said(byText('в пятницу, край — в понедельник'))
    expect(ctx(dodge).days).toBe(dueIn({ weekday: 5, plus: 3 }, dodge.S.day)) // поздняя из двух дат

    const nextWeek = await said(byText('на следующей неделе, в начале или в конце'))
    expect(ctx(nextWeek)).toEqual({ kind: 'dodge', days: 13, horizon: 'far' }) // поздняя дата — оценка, а не d: 7

    const decree = await said(byText('как Нуне из декрета выйдет'))
    expect(ctx(decree)).toEqual({ kind: 'event', days: 540, horizon: 'veryFar' })

    const nav = await said(byText('после Навасарда'))
    expect(ctx(nav).days).toBe(holidayDays('navasard', nav.S.day))
    const later = await said(byText('после Навасарда'), (g) => { g.S.day += 30 })
    expect(ctx(later).days).not.toBe(ctx(nav).days) // тот же праздник в другой день партии — другая даль
    expect(ctx(later).days).toBe(holidayDays('navasard', later.S.day))
  })

  it.each([[7, 'near'], [8, 'far'], [30, 'far'], [31, 'veryFar']] as const)('порог: срок через %i дн. — %s', async (n, horizon) => {
    const g = await said({ t: `через ${n}`, d: n, kind: 'clear' })
    expect(ctx(g)).toEqual({ kind: 'clear', days: n, horizon })
  })

  it('горизонт считается от текущего дня: с ходом партии срок приближается', async () => {
    const g = await said({ t: 'через десять дней', d: 10, kind: 'clear' })
    expect(ctx(g).days).toBe(10)
    g.S.day += 4
    expect(ctx(g)).toEqual({ kind: 'clear', days: 6, horizon: 'near' })
  })

  it('событие с идущим состоянием мира — остаток срока, а не оценка', async () => {
    const term = byText('сразу после свадьбы')
    const running = await said(term, (g) => { g.rules.applyOps([{ key: wedding('samvel'), op: '=', value: true, forDays: 8, scope: 'world' }], {}) })
    expect(ctx(running).days).toBe(8)
    running.S.day += 2
    expect(ctx(running).days).toBe(6) // свадьба идёт — срок сжимается
    expect(ctx(await said(term)).days).toBe(7) // свадьбы нет — оценка автора

    const sickBoris = await said(byText('как баран поправится'), (g) => { g.rules.applyOps([{ key: sick, op: '=', value: true, forDays: 10, scope: 'target' }], { target: 'boris' }) })
    expect(ctx(sickBoris).days).toBe(10)
  })

  it('срок легенды: настоящий setLegend и клятва → род, оценка и остаток свадьбы', async () => {
    const { game } = makeGame()
    game.setLegend('safe_nune', 'nune')
    await game.promiseLine(undefined, true)
    expect(ctx(game)).toEqual({ kind: 'event', days: 540, horizon: 'veryFar' })

    const wed = makeGame().game
    wed.S.arcs.boris = { i: 5, last: -99 }
    await wed.playArc('boris') // «Свадьба Бориса!»: состояние на 5 дней, легенда boris_wedding
    wed.nextDay(2)
    await wed.promiseLine(undefined, true)
    expect(wed.S.promises.at(-1)!.t).toContain(LEGENDS.boris_wedding.until.t)
    expect(ctx(wed)).toEqual({ kind: 'event', days: 3, horizon: 'near' }) // остаток свадьбы, а не оценка 5
  })

  it('правка «завтра» → «завтрашней весной» пишет срок рода «никогда» без горизонта', async () => {
    const { game } = makeGame()
    const m = game.push({ kind: 'text', from: 'alik', text: 'В среду утром — всё отдам.' })
    const p: When & { text: string } = { text: 'в среду утром — всё отдам', t: 'в среду утром', d: 3, kind: 'clear' }
    game.recordPromise(p)
    game.S.ctx = game.ctxFromPromise(p)
    expect(ctx(game).kind).toBe('clear')
    await game.editLast(m, p)
    expect(ctx(game)).toEqual({ kind: 'never', days: undefined, horizon: undefined })
  })

  it('ctx.whenDate — дата срока, и только у ясного срока и увёртки', async () => {
    const day = (await said(byText('завтра'))).S.day
    expect((await said(byText('завтра'))).facts()['ctx.whenDate']).toBe(fmtDayMonth(day + 1))
    const dodge = await said(byText('в пятницу, край — в понедельник'))
    expect(dodge.facts()['ctx.whenDate']).toBe(fmtDayMonth(dodge.S.day + dueIn({ weekday: 5, plus: 3 }, dodge.S.day))) // поздняя из двух дат
    for (const t of ['после Навасарда', 'как Нуне из декрета выйдет', 'когда рак на Арагаце свистнет', 'в следующем веке, в начале']) {
      expect((await said(byText(t))).facts()['ctx.whenDate'], t).toBeUndefined()
    }
  })
})
