// Кнопки игрока на срок обещания по роду и горизонту (docs/design/deadline-replies.md, MVP 2, #164): пулы, матрица по всем срокам, дата срока.
import { describe, it, expect, vi } from 'vitest'
import { makeGame } from '../test/helpers'
import { D, WHEN_YEARS, type When } from './excuses'
import * as L from './life'
import { LEGENDS } from './legends'
import { valueOf, type Entry } from './fact'
import { test as holds } from '../engine/rules'
import { dueIn, fmtDayMonth, fmtDays } from '../engine/time'
import type { Game } from '../engine/game'

const POOLS = ['WHEN', 'WHEN1', 'WHEN2', 'WHEN3'] as const
const terms = (): Array<[string, When]> => [
  ...POOLS.flatMap((k) => (D[k] as Entry<When>[]).map((e): [string, When] => [`D.${k}`, valueOf(e)])),
  ...Object.entries(LEGENDS).map(([id, l]): [string, When] => [`LEGENDS.${id}`, l.until]),
]
const byText = (t: string): When => terms().map(([, w]) => w).find((w) => w.t === t)!
const pool = (k: string): string[] => (D[k] as Entry<string>[]).map(valueOf)
const MONTHS = /\d{1,2} (января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/
const SERIOUS = /Запомнил|Жду|Не подведите/i

/** Алик называет срок `w` настоящим путём клятвы; возвращает партию с фактами на доске. */
async function said(w: When): Promise<Game> {
  const { game } = makeGame()
  vi.spyOn(game.X, 'promise').mockImplementation(() => ({ text: `${w.t} — отдам`, ...w }))
  await game.promiseLine()
  return game
}

/** Правила кнопки срока, условия которых на доске выполнены. */
const matching = (g: Game) => {
  const facts = g.lineFacts()
  return g.rules.all.filter((r) => r.event === 'BuildChoices' && r.name.startsWith('Opt_When') && r.when.every((c) => holds(c, facts)))
}
/** Тексты, которые эти правила могут предложить: несколько розыгрышей каждого. */
const buttons = (g: Game, draws = 6) => matching(g).flatMap((r) => Array.from({ length: draws }, () => {
  const c = r.offer!(g.rules.ctx(g, r, { event: 'BuildChoices' }, g.facts()))
  return c ? [{ rule: r.name, act: c.act, text: c.text }] : []
}).flat())

/** Текст кнопки собран из этого пула: шаблон с подстановками; декор игрока (приставка) не мешает. */
const fromPool = (k: string, text: string): boolean =>
  pool(k).some((tpl) => new RegExp(tpl.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '.+')).test(text))

describe('пулы кнопок на срок', () => {
  it('в пуле «никогда» и абсурда нет «Запомнил / Жду / Не подведите»', () => {
    expect(pool('P_WHEN_NEVER').length).toBeGreaterThanOrEqual(3)
    for (const s of pool('P_WHEN_NEVER')) expect(s, s).not.toMatch(SERIOUS)
  })

  it('в пулах ясного и близкого срока нет «по-русски»; «— с {date}. Жду» ушло совсем', () => {
    for (const k of ['P_WHEN', 'P_WHEN_OK', 'P_WHEN_OK_EVENT', 'P_WHEN_PENCIL', 'P_WHEN_FAR']) {
      expect(pool(k).length, k).toBeGreaterThanOrEqual(3)
      for (const s of pool(k)) expect(s, `${k}: ${s}`).not.toMatch(/по-русски/i)
    }
    for (const k of ['P_WHEN_CALENDAR', 'P_WHEN_EVENT']) for (const s of pool(k)) expect(s, `${k}: ${s}`).not.toMatch(/по-русски/i)
    for (const k of Object.keys(D).filter((x) => x.startsWith('P_WHEN'))) for (const s of pool(k)) expect(s, `${k}: ${s}`).not.toMatch(/с \{date\}/)
  })

  it('дата и дни стоят только там, где есть факт: {date} — у пула с датой, {days} — у далёких', () => {
    for (const s of pool('P_WHEN_OK')) expect(s).toContain('{date}')
    for (const k of ['P_WHEN', 'P_WHEN_OK_EVENT', 'P_WHEN_PENCIL', 'P_WHEN_FAR', 'P_WHEN_NEVER', 'P_WHEN_CALENDAR', 'P_WHEN_EVENT']) for (const s of pool(k)) expect(s, `${k}: ${s}`).not.toContain('{date}')
    for (const k of ['P_WHEN_PENCIL', 'P_WHEN_FAR']) for (const s of pool(k)) expect(s, `${k}: ${s}`).toContain('{days}')
    for (const k of ['P_WHEN', 'P_WHEN_OK', 'P_WHEN_OK_EVENT', 'P_WHEN_NEVER', 'P_WHEN_CALENDAR', 'P_WHEN_EVENT']) for (const s of pool(k)) expect(s, `${k}: ${s}`).not.toContain('{days}')
  })
})

