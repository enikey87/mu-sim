// Часы: игровой и настенный таймеры различимы типами — перепутанные часы не компилируются.
import { describe, it, expect } from 'vitest'
import { manualClock, wallClock } from './clock'

describe('часы', () => {
  it('ручные часы: setTimeout/clearTimeout', () => {
    const clock = manualClock()
    let ran = false
    clock.setTimeout(() => { ran = true }, 1000)
    expect(clock.pending()).toBe(1)
    clock.runTimers()
    expect(ran).toBe(true)
    expect(clock.pending()).toBe(0)
    clock.clearTimeout(clock.setTimeout(() => {}, 1))
    expect(clock.pending()).toBe(0)
  })

  it('настенные часы: setTimeout/clearTimeout', () => {
    let ran = false
    const id = wallClock.setTimeout(() => { ran = true }, 0)
    wallClock.clearTimeout(id)
    expect(ran).toBe(false)
  })

  // Вызовы безвредны (свои таймеры); сторож — компилятор: без брендов @ts-expect-error станут лишними и typecheck упадёт.
  it('перепутанные часы не компилируются (негативный контроль типов)', () => {
    const clock = manualClock()
    const gameId = clock.setTimeout(() => {}, 1)
    const wallId = wallClock.setTimeout(() => {}, 1)
    // @ts-expect-error игровой таймер нельзя гасить настенными часами
    wallClock.clearTimeout(gameId)
    // @ts-expect-error настенный таймер нельзя гасить игровыми часами
    clock.clearTimeout(wallId)
    clock.clearTimeout(gameId)
    wallClock.clearTimeout(wallId)
  })
})
