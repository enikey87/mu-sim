import { describe, expect, it } from 'vitest'
import { makeGame } from '../test/helpers'
import { ENMITY_FAMILY } from './enmity'
import { P_LIE_NIVA } from './lies'
import type { ClaimKey } from './ids'
import { D } from './excuses'
import { ARCS } from './arcs'
import { CHRONIC_RUDE_AFTER_VENDETTA, ENDINGS } from './finales'
import {
  ENDGAME_BLOODFEUD_APOLOGY, ENDGAME_BLOODFEUD_FORMALITIES,
  ENDGAME_VENDETTA_APOLOGY, ENDGAME_VENDETTA_FORMALITIES,
} from './endgame'

describe('редакторские контракты новых пулов после раунда 20', () => {
  it.each([false, true])('мама при знакомстве=%s не отрицает переписку и не придумывает извинений', (known) => {
    const { game } = makeGame()
    Object.assign(game.S.mem, { vendetta: true, 'intro.mama': known, 'count.sorry': 0 })
    const lines = game.open(ENMITY_FAMILY).filter((l) => l.w === 'mama')
    expect(lines.length).toBeGreaterThan(0)
    for (const { t } of lines) {
      expect(t).not.toMatch(/не переписывались|второй раз/)
    }
  })

  it.each([
    ['niva_away', 'niva_writes', true],
    ['niva_back', 'niva_away', false],
    ['niva_writes', 'niva_away', true],
  ] as const)('поимка %s → %s пересказывает обе улики при текущем away=%s', (a, b, away) => {
    const { game } = makeGame()
    Object.assign(game.S.mem, { 'intro.niva': true, 'niva.away': away })
    const hear = (key: ClaimKey) => game.alikMsg({ kind: 'text', from: 'alik', text: 'Версия' }, [key])
    hear(a)
    expect(game.lie()).toBeNull()
    game.S.day += 40
    hear(b)
    const lie = game.lie()!
    expect(lie?.kind).toBe('niva')
    const lines = game.open(P_LIE_NIVA)
    expect(lines.length).toBeGreaterThan(0)
    for (const raw of lines) {
      const text = game.X.fill(raw, { old: lie.old.say, new: lie.new.say })
      expect(text).toContain(lie.old.say)
      expect(text).toContain(lie.new.say)
      expect(text).not.toMatch(/минуту назад|\{\w+\}/i)
    }
  })

  it('требование извинений не объявляет, что игрок уже извинился', () => {
    expect(ENDGAME_VENDETTA_APOLOGY.length).toBeGreaterThan(0)
    for (const text of ENDGAME_VENDETTA_APOLOGY) {
      expect(text).not.toMatch(/я не принимаю|твоё извинение подписано|я бы принял|пиши извинение|извинение шло к нам/i)
    }
    expect(ENDGAME_BLOODFEUD_APOLOGY.length).toBeGreaterThan(0)
    for (const text of ENDGAME_BLOODFEUD_APOLOGY) {
      expect(text).not.toMatch(/ты их написал|ты просишь прощения/i)
    }
  })

  it.each([
    { i: 0, absent: /потерялась|ищем/ },
    { i: 1, absent: /не заводится/ },
  ])('пересказ серии $i не добавляет событие из другой серии', async ({ i, absent }) => {
    const { game } = makeGame()
    await game.playEpisode(ARCS.niva.eps[i], 'niva')
    expect(game.lie()).toBeNull()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Би-бип.' }, ['niva_writes'])
    const lie = game.lie()!
    expect(lie?.kind).toBe('niva')
    expect(lie.old.say).not.toMatch(absent)
  })

  it('поздний эпилог не датирует начало вражды вчерашним днём', () => {
    expect(ENDGAME_VENDETTA_FORMALITIES.length).toBeGreaterThan(0)
    for (const text of ENDGAME_VENDETTA_FORMALITIES) expect(text).not.toMatch(/вчера ещё было братство/i)
  })

  it('экран Вендетты не превращает игрока в должника', () => {
    const ending = ENDINGS.find((e) => e.id === 'vendetta')!
    expect(ending).toBeDefined()
    expect(ending.text).not.toMatch(/денег ты не вернул/i)
  })

  it('отказанное первое извинение не выдаётся за отсутствие попытки', async () => {
    const { game } = makeGame()
    game.S.mem.vendetta = true
    await game.fire('PlayerSays', { intent: 'sorry', tone: 'polite' })
    expect(game.S.mem['vendetta.price']).toBe(true)
    expect(game.S.mem.vendetta).toBe(true)
    game.S.mem['count.rudeAfterVendetta'] = CHRONIC_RUDE_AFTER_VENDETTA
    await game.fire('CheckEnding')
    expect(game.S.ending).toBe('bloodfeud')
    const texts = game.S.msgs.flatMap((m) => m.kind === 'text' ? [m.text] : [])
    const ending = ENDINGS.find((e) => e.id === 'bloodfeud')!
    expect([...texts, ending.text].join('\n')).not.toMatch(/ты не извинился/i)
    expect(ENDINGS.find((e) => e.id === 'vendetta')!.text).not.toMatch(/ни разу не извинился/i)
  })

  it('в группе отлучения остаётся игрок, а внешнего читателя нет', () => {
    expect(ENDGAME_BLOODFEUD_FORMALITIES.length).toBeGreaterThan(0)
    for (const text of ENDGAME_BLOODFEUD_FORMALITIES) {
      expect(text).not.toMatch(/а участников нет|\. Прочитано\./)
    }
  })

  it('все варианты срока следующего месяца называют именно следующий месяц', () => {
    const { game } = makeGame()
    const lines = game.open(D.P_WHEN_FAR_MONTH)
    expect(lines).toHaveLength(3)
    for (const line of lines) {
      const text = game.X.fill(String(line), { t: 'в следующем месяце', T: 'В следующем месяце', date: '30 ноября' })
      expect(text).toMatch(/кон(?:ца|ец) следующего месяца/i)
      expect(text).toContain('30 ноября')
    }
  })
})
