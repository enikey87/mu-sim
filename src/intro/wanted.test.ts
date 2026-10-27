// Условие титров шелла (#1444): каждая ветка — «здесь титров нет», и каждая проверена отдельно.
// Ошибка в любую сторону видна игроку: титры поверх восстановленной партии обманывают, а титры в e2e
// и боте съедают их таймауты.
import { describe, expect, it } from 'vitest'
import { shellIntroWanted } from './wanted'

describe('титры шелла: когда они играют', () => {
  it('первый запуск веба без сохранения — играют', () => {
    expect(shellIntroWanted({ noIntro: false, web: true, save: false })).toBe(true)
  })

  it('сохранение есть — титров нет: место отдаётся прежней партии', () => {
    expect(shellIntroWanted({ noIntro: false, web: true, save: true })).toBe(false)
  })

  it('?nointro — титров нет ни у шелла, ни у приложения', () => {
    expect(shellIntroWanted({ noIntro: true, web: true, save: false })).toBe(false)
  })

  it('витрина — титров нет: прогресс в облаке, и «есть сохранение» до адаптера не узнать', () => {
    expect(shellIntroWanted({ noIntro: false, web: false, save: false })).toBe(false)
    expect(shellIntroWanted({ noIntro: false, web: false, save: true })).toBe(false)
  })
})
