// Род и горизонт срока: разметка всех сроков и факты контекста (docs/design/deadline-replies.md, #163). Кнопки и ответы Алика не меняются.
import { describe, it, expect, vi } from 'vitest'
import { alikTexts, makeGame } from '../test/helpers'
import { D, type When, type WhenKind } from './excuses'
import * as L from './life'
import { LEGENDS } from './legends'
import { holidayDays, type HolidayRef } from './holidays'
import { sick, wedding } from './memkeys'
import { valueOf, type Entry } from './fact'
import { dateOf, dueIn, fmtDayMonth, HANDOVER } from '../engine/time'
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
      if (w.kind === 'never' || w.kind === 'absurd' || w.kind === 'floating') {
        // срока в мире нет — числу неоткуда взяться; журналу обещаний оставлены d/condition (#571);
        // у плавающего (#1002) горизонт тоже не из мира — свои варианты вместо never-эха
        expect([w.due, w.est, w.state, w.holiday], `${at}: у срока без конца не осталось источника горизонта`).toEqual([undefined, undefined, undefined, undefined])
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
    expect([...kinds].sort()).toEqual(['absurd', 'clear', 'dodge', 'event', 'floating', 'holiday', 'never'])
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

  it('срок легенды: у события — конец в мире (оценка из реплики или остаток свадьбы), у бесконечного — «никогда»', () => {
    // свадьбы с концом — Борис и Размик; свадьба Самвела конца не имеет и в горизонт не идёт (#571)
    expect(LEGENDS.boris_wedding.until).toMatchObject({ kind: 'event', state: { key: wedding('boris') } })
    expect(LEGENDS.crane_wedding.until).toMatchObject({ kind: 'event', state: { key: wedding('razmik') } })
    expect(LEGENDS.wedding.until.kind).toBe('never')
  })
})

describe('календарь праздников и сезонов', () => {
  it('Пасха и Вардавар по годам партии, сезоны по датам; сказанный в разные дни — разная даль', () => {
    // Пасха григорианская (#861): 2026 — 5 апреля, 2027 — 28 марта, 2028 — 16 апреля
    // (календарь армянской церкви: западная дата, а не православная 12 апреля / 2 мая)
    const easter26 = dayOf(2026, 4, 5)
    expect(holidayDays('easter', easter26)).toBe(0)
    expect(holidayDays('easter', easter26 - 3)).toBe(3)
    expect(holidayDays('easter', easter26 + 1)).toBe(dayOf(2027, 3, 28) - (easter26 + 1)) // 2027-й: 28 марта
    expect(holidayDays('easter', dayOf(2028, 4, 16)), '2028-й').toBe(0)
    expect(holidayDays('easter', dayOf(2027, 5, 2)), 'юлианская (православная) дата 2027-го').toBeGreaterThan(30)
    expect(holidayDays('vardavar', dayOf(2026, 7, 12))).toBe(0) // Пасха + 98: 12 июля 2026
    expect(holidayDays('vardavar', dayOf(2027, 7, 4))).toBe(0) // реальный Вардавар 2027
    expect(holidayDays('navasard', dayOf(2026, 8, 1))).toBe(10)
    expect(holidayDays('navasard', dayOf(2026, 8, 12))).toBeGreaterThan(300)
    const seasons: Array<[HolidayRef, number, number]> = [['winter', 12, 1], ['apricots', 7, 1]]
    for (const [ref, m, d] of seasons) expect(holidayDays(ref, dayOf(2027, m, d) - 10), ref).toBe(10)
  })

  it('полнолуние — реальная дата астрономического календаря, а не оценка «через две недели» (#861)', () => {
    // 15 мая 2027: ближайшее полнолуние — 20 мая, а не «через 13 дней»
    expect(holidayDays('fullmoon', dayOf(2027, 5, 15))).toBe(5)
    expect(holidayDays('fullmoon', dayOf(2027, 5, 20))).toBe(0)
    expect(holidayDays('fullmoon', dayOf(2027, 5, 21))).toBe(dayOf(2027, 6, 19) - dayOf(2027, 5, 21))
    // полнолуния 2027-го (астрономический календарь, даты по UTC): все двенадцать — по дням партии
    const moons: Array<[number, number]> = [[1, 22], [2, 20], [3, 22], [4, 20], [5, 20], [6, 19], [7, 18], [8, 17], [9, 15], [10, 15], [11, 14], [12, 13]]
    for (const [m, d] of moons) expect(holidayDays('fullmoon', dayOf(2027, m, d)), `${d}.${String(m).padStart(2, '0')}.2027`).toBe(0)
  })

  it('каждая ссылка отвечает на любой день партии числом от 0 до года с запасом на переходящие даты', () => {
    const refs: HolidayRef[] = ['navasard', 'vardavar', 'easter', 'winter', 'apricots', 'fullmoon']
    for (const ref of refs) for (let day = 150; day < 150 + 800; day += 7) {
      const n = holidayDays(ref, day)
      expect(n >= 0 && n <= MAX_AHEAD, `${ref} / день ${day}: ${n}`).toBe(true)
    }
  })
})

