// Темп Алика: в обычной игре инициативы реже, в ?fast доставка сообщений не короче реального пола чтения (#1370).
import { describe, it, expect } from 'vitest'
import { Game, READ_FLOOR_BUBBLE_MS, READ_FLOOR_STATUS_MS, READ_FLOOR_TYPING_MS, type GameOptions } from './game'
import type { GameTimer, ManualClock } from './clock'
import { seededRng } from './rng'
import * as memkeys from '../content/memkeys'

/** Ускорение ?fast из src/main.tsx. */
const SPEED = 0.03
const START = Date.parse('2026-09-18T12:00:00Z')

type SpyClock = ManualClock & { delays: number[] }

/** Ручные часы с ускорением: помнят игровые мс каждой запланированной паузы, sleep резолвится сразу.
 *  Спад «игровые мс → реальные» тот же, что у realClock: реальные = игровые × speed. */
function spyClock(speed: number): SpyClock {
  let now = START
  let seq = 1
  const timers = new Map<number, () => void>()
  const delays: number[] = []
  return {
    speed,
    delays,
    sleep: () => Promise.resolve(),
    setTimeout(fn, ms) {
      delays.push(ms)
      const id = seq++ as GameTimer
      timers.set(id, fn)
      return id
    },
    clearTimeout: (id) => void timers.delete(id),
    now: () => now,
    pending: () => timers.size,
    runTimers() {
      const due = [...timers.values()]
      timers.clear()
      for (const fn of due) fn()
    },
    advance(ms) { now += ms },
  }
}

function pacedGame(clock: SpyClock, opts: Partial<GameOptions> = {}): Game {
  const game = new Game({ storage: null, clock, rng: seededRng(3), noTimers: true, typos: false, hour: 14, ...opts })
  // случайная ветка «печатает… пропал» делает паузы непредсказуемыми — в проверке полов она не нужна
  game.chance = () => false
  return game
}

const real = (gameMs: number, speed = SPEED): number => gameMs * speed

describe('темп: ?fast не сжимает то, что человек читает (#1370)', () => {
  it('пауза между пузырями не ниже пола реального времени', async () => {
    const clock = spyClock(SPEED)
    const game = pacedGame(clock)
    await game.say(['раз', 'два', 'три'])
    // каждый пузырь: typing-пауза и пауза между пузырями — обе семьи пауз держат свой пол
    expect(clock.delays.length).toBe(6)
    for (const ms of clock.delays) expect(real(ms)).toBeGreaterThanOrEqual(READ_FLOOR_BUBBLE_MS)
    // у паузы между пузырями пол свой, 350 мс: 250 игровых иначе стали бы 7,5 мс реальных
    expect(clock.delays[1]!).toBeCloseTo(READ_FLOOR_BUBBLE_MS / SPEED)
  })

  it('«печатает…» висит не меньше своего пола', async () => {
    const clock = spyClock(SPEED)
    const game = pacedGame(clock)
    await game.typingFor(1000)
    expect(clock.delays).toHaveLength(1)
    expect(real(clock.delays[0]!)).toBeCloseTo(READ_FLOOR_TYPING_MS)
  })

  it('«печатает…» при молчании Алика — тот же пол', async () => {
    const clock = spyClock(SPEED)
    const game = pacedGame(clock)
    game.S.mem[memkeys.blocked] = true
    await game.typingFor(1000)
    expect(real(clock.delays.at(-1)!)).toBeCloseTo(READ_FLOOR_TYPING_MS)
  })

  it('шапка не мигает: передышка статуса не ниже своего пола', () => {
    const clock = spyClock(SPEED)
    const game = pacedGame(clock, { noTimers: false })
    clock.delays.length = 0
    game.armStatus()
    expect(clock.delays).toHaveLength(1)
    expect(real(clock.delays[0]!)).toBeGreaterThanOrEqual(READ_FLOOR_STATUS_MS)
  })
})

describe('темп: обычная игра идёт прежними задержками (#1370)', () => {
  it('speed=1 — полы не действуют, паузы ровно игровые', async () => {
    const clock = spyClock(1)
    const game = pacedGame(clock)
    await game.typingFor(1000)
    expect(clock.delays).toEqual([1000])
    clock.delays.length = 0
    await game.say(['раз'])
    expect(clock.delays).toEqual([800, 250])
  })

  it('speed=1 — статус переставляется как прежде', () => {
    const clock = spyClock(1)
    const game = pacedGame(clock, { noTimers: false })
    clock.delays.length = 0
    game.armStatus()
    expect(clock.delays[0]).toBeGreaterThanOrEqual(7000)
    expect(clock.delays[0]).toBeLessThan(16000)
  })
})

describe('темп: инициативы Алика реже (#1370)', () => {
  it('первая инициатива — через 4–8 минут тишины', () => {
    const clock = spyClock(SPEED)
    const game = pacedGame(clock, { noTimers: false })
    game.S.stats.sent = 5
    clock.delays.length = 0
    game.armIdle()
    expect(clock.delays).toHaveLength(1)
    expect(clock.delays[0]).toBeGreaterThanOrEqual(240000)
    expect(clock.delays[0]).toBeLessThan(480000)
  })
})
