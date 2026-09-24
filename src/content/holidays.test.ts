// Праздники: факт по календарю переписки и гейты пулов (docs/design/holidays.md, #148).
import { describe, it, expect } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import { FWD, FWD_HOLIDAY, NOTIF } from './life'
import { holidayOf, HOLIDAY_EXCUSES } from './holidays'
import { endgame } from './memkeys'
import { spec } from '../engine/rules'

const NY = 'Новым годом'
const M8 = '8 Марта'

describe('праздники', () => {
  it('holidayOf: Новый год 30.12–03.01, 8 Марта 06.03–09.03; вне окон — пусто', () => {
    expect(holidayOf(286)).toBeUndefined()
    expect(holidayOf(287)).toBe('newYear')
    expect(holidayOf(291)).toBe('newYear')
    expect(holidayOf(292)).toBeUndefined()
    expect(holidayOf(352)).toBeUndefined()
    expect(holidayOf(353)).toBe('march8')
    expect(holidayOf(356)).toBe('march8')
    expect(holidayOf(357)).toBeUndefined()
  })

  it('facts().holiday совпадает с календарём дня партии', () => {
    const { game } = makeGame()
    game.S.day = 184
    expect(game.facts().holiday).toBe(false)
    game.S.day = 289
    expect(game.facts().holiday).toBe('newYear')
    game.S.day = 355
    expect(game.facts().holiday).toBe('march8')
  })

  it('открытки и мама: в окне праздника доступны, вне — нет; в эндгейме — нет', () => {
    const { game } = makeGame()
    const reset = (day: number, end = false) => {
      game.S.day = day
      if (end) game.S.mem[endgame.active] = true
      else delete game.S.mem[endgame.active]
    }
    const fwd = () => game.lines.eligible('FWD', [...FWD, ...FWD_HOLIDAY], game.lineFacts()).map((p) => p.text)
    const mama = () => game.lines.eligible('NOTIF', NOTIF, game.lineFacts())
      .filter((p) => (p.spec as { app?: string }).app === 'Мама')
      .map((p) => p.text)

    reset(289)
    expect(fwd().some((t) => t.includes(NY))).toBe(true)
    expect(mama().some((t) => t.includes(NY))).toBe(true)

    reset(184)
    expect(fwd().some((t) => t.includes(NY))).toBe(false)
    expect(mama().some((t) => t.includes(NY))).toBe(false)

    reset(289, true)
    expect(fwd().some((t) => t.includes(NY))).toBe(false)
    expect(mama().some((t) => t.includes(NY))).toBe(false)

    reset(355)
    expect(fwd().some((t) => t.includes(M8) || t.includes('женским'))).toBe(true)
    expect(mama().some((t) => t.includes('8 Марта'))).toBe(true)

    reset(184)
    expect(fwd().some((t) => t.includes(M8) || t.includes('женским'))).toBe(false)
    expect(mama().some((t) => t.includes('8 Марта'))).toBe(false)

    reset(355, true)
    expect(fwd().some((t) => t.includes(M8) || t.includes('женским'))).toBe(false)
    expect(mama().some((t) => t.includes('8 Марта'))).toBe(false)
  })

  it('отмазка: праздничная строка возможна в окне и невозможна вне', async () => {
    const { game } = makeGame({ seed: 7 })
    const holidayLine = (day: number, end = false) => {
      game.S.day = day
      if (end) game.S.mem[endgame.active] = true
      else delete game.S.mem[endgame.active]
      return game.lines.eligible('HOLIDAY', HOLIDAY_EXCUSES, game.lineFacts()).map((p) => p.text)
    }
    expect(holidayLine(289).length).toBe(3)
    expect(holidayLine(355).length).toBe(3)
    expect(holidayLine(184)).toEqual([])
    expect(holidayLine(289, true)).toEqual([])
    // путь игрока: excuseTurn в окне берёт праздничную строку
    game.S.day = 289
    delete game.S.mem[endgame.active]
    const from = game.S.msgs.length
    await game.excuseTurn()
    expect(alikTexts(game.S.msgs.slice(from)).join(' ')).toMatch(/Новым годом|Ёлка стоит|шампанское/)
  })

  it('негативный контроль: убрать holiday из гейта открытки — строка доступна вне окна', () => {
    const { game } = makeGame()
    game.S.day = 184
    const pool = FWD_HOLIDAY.map((l) => {
      const s = spec(l)
      if (!s.t.includes(NY)) return l
      return { ...s, when: (s.when ?? []).filter((c) => !('key' in c && c.key === 'holiday')) }
    })
    expect(game.lines.eligible('FWD', pool, game.lineFacts()).some((p) => p.text.includes(NY))).toBe(true)
    // живой пул вне окна — тишина
    expect(game.lines.eligible('FWD', FWD_HOLIDAY, game.lineFacts()).some((p) => p.text.includes(NY))).toBe(false)
  })
})