describe('факты контекста: род и горизонт', () => {
  it('каждый срок из пулов и легенд ложится на доску родом; горизонт есть везде, кроме «никогда», абсурда и плавающего', async () => {
    const all = terms()
    for (const [where, w] of all) {
      const g = await said(w)
      const c = ctx(g)
      const none = w.kind === 'never' || w.kind === 'absurd' || w.kind === 'floating'
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
    // конец следующей недели — по дню недели, а не постоянной оценкой: у пятничного обещания это 9, не 13 (#809)
    expect(ctx(nextWeek)).toEqual({ kind: 'dodge', days: dueIn({ week: true, next: true }, nextWeek.S.day), horizon: 'far' })

    const moon = await said(byText('после полнолуния'))
    // полнолуние — календарь, а не оценка «через две недели» (#861): даль — по реальной дате
    expect(ctx(moon).kind).toBe('holiday')
    expect(ctx(moon).days).toBe(holidayDays('fullmoon', moon.S.day))

    // срок без конца в мире (кран) горизонт не даёт вовсе: кнопка — ирония из «никогда» (#571)
    expect(ctx(await said(byText('как Размик с крана слезет')))).toEqual({ kind: 'never', days: undefined, horizon: undefined })

    const nav = await said(byText('после Навасарда'))
    expect(ctx(nav).days).toBe(holidayDays('navasard', nav.S.day))
    const later = await said(byText('после Навасарда'), (g) => { g.S.day += 30 })
    expect(ctx(later).days).not.toBe(ctx(nav).days) // тот же праздник в другой день партии — другая даль
    expect(ctx(later).days).toBe(holidayDays('navasard', later.S.day))
  })

  it('«на следующей неделе»: счётчик не перелезает конец следующей недели (#809)', async () => {
    const term = byText('на следующей неделе, в начале или в конце')
    // пятница 16.10.2026: до конца следующей недели 9 дней, до её начала (понедельник) — 3
    const friday = dayOf(2026, 10, 16)
    expect(dateOf(friday).getDay(), 'день теста — не пятница').toBe(5)
    const days = ctx(await said(term, (g) => { g.S.day = friday })).days!
    expect(days, `счётчик ${days} перелез за конец следующей недели`).toBeLessThanOrEqual(9)
    expect(days, `счётчик ${days} не дотянул до начала следующей недели`).toBeGreaterThan(3)
    // воскресенье 18.10.2026: «следующая неделя» кончается ближайшим воскресеньем — через 7 дней
    const sunday = dayOf(2026, 10, 18)
    expect(dateOf(sunday).getDay(), 'день теста — не воскресенье').toBe(0)
    expect(ctx(await said(term, (g) => { g.S.day = sunday })).days).toBe(7)
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

  it('generic «сразу после свадьбы» помнит только свадьбы с концом — Борис и Размик; свадьба Самвела горизонта не даёт', async () => {
    const term = byText('сразу после свадьбы')
    const running = await said(term, (g) => { g.rules.applyOps([{ key: wedding('boris'), op: '=', value: true, forDays: 8, scope: 'world' }], {}) })
    expect(ctx(running).days).toBe(8)
    running.S.day += 2
    expect(ctx(running).days).toBe(6) // свадьба идёт — срок сжимается
    expect(ctx(await said(term)).days).toBe(7) // свадьбы нет — оценка автора
    // свадьба Самвела конца не имеет: общий срок её не берёт, горизонт — оценка, а не 8 дней (#571)
    const samvel = await said(term, (g) => { g.rules.applyOps([{ key: wedding('samvel'), op: '=', value: true, forDays: 8, scope: 'world' }], {}) })
    expect(ctx(samvel).days).toBe(7)

    const sickBoris = await said(byText('как баран поправится'), (g) => { g.rules.applyOps([{ key: sick, op: '=', value: true, forDays: 10, scope: 'target' }], { target: 'boris' }) })
    expect(ctx(sickBoris).days).toBe(10)
  })

  it('фраза-срок про свадьбу звучит только пока свадьба идёт (#882)', () => {
    const pool = (g: Game) => g.open(D.WHEN as Entry<When>[]).map((w) => w.t)
    const { game } = makeGame()
    expect(pool(game), 'свадьбы нет — фразы нет').not.toContain('сразу после свадьбы')
    expect(pool(game), 'свадьбы нет — фразы нет').not.toContain('как свадьба закончится')
    // живая свадьба Бориса открывает свою формулировку и не открывает чужую
    game.rules.applyOps([{ key: wedding('boris'), op: '=', value: true, forDays: 8, scope: 'world' }], {})
    expect(pool(game)).toContain('сразу после свадьбы')
    expect(pool(game), 'свадьба Размика — своя фраза').not.toContain('как свадьба закончится')
    // и наоборот: свадьба Размика
    const { game: razmik } = makeGame()
    razmik.rules.applyOps([{ key: wedding('razmik'), op: '=', value: true, forDays: 8, scope: 'world' }], {})
    expect(pool(razmik)).toContain('как свадьба закончится')
    expect(pool(razmik)).not.toContain('сразу после свадьбы')
    // свадьба Самвела конца не имеет: общий срок её не берёт и фраз не открывает (#571)
    const { game: samvel } = makeGame()
    samvel.rules.applyOps([{ key: wedding('samvel'), op: '=', value: true, forDays: 8, scope: 'world' }], {})
    expect(pool(samvel)).not.toContain('сразу после свадьбы')
    expect(pool(samvel)).not.toContain('как свадьба закончится')
  })

  it('срок легенды: настоящий setLegend и клятва → род, оценка и остаток свадьбы', async () => {
    const { game } = makeGame()
    game.setLegend('boris_receipts', 'nune')
    await game.promiseLine(undefined, true)
    expect(ctx(game)).toEqual({ kind: 'event', days: 3, horizon: 'near' })

    const wed = makeGame().game
    wed.S.arcs.boris = { i: 5, last: -99 }
    await wed.playArc('boris') // «Свадьба Бориса!»: состояние на 5 дней, легенда boris_wedding
    wed.nextDay(2)
    await wed.promiseLine(undefined, true)
    expect(wed.S.promises.at(-1)!.t).toContain(LEGENDS.boris_wedding.until.t)
    expect(ctx(wed)).toEqual({ kind: 'event', days: 3, horizon: 'near' }) // остаток свадьбы, а не оценка 5
  })

  it('правка «завтра» пишет род из разметки термина: «завтрашней весной» — сезон с горизонтом (#923)', async () => {
    const { game } = makeGame()
    const m = game.push({ kind: 'text', from: 'alik', text: 'В среду утром — всё отдам.' })
    const p: When & { text: string } = { text: 'в среду утром — всё отдам', t: 'в среду утром', d: 3, kind: 'clear' }
    game.recordPromise(p)
    game.S.ctx = game.ctxFromPromise(p)
    expect(ctx(game).kind).toBe('clear')
    // рисуем конкретный термин: подменяем выбор пула правок
    const spring = (L.EDIT_WHEN as Entry<When>[]).map(valueOf).find((w) => w.t === 'завтрашней весной')!
    vi.spyOn(game, 'draw').mockImplementation(((key: string) => (key === 'EDIT_WHEN' ? spring : '')) as unknown as typeof game.draw)
    await game.editLast(m, p)
    expect(ctx(game)).toEqual({ kind: 'holiday', days: expect.any(Number), horizon: expect.any(String) })
    expect(ctx(game).days, 'горизонт по календарю весны есть').toBeGreaterThan(0)
    vi.restoreAllMocks()
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

describe('срок праздника ведёт календарь, а не статическая оценка пула (#1386)', () => {
  // 4 мая 2027: ближайшее полнолуние — 20 мая, то есть через 16 дней при `d: 15` в пуле
  const made = dayOf(2027, 5, 4)
  const moon = dayOf(2027, 5, 20)
  const term = (): When => byText('после полнолуния')
  const promiseText = 'после полнолуния — отдам'
  const about = (g: Game, from: number): string[] => alikTexts(g.S.msgs.slice(from)).filter((t) => t.includes('полнолуни'))

  it('карандаш, журнал и событие срока называют один день полнолуния', async () => {
    expect(term().d, 'оценка пула перестала расходиться с календарём — тест ничего не различает').toBe(15)
    expect(holidayDays('fullmoon', made), 'полнолуние не в 16 днях — тест ничего не различает').toBe(16)
    const g = await said(term(), (x) => { x.S.day = made })
    const rec = g.S.promises.at(-1)!
    expect(rec.due, 'журнал держит календарь, а не made + 15').toBe(moon)
    expect(rec.days, 'карандаш называет календарь').toBe(16)
    expect(g.S.rules.schedule.filter((s) => s.kind === 'event' && s.event === 'PromiseDue').at(-1), 'событие срока')
      .toMatchObject({ event: 'PromiseDue', at: moon })
    const i = g.S.promises.length - 1
    g.S.day = moon - 1
    expect(g.facts({ promise: i }).promiseLive, 'накануне полнолуния срок ещё не наступил').toBe(false)
    g.S.day = moon
    expect(g.facts({ promise: i }).promiseLive, 'в день полнолуния срок наступил').toBe(true)
  })

  it('«срок — сегодня» звучит в день полнолуния, а накануне — нет', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { game } = makeGame({ seed })
      vi.spyOn(game.X, 'promise').mockImplementation(() => ({ text: promiseText, ...term() }))
      game.S.day = made
      await game.promiseLine()
      game.S.day = moon - 1
      const eve = game.S.msgs.length
      await game.afterTurn()
      expect(about(game, eve), `сид ${seed}: срок прозвучал днём раньше полнолуния`).toEqual([])
      game.S.day = moon
      const day = game.S.msgs.length
      await game.afterTurn()
      if (about(game, day).length > 0) return
    }
    throw new Error('ни в одной из 12 партий срок не прозвучал в день полнолуния')
  })
})