describe('число дней в кнопке — из факта, со склонением', () => {
  it.each([[1, '1 день'], [2, '2 дня'], [4, '4 дня'], [5, '5 дней'], [11, '11 дней'], [14, '14 дней'], [21, '21 день'], [22, '22 дня'], [25, '25 дней'], [101, '101 день'], [112, '112 дней']] as const)('%i → %s', (n, s) => {
    expect(fmtDays(n)).toBe(s)
  })

  it('кнопка на далёкий срок называет дни из факта ctx.whenDays', async () => {
    const g = await said({ t: 'через три недели', d: 21, kind: 'clear' })
    const b = buttons(g)
    expect(b.length).toBeGreaterThan(0)
    for (const x of b) expect(x.text, x.text).toContain('21 день')
    const far = await said(byText('после полнолуния'))
    // полнолуние — календарь (#861): число в кнопке — из реальной даты, а не из оценки 15
    const moonDays = fmtDays(Number(far.facts()['ctx.whenDays'] ?? -1))
    for (const x of buttons(far)) expect(x.text, x.text).toContain(moonDays)
  })
})

describe('матрица: кнопка по роду и горизонту — все сроки всех пулов и легенд', () => {
  it('какие правила собираются: близко — принять или переспросить, далеко — «карандашом», очень далеко — разоблачить, «никогда» и абсурд — ирония', async () => {
    const all = terms()
    const seen = new Set<string>()
    for (const [where, w] of all) {
      const g = await said(w)
      const f = g.facts()
      const names = matching(g).map((r) => r.name).sort()
      const at = `${where}: «${w.t}» (${String(f['ctx.whenKind'])}, ${String(f['ctx.whenHorizon'])})`
      const expected = w.kind === 'never' || w.kind === 'absurd' ? [`Opt_When_${w.kind}`]
        : w.kind === 'floating' ? ['Opt_When_Floating'] // плавающий событийный срок (#1002) — своя кнопка
        : f['ctx.whenHorizon'] === 'near' ? ['Opt_WhenCheck', 'Opt_WhenOk']
        : f['ctx.whenHorizon'] === 'far' ? ['Opt_WhenPencil'] : ['Opt_WhenFar']
      expect(names, at).toEqual(expected)
      // дальше недели «принять всерьёз» не собирается ни при каком сроке
      if (f['ctx.whenHorizon'] === 'far' || f['ctx.whenHorizon'] === 'veryFar' || w.kind === 'never' || w.kind === 'absurd' || w.kind === 'floating') expect(names, at).not.toContain('Opt_WhenOk')
      seen.add(expected.join('+'))
    }
    // не пустая проверка: сроки есть на каждом из четырёх горизонтов и у обоих родов без даты
    expect([...seen].sort()).toEqual(['Opt_WhenCheck+Opt_WhenOk', 'Opt_WhenFar', 'Opt_WhenPencil', 'Opt_When_Floating', 'Opt_When_absurd', 'Opt_When_never'])
  })

  it('тексты кнопок: без «Запомнил» у «никогда» и абсурда, без «по-русски» у ясного срока, дата — только у ясного срока и увёртки', async () => {
    let checked = 0
    for (const [where, w] of terms()) {
      const g = await said(w)
      for (const b of buttons(g)) {
        const at = `${where}: «${w.t}» → ${b.rule}: ${b.text}`
        checked++
        expect(b.text, at).not.toMatch(/\{|\}|\(\)/)
        if (w.kind === 'never' || w.kind === 'absurd') expect(b.text, at).not.toMatch(SERIOUS)
        if (w.kind === 'clear') expect(b.text, at).not.toMatch(/по-русски/i)
        const dated = w.kind === 'clear' || w.kind === 'dodge'
        // пул с датой — у ясного срока и увёртки и только там: без факта даты получилась бы пустая
        if (b.rule === 'Opt_WhenOk') {
          expect(fromPool('P_WHEN_OK', b.text), at).toBe(dated)
          expect(fromPool('P_WHEN_OK_EVENT', b.text), at).toBe(!dated)
        }
        if (dated) continue
        expect(b.text, `${at}: у этого рода даты в кнопке нет`).not.toMatch(MONTHS)
      }
    }
    expect(checked, 'кнопок в матрице меньше известных — проверка пустеет').toBeGreaterThan(400)
  })

  it('у каждой кнопки срока свой акт, и он не совпадает с актом согласия, если кнопка — не согласие', async () => {
    const acts: Record<string, Set<string>> = {}
    for (const [, w] of terms()) for (const b of buttons(await said(w), 2)) (acts[b.rule] ??= new Set()).add(String(b.act))
    expect(Object.fromEntries(Object.entries(acts).map(([rule, a]) => [rule, [...a]]))).toEqual({
      Opt_WhenOk: ['promiseOk'], Opt_WhenCheck: ['promiseCheck'], Opt_WhenPencil: ['promisePencil'], Opt_WhenFar: ['promiseFar'],
      Opt_When_never: ['promiseNever'], Opt_When_absurd: ['promiseNever'], Opt_When_Floating: ['promiseCheck'],
    })
  })
})

