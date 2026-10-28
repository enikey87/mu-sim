import { describe, expect, it } from 'vitest'
import { GAME_URL, cardFile, daysWord, shareText } from './share'

describe('текст и файл «Поделиться» (#1485)', () => {
  it('дни — словом: «день / дня / дней»', () => {
    expect([1, 21, 101].map(daysWord)).toEqual(['день', 'день', 'день'])
    expect([2, 22, 103].map(daysWord)).toEqual(['дня', 'дня', 'дня'])
    expect([0, 5, 11, 12, 13, 14, 240, 111].map(daysWord)).toEqual(['дней', 'дней', 'дней', 'дней', 'дней', 'дней', 'дней', 'дней'])
  })

  it('текст несёт число дней и адрес игры — в каждой ветке', () => {
    expect(shareText(240)).toBe(`Я дожал Алика за 240 дней. А ты сможешь? ${GAME_URL}`)
    expect(shareText(1)).toContain('за 1 день.')
    expect(shareText(2)).toContain('за 2 дня.')
    // концовка из отметки устройства: дня партии не осталось — число не выдумываем
    const generic = shareText(null)
    expect(generic).toContain(GAME_URL)
    expect(generic).not.toMatch(/null|undefined|\bза\b/)
  })

  it('имя файла карточки — от id концовки', () => {
    expect(cardFile({ id: 'payday_real', icon: '💸', title: 'Настоящие деньги', days: 330, path: [] }))
      .toBe('alik-ending-payday_real.png')
  })
})
