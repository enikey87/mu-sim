// Деньги под праздником (#585, «После MVP» docs/design/holidays.md): в окне календаря у игрока
// есть кнопка про этот праздник и деньги, Алик отвечает пулом праздника; вне окна и в эндгейме кнопки нет.
import { describe, it, expect } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import { HOLIDAY_MONEY, P_HOLIDAY, holidayOf } from './holidays'
import { dateOf } from '../engine/time'
import { alikDead, blocked, endgame } from './memkeys'
import type { Game } from '../engine/game'

const NY = 289 // 1 января: окно Нового года
const M8 = 355 // 8 марта: окно 8 Марта
const PLAIN = 184 // обычный день

const optHoliday = (g: Game) => g.rules.collect({ event: 'BuildChoices' }, g.facts()).filter((r) => r.name === 'Opt_Holiday')

describe('деньги под праздником', () => {
  it('в окне кнопка есть и она про свой праздник, вне окна и в эндгейме — нет', () => {
    for (const [day, pool] of [[NY, P_HOLIDAY.newYear], [M8, P_HOLIDAY.march8]] as const) {
      const { game } = makeGame()
      game.S.day = day
      const rules = optHoliday(game)
      expect(rules, `окно ${day}`).toHaveLength(1)
      const c = rules[0].offer!(game.rules.ctx(game, rules[0], { event: 'BuildChoices' }, game.facts()))
      expect(pool, `кнопка ${day} — из пула праздника`).toContain(c?.text)

      const { game: plain } = makeGame()
      plain.S.day = PLAIN
      expect(optHoliday(plain), 'вне окна кнопки нет').toHaveLength(0)

      const { game: end } = makeGame()
      end.S.day = day
      end.rules.applyOps([{ key: endgame.active, op: '=', value: true }], {})
      expect(optHoliday(end), 'в эндгейме кнопки нет').toHaveLength(0)

      for (const [what, key] of [['окно смерти', alikDead], ['блок', blocked]] as const) {
        const { game: quiet } = makeGame()
        quiet.S.day = day
        quiet.rules.applyOps([{ key, op: '=', value: true }], {})
        expect(optHoliday(quiet), `в ${what} кнопки нет`).toHaveLength(0)
      }
    }
  })

  it('Алик отвечает пулом того праздника, который сейчас', async () => {
    for (const [day, pool] of [[NY, HOLIDAY_MONEY.newYear], [M8, HOLIDAY_MONEY.march8]] as const) {
      const { game } = makeGame({ seed: 5 })
      game.S.day = day
      const n = game.S.msgs.length
      await game.fire('PlayerSays', { intent: 'holiday' })
      const answer = alikTexts(game.S.msgs.slice(n)).join(' ')
      expect(pool.some((l) => answer.includes(l)), `ответ не из пула праздника: ${answer}`).toBe(true)
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
    for (const [day, button, reply] of [
      [dayOn(2027, 2, 13), P_HOLIDAY.trndez, HOLIDAY_MONEY.trndez],
      [builders, P_HOLIDAY.builders, HOLIDAY_MONEY.builders],
    ] as const) {
      const { game } = makeGame({ seed: 5 })
      game.S.day = day
      const rules = optHoliday(game)
      expect(rules, `кнопка ${day}`).toHaveLength(1)
      const c = rules[0].offer!(game.rules.ctx(game, rules[0], { event: 'BuildChoices' }, game.facts()))
      expect(button).toContain(c?.text)
      const n = game.S.msgs.length
      await game.fire('PlayerSays', { intent: 'holiday' })
      const answer = alikTexts(game.S.msgs.slice(n)).join(' ')
      expect(reply.some((l) => answer.includes(l)), answer).toBe(true)
    }
  })
})