describe('дата в кнопке — срок, а не день обещания', () => {
  it('«завтра» и «в среду утром»: в кнопке дата срока', async () => {
    const tomorrow = await said(byText('завтра'))
    const day = tomorrow.S.day
    const ok = buttons(tomorrow, 12).filter((b) => b.rule === 'Opt_WhenOk')
    expect(ok.length).toBeGreaterThan(0)
    for (const b of ok) {
      expect(b.text, b.text).toContain(fmtDayMonth(day + 1))
      expect(b.text, b.text).not.toContain(fmtDayMonth(day))
    }
    const wed = await said(byText('в среду утром'))
    const due = wed.S.day + dueIn({ weekday: 3 }, wed.S.day)
    for (const b of buttons(wed, 12).filter((x) => x.rule === 'Opt_WhenOk')) expect(b.text, b.text).toContain(fmtDayMonth(due))
  })

  it('событие и праздник на близком горизонте — кнопка «принять» без даты', async () => {
    const soon = await said(byText('после футбола')) // событие, оценка 1 день
    const ok = buttons(soon, 12).filter((b) => b.rule === 'Opt_WhenOk')
    expect(ok.length).toBeGreaterThan(0)
    for (const b of ok) expect(b.text, b.text).not.toMatch(MONTHS)
    expect(soon.facts()['ctx.whenDate']).toBeUndefined()
  })
})

/** Тексты кнопок срока, которые buildChoices реально показывает. */
async function shownWhen(w: When, tune?: (g: Game) => void, n = 80): Promise<string[]> {
  const g = await said(w)
  tune?.(g)
  const shown = new Set<string>()
  for (let i = 0; i < n; i++) {
    g.S.choices = null
    for (const c of g.buildChoices()) if (c.act?.startsWith('promise')) shown.add(c.text)
  }
  expect(shown.size, w.t).toBeGreaterThan(0)
  return [...shown]
}

