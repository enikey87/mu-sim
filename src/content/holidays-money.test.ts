// Деньги под праздником (#585, «После MVP» docs/design/holidays.md): в окне календаря у игрока
// есть кнопка про этот праздник и деньги, Алик отвечает пулом праздника; вне окна и в эндгейме кнопки нет.
import { describe, it, expect } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import { HOLIDAY_MONEY, P_HOLIDAY, holidayOf, type Holiday } from './holidays'
import { dateOf } from '../engine/time'
import { alikDead, blocked, endgame } from './memkeys'
import type { Game } from '../engine/game'

const NY = 289 // 1 января: окно Нового года
const M8 = 355 // 8 марта: окно 8 Марта
const PLAIN = 184 // обычный день

const optHoliday = (g: Game) => g.rules.collect({ event: 'BuildChoices' }, g.facts()).filter((r) => r.name === 'Opt_Holiday')
const holidayButton = (g: Game) => {
  const rules = optHoliday(g)
  if (rules.length === 0) return undefined
  return rules[0].offer!(g.rules.ctx(g, rules[0], { event: 'BuildChoices' }, g.facts()))
}

describe('деньги под праздником', () => {
  it('кнопка есть до праздника и она про свой праздник; в день, вне окна и в эндгейме — нет', () => {
    for (const [eve, feast, pool] of [[NY - 1, NY, P_HOLIDAY.newYear], [M8 - 1, M8, P_HOLIDAY.march8]] as const) {
      const { game } = makeGame()
      game.S.day = eve
      const rules = optHoliday(game)
      expect(rules, `канун ${eve}`).toHaveLength(1)
      expect(pool, `кнопка ${eve} — из пула праздника`).toContain(holidayButton(game)?.text)

      const { game: onDay } = makeGame()
      onDay.S.day = feast
      expect(holidayButton(onDay), `в день ${feast} слота нет`).toBeNull()

      const { game: plain } = makeGame()
      plain.S.day = PLAIN
      expect(optHoliday(plain), 'вне окна кнопки нет').toHaveLength(0)

      const { game: end } = makeGame()
      end.S.day = eve
      end.rules.applyOps([{ key: endgame.active, op: '=', value: true }], {})
      expect(optHoliday(end), 'в эндгейме кнопки нет').toHaveLength(0)

      for (const [what, key] of [['окно смерти', alikDead], ['блок', blocked]] as const) {
        const { game: quiet } = makeGame()
        quiet.S.day = eve
        quiet.rules.applyOps([{ key, op: '=', value: true }], {})
        expect(optHoliday(quiet), `в ${what} кнопки нет`).toHaveLength(0)
      }
    }
  })

  it('31 декабря «Новый год на носу» есть, 1–3 января слота нет (#828)', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 24; seed++) {
      const { game } = makeGame({ seed })
      game.S.day = NY - 1
      const buttons = game.buildChoices().map((c) => c.text)
      const hit = buttons.find((t) => P_HOLIDAY.newYear.some((p) => t.includes('Новый год на носу') || t.includes(p.slice(0, 16))))
      if (hit) seen.add(hit)
    }
    expect([...seen].some((t) => t.includes('Новый год на носу')), `канун: ${[...seen].join(' | ')}`).toBe(true)
    for (const day of [NY, NY + 1, NY + 2]) {
      const { game } = makeGame()
      game.S.day = day
      expect(holidayButton(game), `день ${day}`).toBeNull()
      expect(game.buildChoices().some((c) => /на носу/.test(c.text)), `путь игрока ${day}`).toBe(false)
    }
  })

  it('Алик отвечает пулом того праздника, который сейчас', async () => {
    for (const [day, holiday] of [[NY, 'newYear'], [M8, 'march8']] as const) {
      const { game } = makeGame({ seed: 5 })
      game.S.day = day
      // уместные строки — до ответа: сказанная строка из eligible уходит
      const pool = game.lines.eligible('HOLIDAY_MONEY', HOLIDAY_MONEY[holiday], game.lineFacts()).map((p) => p.text)
      expect(pool.length, 'в окне есть что ответить').toBeGreaterThan(0)
      const n = game.S.msgs.length
      await game.fire('PlayerSays', { intent: 'holiday' })
      const answer = alikTexts(game.S.msgs.slice(n)).join(' ')
      expect(pool.some((t) => answer.includes(t)), `ответ не из пула праздника: ${answer}`).toBe(true)
    }
  })

  it('Трндез и День строителя: кнопка про свой праздник, ответ из его пула', async () => {
    const dayOn = (year: number, month: number, dom: number) => {
      for (let day = 0; day < 900; day++) {
        const d = dateOf(day)
        if (d.getFullYear() === year && d.getMonth() + 1 === month && d.getDate() === dom) return day
      }
      throw new Error(`нет дня ${year}-${month}-${dom}`)
    }
    let builders = 0
    for (let day = 0; day < 900; day++) {
      const d = dateOf(day)
      if (d.getFullYear() === 2027 && d.getMonth() === 7 && d.getDay() === 0 && holidayOf(day) === 'builders') builders = day
    }
    expect(builders).toBeGreaterThan(0)
    for (const [eve, feast, button, holiday] of [
      [dayOn(2027, 2, 12), dayOn(2027, 2, 13), P_HOLIDAY.trndez, 'trndez'],
      [builders - 1, builders, P_HOLIDAY.builders, 'builders'],
    ] as const) {
      const { game } = makeGame({ seed: 5 })
      game.S.day = eve
      expect(optHoliday(game), `кнопка ${eve}`).toHaveLength(1)
      expect(button).toContain(holidayButton(game)?.text)
      const { game: onDay } = makeGame({ seed: 5 })
      onDay.S.day = feast
      expect(holidayButton(onDay), `в день ${feast} слота нет`).toBeNull()
      const pool = onDay.lines.eligible('HOLIDAY_MONEY', HOLIDAY_MONEY[holiday], onDay.lineFacts()).map((p) => p.text)
      expect(pool.length, `в окне ${feast} есть что ответить`).toBeGreaterThan(0)
      const n = onDay.S.msgs.length
      await onDay.fire('PlayerSays', { intent: 'holiday' })
      const answer = alikTexts(onDay.S.msgs.slice(n)).join(' ')
      expect(pool.some((t) => answer.includes(t)), answer).toBe(true)
    }
  })

  it('Трндез и День строителя: денежный ответ знает день окна', () => {
    const textsAt = (day: number) => {
      const { game } = makeGame()
      game.S.day = day
      const holiday = holidayOf(day) as Holiday
      return game.lines.eligible('HOLIDAY_MONEY', HOLIDAY_MONEY[holiday], game.lineFacts()).map((p) => p.text).join(' ')
    }
    const feb = (dom: number) => {
      for (let day = 0; day < 900; day++) {
        const d = dateOf(day)
        if (d.getFullYear() === 2027 && d.getMonth() === 1 && d.getDate() === dom) return day
      }
      throw new Error(`нет ${dom} февраля`)
    }
    expect(textsAt(feb(12))).toMatch(/на носу/)
    expect(textsAt(feb(12))).not.toMatch(/Сегодня|прыгнули/)
    expect(textsAt(feb(13))).toMatch(/Сегодня/)
    expect(textsAt(feb(13))).not.toMatch(/на носу|прыгнули/)
    expect(textsAt(feb(14))).toMatch(/прыгнули/)
    expect(textsAt(feb(14))).not.toMatch(/Сегодня|на носу/)

    const window: number[] = []
    for (let day = 0; day < 900; day++) {
      const d = dateOf(day)
      if (d.getFullYear() === 2027 && d.getMonth() === 7 && holidayOf(day) === 'builders') window.push(day)
    }
    const [sat, sun, mon] = window
    expect(textsAt(sat)).toMatch(/на носу/)
    expect(textsAt(sat)).not.toMatch(/строители строителям|Акт праздника/)
    expect(textsAt(sun)).toMatch(/строители строителям не платят/)
    expect(textsAt(sun)).not.toMatch(/на носу|Акт праздника/)
    expect(textsAt(mon)).toMatch(/Акт праздника/)
    expect(textsAt(mon)).not.toMatch(/на носу|строители строителям/)
  })
})

