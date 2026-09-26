// Кнопки игрока на срок обещания по роду и горизонту (docs/design/deadline-replies.md, MVP 2, #164): пулы, матрица по всем срокам, дата срока.
import { describe, it, expect, vi } from 'vitest'
import { makeGame } from '../test/helpers'
import { D, type When } from './excuses'
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
    for (const k of Object.keys(D).filter((x) => x.startsWith('P_WHEN'))) for (const s of pool(k)) expect(s, `${k}: ${s}`).not.toMatch(/с \{date\}/)
  })

  it('дата и дни стоят только там, где есть факт: {date} — у пула с датой, {days} — у далёких', () => {
    for (const s of pool('P_WHEN_OK')) expect(s).toContain('{date}')
    for (const k of ['P_WHEN', 'P_WHEN_OK_EVENT', 'P_WHEN_PENCIL', 'P_WHEN_FAR', 'P_WHEN_NEVER']) for (const s of pool(k)) expect(s, `${k}: ${s}`).not.toContain('{date}')
    for (const k of ['P_WHEN_PENCIL', 'P_WHEN_FAR']) for (const s of pool(k)) expect(s, `${k}: ${s}`).toContain('{days}')
    for (const k of ['P_WHEN', 'P_WHEN_OK', 'P_WHEN_OK_EVENT', 'P_WHEN_NEVER']) for (const s of pool(k)) expect(s, `${k}: ${s}`).not.toContain('{days}')
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
    const far = await said(byText('как Нуне из декрета выйдет'))
    for (const x of buttons(far)) expect(x.text, x.text).toContain('540 дней')
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
        : f['ctx.whenHorizon'] === 'near' ? ['Opt_WhenCheck', 'Opt_WhenOk']
        : f['ctx.whenHorizon'] === 'far' ? ['Opt_WhenPencil'] : ['Opt_WhenFar']
      expect(names, at).toEqual(expected)
      // дальше недели «принять всерьёз» не собирается ни при каком сроке
      if (f['ctx.whenHorizon'] === 'far' || f['ctx.whenHorizon'] === 'veryFar' || w.kind === 'never' || w.kind === 'absurd') expect(names, at).not.toContain('Opt_WhenOk')
      seen.add(expected.join('+'))
    }
    // не пустая проверка: сроки есть на каждом из четырёх горизонтов и у обоих родов без даты
    expect([...seen].sort()).toEqual(['Opt_WhenCheck+Opt_WhenOk', 'Opt_WhenFar', 'Opt_WhenPencil', 'Opt_When_absurd', 'Opt_When_never'])
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
      Opt_When_never: ['promiseNever'], Opt_When_absurd: ['promiseNever'],
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
      ['после футбола', ['P_WHEN_OK_EVENT', 'P_WHEN'], 'близкое событие'],
      ['как заказчик заплатит', ['P_WHEN_PENCIL'], 'далёкий: 30 дней'],
      ['как Нуне из декрета выйдет', ['P_WHEN_FAR'], 'очень далёкий'],
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
