// Карточки интро: строки титров называют факты партии, а не свои числа. Шелл холодной загрузки (#1444)
// показывает их до того, как партия создана, — поэтому завязку и день 0 он берёт из тех же данных,
// что возьмёт игра, и промах в любую сторону (чужое обещание, свои дни) краснеет здесь.
import { describe, expect, it } from 'vitest'
import { STARTS } from '../content/starts'
import { START_DAY, fmtDate } from '../engine/time'
import { INTRO_FIRST_LINE, introDateLine, introGapLine, introLinesOf, introTextOf, introVowLine } from './cards'
import { makeGame } from '../test/helpers'

/** Пролог созданной партии: первое сообщение Алика и системная строка завязки. */
const prologue = (startIndex: number) => {
  const { game } = makeGame({ start: startIndex })
  const alik = game.S.msgs.find((m) => m.kind === 'text' && m.from === 'alik' && !m.who)
  const sys = game.S.msgs.find((m) => m.kind === 'sys')
  return {
    alik: alik?.kind === 'text' ? alik.text : '',
    gap: sys?.kind === 'sys' ? sys.text : '',
    day: game.S.day,
  }
}

describe('титры интро называют факты партии', () => {
  it('каждая завязка обещает то, что стоит в её первом сообщении', () => {
    for (const s of STARTS) expect(s.intro.includes(s.vow), s.intro).toBe(true)
  })

  it('карточки 3 и 4 шелла — дословно пролог той же завязки', () => {
    STARTS.forEach((s, i) => {
      const p = prologue(i)
      expect(p.alik, `завязка ${i}`).toBe(s.intro)
      expect(p.day, `завязка ${i}`).toBe(START_DAY)
      // карточка — реплика: первая буква заглавная, остальное обещание дословно
      expect(introVowLine(s.vow).slice('Алик: «'.length, -1).toLowerCase()).toBe(s.vow.toLowerCase())
      expect(p.alik.includes(s.vow), `завязка ${i}: обещание в чате`).toBe(true)
      // строка завязки: шаблон + те же дни, что в системном сообщении партии
      expect(introGapLine(s), `завязка ${i}: дни`).toBe(p.gap)
      expect(introTextOf(s), `завязка ${i}`).toEqual({ vow: s.vow, gap: p.gap, date: fmtDate(0) })
    })
  })

  it('каждая завязка — четыре строки, без пустых и без второй точки', () => {
    for (const s of STARTS) {
      const lines = introLinesOf(introTextOf(s))
      expect(lines).toHaveLength(4)
      expect(lines[0]).toBe(INTRO_FIRST_LINE)
      expect(lines[1]).toBe(introDateLine(fmtDate(0)))
      expect(lines[1]).not.toMatch(/\.\.$/)
      expect(lines[3]).toBe(introGapLine(s))
      for (const line of lines) expect(line.length).toBeGreaterThan(3)
    }
  })

  it('NC: чужая завязка в титрах — карточка 3 против чата краснеет', () => {
    // обещание одной завязки при тексте другой: титры и пролог разошлись бы (так и ловится подмена)
    const first = STARTS[0]
    const other = STARTS.find((s) => s.vow !== first.vow)!
    const { game } = makeGame({ start: 0 })
    const alik = game.S.msgs.find((m) => m.kind === 'text' && m.from === 'alik')!
    expect(alik.kind === 'text' && alik.text.includes(other.vow)).toBe(false)
    expect(introVowLine(other.vow)).not.toBe(introVowLine(first.vow))
  })
})
