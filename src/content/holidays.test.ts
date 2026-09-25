// Праздники: факт по календарю переписки и гейты пулов (docs/design/holidays.md, #148).
import { describe, it, expect } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import { FWD, FWD_HOLIDAY, NOTIF } from './life'
import { holidayOf, holidayGreetKey, HOLIDAY_EXCUSES } from './holidays'
import { dateOf } from '../engine/time'
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
    // путь игрока: excuseTurn в окне берёт праздничную строку — из тех, что открыты этому дню
    game.S.day = 289
    delete game.S.mem[endgame.active]
    const allowed = game.lines.eligible('HOLIDAY', HOLIDAY_EXCUSES, game.lineFacts()).map((p) => p.text)
    const from = game.S.msgs.length
    await game.excuseTurn()
    expect(allowed).toContain(alikTexts(game.S.msgs.slice(from)).join(' '))
  })

  it('окно: праздник звучит хотя бы раз, и тайл хода поздравляет один раз за праздник', async () => {
    const { game } = makeGame({ seed: 3 })
    const holiday = HOLIDAY_EXCUSES.map((l) => spec(l).t)
    const said = () => game.S.msgs.flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    const greeted = () => game.S.mem['holiday.greeted']
    game.S.day = 288 // 31.12: окно открыто не первый день
    await game.send({ text: 'Спасибо!', tone: 'polite' })
    expect(said().filter((t) => holiday.includes(t)).length).toBeGreaterThan(0)
    const first = greeted()
    expect(String(first)).toMatch(/^newYear@\d{4}$/)
    await game.send({ text: 'Спасибо!', tone: 'polite' })
    expect(greeted()).toBe(first) // тайл больше не поздравляет: отметка держит праздник и год
    // 31.12 → 1.01 — то же окно, ключ по году начала: второго поздравления нет (#255)
    game.S.day = 289
    const before = said().filter((t) => holiday.includes(t)).length
    await game.send({ text: 'Спасибо!', tone: 'polite' })
    expect(greeted()).toBe(first)
    expect(said().filter((t) => holiday.includes(t)).length).toBe(before)
    // следующий Новый год — другое окно
    const year = Number(String(first).split('@')[1])
    while (!(holidayOf(game.S.day) === 'newYear' && holidayGreetKey(game.S.day) === `newYear@${year + 1}`)) game.S.day++
    await game.send({ text: 'Спасибо!', tone: 'polite' })
    expect(greeted()).not.toBe(first)
    expect(said().at(-1)).toMatch(/Новым годом|Ёлка|шампанское|Новый год на носу|Первый день года|по-новому/)
  })

  it('NC: ключ по году даты поздравил бы дважды на стыке лет (#255)', () => {
    expect(holidayGreetKey(288)).toBe('newYear@2026') // 31.12.2026
    expect(holidayGreetKey(289)).toBe('newYear@2026') // 1.01.2027 — то же окно
    expect(`newYear@${dateOf(289).getFullYear()}`).toBe('newYear@2027')
    expect(holidayGreetKey(289)).not.toBe(`newYear@${dateOf(289).getFullYear()}`)
  })

  it('окно: в блоке, при «смерти», с телефоном у Карине и пропавший сам Алик не поздравляет', async () => {
    for (const setup of [
      (g: ReturnType<typeof makeGame>['game']) => { g.S.mem.blocked = true },
      (g: ReturnType<typeof makeGame>['game']) => { g.S.mem.alik_dead = true },
      (g: ReturnType<typeof makeGame>['game']) => { g.S.mem['phone.karine'] = true },
      (g: ReturnType<typeof makeGame>['game']) => { g.S.offlineDays = 2 },
    ]) {
      const { game } = makeGame({ seed: 3 })
      game.S.day = 288
      setup(game)
      await game.send({ text: 'Спасибо!', tone: 'polite' })
      expect(game.S.mem['holiday.greeted']).toBeUndefined()
    }
  })

  it('путь открытки: в окне пересылка бывает праздничной, вне окна — никогда', async () => {
    const { game } = makeGame({ seed: 5 })
    const holiday = FWD_HOLIDAY.map((l) => spec(l).t)
    const drew = async () => {
      const from = game.S.msgs.length
      await game.forward()
      return game.S.msgs.slice(from).flatMap((m) => (m.kind === 'fwd' ? [m.text] : []))
    }
    const drawUntil = async (limit: number) => {
      for (let i = 0; i < limit; i++) if ((await drew()).some((t) => holiday.includes(t))) return true
      return false
    }
    game.S.day = 355
    expect(await drawUntil(30)).toBe(true)
    game.S.day = 184
    expect(await drawUntil(30)).toBe(false)
  })

  it('путь пачки: в окне «пока тебя не было» приходит праздничной отмазкой', () => {
    const { game } = makeGame({ seed: 5 })
    const holiday = HOLIDAY_EXCUSES.map((l) => spec(l).t)
    const awayLine = (day: number) => {
      game.S.day = day
      const from = game.S.msgs.length
      for (let i = 0; i < 20 && from === game.S.msgs.length; i++) game.awayMsg('excuse')
      return game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    }
    expect(awayLine(355).some((t) => holiday.includes(t))).toBe(true)
    expect(awayLine(184).some((t) => holiday.includes(t))).toBe(false)
  })

  it('строки учитывают дату внутри окна: «только начался» — после 1 января, «С 8 Марта» — 8-го', () => {
    const { game } = makeGame({ seed: 1 })
    const pool = (day: number) => {
      game.S.day = day
      return game.lines.eligible('HOLIDAY', HOLIDAY_EXCUSES, game.lineFacts()).map((p) => p.text).join(' ')
    }
    expect(pool(288)).toMatch(/на носу|Ёлка|С наступающим/) // 31.12 — про наступающий
    expect(pool(288)).not.toMatch(/начался|Первый день|по-новому/)
    expect(pool(289)).toMatch(/С Новым годом|Первый день|по-новому/) // 1.01 — про начавшийся
    expect(pool(289)).not.toMatch(/на носу|наступающим/)
    expect(pool(290)).toMatch(/С Новым годом|по-новому/) // 2.01
    expect(pool(290)).not.toMatch(/Первый день/) // только 1 января (#255)
    expect(pool(353)).toMatch(/на носу|Готовлюсь/) // 6.03 — подготовка
    expect(pool(353)).not.toMatch(/С 8 Марта|женский день|праздником весны/)
    expect(pool(355)).toMatch(/С 8 Марта|женский день|праздником весны|Сегодня не про переводы/) // 8.03
    expect(pool(355)).not.toMatch(/на носу|Готовлюсь/)
    expect(pool(356)).toMatch(/С 8 Марта|праздником весны/) // 9.03
    expect(pool(356)).not.toMatch(/Сегодня не про переводы/) // «Сегодня» только 8-го (#255)
    // открытки и мама — тот же календарь: накануне — про скорый день, в сам день — поздравление
    const postcards = (day: number) => {
      game.S.day = day
      return game.lines.eligible('FWD', [...FWD, ...FWD_HOLIDAY], game.lineFacts()).map((p) => p.text).join(' ')
    }
    expect(postcards(353)).toMatch(/Скоро 8 Марта/)
    expect(postcards(353)).not.toMatch(/С 8 Марта!|Международным женским/)
    expect(postcards(355)).toMatch(/С 8 Марта!|Международным женским/)
    expect(postcards(355)).not.toMatch(/Скоро 8 Марта/)
    const mama = (day: number) => {
      game.S.day = day
      return game.lines.eligible('NOTIF', NOTIF, game.lineFacts())
        .filter((p) => (p.spec as { app?: string }).app === 'Мама').map((p) => p.text).join(' ')
    }
    expect(mama(353)).toMatch(/скоро женский день/)
    expect(mama(353)).not.toMatch(/с 8 Марта/)
    expect(mama(355)).toMatch(/с 8 Марта/)
    expect(mama(355)).not.toMatch(/скоро женский день/)
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