describe('риторика по роду: календарь — праздник, событие — «при чём», «никогда» — без календаря', () => {
  it('в пуле «никогда» нет календаря и хвоста «Это ответ.»; «Лет двадцать?» — строка игрока', () => {
    for (const s of pool('P_WHEN_NEVER')) {
      expect(s, s).not.toMatch(/календарь/i)
      expect(s, s).not.toMatch(/Это ответ\./)
    }
    expect(pool('P_WHEN_NEVER')).toContain(WHEN_YEARS)
    expect(pool('P_WHEN_CALENDAR').join(' ')).toMatch(/календарь/i)
    expect(pool('P_WHEN_EVENT').join(' ')).toMatch(/при чём/i)
    expect(pool('P_WHEN_EVENT').join(' ')).not.toMatch(/календарь/i)
  })

  it('срок-событие и «никогда» не предлагают календарь; близкий праздник — предлагает', async () => {
    for (const term of ['после футбола', 'как Гарика достанем', 'после таможни', 'когда рак на Арагаце свистнет']) {
      for (const text of await shownWhen(byText(term))) expect(text, `${term}: ${text}`).not.toMatch(/календарь/i)
    }
    const event = await shownWhen(byText('после футбола'))
    expect(event.some((t) => /при чём тут/i.test(t)), event.join(' | ')).toBe(true)
    const holiday = await shownWhen(byText('после Навасарда'), (g) => {
      const at = g.S.ctx?.whenAt
      expect(at, 'у праздника нет дня горизонта').toEqual(expect.any(Number))
      g.S.day = at! - 3
      expect(g.facts()['ctx.whenKind']).toBe('holiday')
      expect(g.facts()['ctx.whenHorizon']).toBe('near')
    })
    expect(holiday.some((t) => /календарь/i.test(t)), holiday.join(' | ')).toBe(true)
  })

  it('«как ключ выйдет» — шутка про малыша, не «когда-нибудь» и не МЧС', async () => {
    const tune = (g: Game) => {
      g.recordPromise({ text: 'когда-нибудь', d: null })
      g.recordPromise({ text: 'потом', d: null })
      expect(g.facts().somedayCount).toBeGreaterThanOrEqual(2)
    }
    const texts = await shownWhen(byText('как ключ выйдет'), tune)
    expect(texts.some((t) => /малыша ключом вниз/.test(t)), texts.join(' | ')).toBe(true)
    for (const text of texts) {
      expect(text, text).not.toMatch(/когда-нибудь/)
      expect(text, text).not.toMatch(/МЧС/)
      expect(text, text).not.toMatch(/календарь/i)
    }
  })
})

describe('игрок видит кнопки настоящим путём', () => {
  it.each(['как отопление дадут', 'как снег в горах сойдёт'])('«%s» → только ирония из пула «никогда»', async (term) => {
    const g = await said(byText(term))
    const shown = new Map<string, string>()
    for (let i = 0; i < 60; i++) {
      g.S.choices = null
      for (const c of g.buildChoices()) if (c.act?.startsWith('promise')) shown.set(c.text, c.act)
    }
    expect(shown.size).toBeGreaterThan(0)
    for (const [text, act] of shown) {
      expect(act, text).toBe('promiseNever')
      expect(fromPool('P_WHEN_NEVER', text), text).toBe(true)
      expect(text, text).not.toMatch(SERIOUS)
    }
  })

  it('Алик называет срок → в слоте «срок» кнопки только из пулов, что положены роду и горизонту', async () => {
    const cases: Array<[string, string[], string]> = [
      ['завтра', ['P_WHEN_OK', 'P_WHEN'], 'близкий ясный срок'],
      ['после футбола', ['P_WHEN_OK_EVENT', 'P_WHEN_EVENT'], 'близкое событие'],
      ['после полнолуния', ['P_WHEN_PENCIL'], 'далёкий: 15 дней'],
      ['до Нового года', ['P_WHEN_FAR'], 'очень далёкий'],
      ['когда рак на Арагаце свистнет', ['P_WHEN_NEVER'], '«никогда»'],
      ['в следующем веке, в начале', ['P_WHEN_NEVER'], 'абсурд'],
    ]
    for (const [t, pools, what] of cases) {
      const g = await said(byText(t))
      const shown = new Set<string>()
      for (let i = 0; i < 60; i++) {
        g.S.choices = null
        for (const c of g.buildChoices()) if (c.act?.startsWith('promise')) shown.add(c.text)
      }
      expect(shown.size, what).toBeGreaterThan(0)
      for (const text of shown) expect(pools.some((k) => fromPool(k, text)), `${what}: ${text}`).toBe(true)
    }
  })
})

describe('плавающий срок: «разбудить» дышит спящим (#1025)', () => {
  const line = 'Вот это хотя бы срок. Разбудить его можно?'
  it('на «после приёмки» будить некого, на «проснётся» строка предлагается', async () => {
    expect(pool('P_WHEN_FLOATING'), 'строка ушла из пула — проверка пустеет').toContain(line)
    const awake = await said(byText('после приёмки второго этажа'))
    expect(awake.facts()['ctx.whenKind'], 'срок не плавающий — проверка не про то').toBe('floating')
    expect(awake.open(D.P_WHEN_FLOATING), 'на приёмке «разбудить» предлагается').not.toContain(line)
    const sleeping = await said(byText('как дядя Самвел проснётся'))
    expect(sleeping.open(D.P_WHEN_FLOATING), 'на «проснётся» строки нет').toContain(line)
  })
})