describe('деньги под праздником: день внутри окна (#802)', () => {
  // Окно шире одного дня, и «С наступающим» 1 января — такой же неверный день, как «Год только начался»
  // 30 декабря. Пул знает день, как HOLIDAY_EXCUSES (#255).
  const moneyTexts = (g: Game, holiday: Holiday) =>
    g.lines.eligible('HOLIDAY_MONEY', HOLIDAY_MONEY[holiday], g.lineFacts()).map((p) => p.text)

  /** Уместные строки месяца окна: на свежей партии — сказанных ещё нет (eligible их не отдаёт). */
  const textsAt = (day: number) => {
    const { game } = makeGame()
    game.S.day = day
    return moneyTexts(game, holidayOf(day)!)
  }

  /** Ответ Алика на праздничную денежную кнопку — путь игрока. */
  const answerAt = async (day: number) => {
    const { game } = makeGame({ seed: 5 })
    game.S.day = day
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'holiday' })
    return alikTexts(game.S.msgs.slice(n)).join(' ')
  }

  it('1 января: про начавшийся год — «наступающим» только в декабре', async () => {
    const texts = textsAt(NY)
    expect(texts.some((t) => /наступающим/.test(t)), '1 января «наступающим» не у места').toBe(false)
    expect(texts.some((t) => /Год только начался/.test(t)), 'начало года звучит').toBe(true)
    expect(await answerAt(NY)).not.toMatch(/наступающим/)
  })

  it('НС: 30–31 декабря: «Год только начался» и «Первый день года» — не про декабрь', async () => {
    for (const day of [NY - 2, NY - 1]) {
      const texts = textsAt(day)
      expect(texts.some((t) => /Год только начался|Первый день года/.test(t)), `день ${day}: январские строки в декабре`).toBe(false)
      expect(texts.some((t) => /С наступающим/.test(t)), `день ${day}: «наступающее» есть`).toBe(true)
    }
  })

  it('6–7 марта: подготовки — «С 8 Марта» звучит только с 8-го', async () => {
    for (const day of [M8 - 2, M8 - 1]) {
      const texts = textsAt(day)
      expect(texts.some((t) => /^С 8 Марта/.test(t)), `день ${day}: поздравление до праздника`).toBe(false)
      expect(texts.some((t) => /на носу/.test(t)), `день ${day}: подготовка звучит`).toBe(true)
      expect(await answerAt(day)).not.toMatch(/^С 8 Марта/)
    }
  })

  it('8–9 марта: поздравление уместно, «Сегодня» — только 8-го', async () => {
    for (const day of [M8, M8 + 1]) {
      expect(textsAt(day).some((t) => /^С 8 Марта/.test(t)), `день ${day}: поздравление на месте`).toBe(true)
    }
    expect(textsAt(M8).some((t) => /^Сегодня/.test(t)), '«сегодня» — 8-го').toBe(true)
    expect(textsAt(M8 + 1).some((t) => /^Сегодня/.test(t)), '9-го «сегодня» мимо').toBe(false)
  })
})