describe('правки обещаний: род у каждого термина EDIT_WHEN (#923)', () => {
  const editTerms = (): When[] => (L.EDIT_WHEN as Entry<When>[]).map(valueOf)

  it('у каждого термина правки есть род; «в следующем году» — ясный срок на 1 января', () => {
    for (const w of editTerms()) expect(typeof w.kind, w.t).toBe('string')
    const year = editTerms().find((w) => w.t === 'в следующем году')!
    expect(year.kind, 'следующий год — наступающая дата, а не «никогда»').toBe('clear')
    expect(year.due, 'горизонт — 1 января следующего года').toEqual({ newYear: true })
    expect(editTerms().find((w) => w.t === 'когда-нибудь')!.kind).toBe('never')
    expect(editTerms().find((w) => w.t === 'после следующей свадьбы')!.kind).toBe('event')
  })

  it('«в будущем. Не уточняю» — срок без числа: ни карандаша, ни напоминания с днями (#1025)', async () => {
    const vague = editTerms().find((w) => w.t === 'в будущем. Не уточняю')!
    expect(['never', 'dodge'], 'род без числа').toContain(vague.kind)
    expect(vague.d, 'числа у срока нет').toBeNull()
    expect(vague.est, 'оценка не выдумывается').toBeUndefined()
    const { game } = makeGame({ seed: 1 })
    const p: When & { text: string } = { text: 'в будущем. Не уточняю', ...vague }
    game.recordPromise(p)
    expect(game.S.promises.at(-1)!.due, 'журнал не строит дату').toBeNull()
    game.S.ctx = game.ctxFromPromise(p)
    const f = game.facts()
    expect(f['ctx.whenDays'], 'горизонта в днях нет').toBeUndefined()
    expect(f['ctx.whenHorizon'], 'даль не строится').toBeUndefined()
    const texts: string[] = []
    for (let i = 0; i < 30; i++) { game.S.choices = null; for (const c of game.buildChoices()) texts.push(c.text) }
    expect(texts.filter((t) => /\d+ (день|дня|дней)/.test(t)), `дни не выдумываются: ${texts.join(' | ')}`).toEqual([])
  })

  it('после правки род на доске, и на «в следующем году» риторика «никогда» не собирается', async () => {
    const year = editTerms().find((w) => w.t === 'в следующем году')!
    const neverPhrases = [/по-русски это «никогда»/, /это не срок/, new RegExp(WHEN_YEARS)]
    let drawn = 0
    for (let seed = 1; seed <= 48 && drawn < 3; seed++) {
      const { game } = makeGame({ seed })
      const m = game.push({ kind: 'text', from: 'alik', text: 'В среду утром — всё отдам.' })
      const p: When & { text: string } = { text: 'в среду утром — всё отдам', t: 'в среду утром', d: 3, kind: 'clear' }
      game.recordPromise(p)
      game.S.ctx = game.ctxFromPromise(p)
      await game.editLast(m, p)
      if (game.S.ctx?.when !== year.t) continue
      drawn++
      expect(game.S.ctx.whenKind, 'род правленого срока — из разметки').toBe('clear')
      expect(game.S.ctx.whenDue, 'дата срока на доске').not.toBeNull()
      const texts = game.buildChoices().map((c) => c.text)
      for (const re of neverPhrases) {
        expect(texts.some((t) => re.test(t)), `риторика «никогда» на ясном сроке: ${texts.join(' | ')}`).toBe(false)
      }
    }
    expect(drawn, 'термин был нарисован — проверка не пустая').toBeGreaterThan(0)
  })
})

describe('колёсное обещание «Нивы» — легенд-специфичная риторика (#919)', () => {
  it('на «как новые колёса продадим» своя строка, генерик «никогда» закрыт', async () => {
    const g = await said({ t: 'как новые колёса продадим', d: null, kind: 'never' })
    const texts: string[] = []
    for (let i = 0; i < 20; i++) {
      g.S.choices = null
      for (const c of g.buildChoices()) if (c.act?.startsWith('promise')) texts.push(c.text)
    }
    expect(texts.length, 'кнопки срока строятся — проверка не пустая').toBeGreaterThan(0)
    expect(texts.some((t) => t.includes('сколько ещё колёс')), `своя риторика: ${texts.join(' | ')}`).toBe(true)
    expect(texts.filter((t) => /по-русски это «никогда»|это не срок/.test(t)), `генерик-never закрыт: ${texts.join(' | ')}`).toEqual([])
  })
})
