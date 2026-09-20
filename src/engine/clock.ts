// Время для движка. В игре — реальные таймеры (с ускорением ?fast), в тестах — ручные.
export interface Clock {
  sleep(ms: number): Promise<void>
  setTimeout(fn: () => void, ms: number): number
  clearTimeout(id: number): void
  now(): number
}

export function realClock(speed = 1): Clock {
  return {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms * speed)),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms * speed),
    clearTimeout: (id) => window.clearTimeout(id),
    now: () => Date.now(),
  }
}

/** Тестовые часы: sleep мгновенный, таймеры запускаются вручную через runTimers(). */
export interface ManualClock extends Clock {
  pending(): number
  runTimers(): void
  advance(ms: number): void
}

export function manualClock(start = Date.parse('2026-09-18T12:00:00Z')): ManualClock {
  let now = start
  let seq = 1
  const timers = new Map<number, () => void>()
  return {
    sleep: () => Promise.resolve(),
    setTimeout(fn) {
      const id = seq++
      timers.set(id, fn)
      return id
    },
    clearTimeout: (id) => void timers.delete(id),
    now: () => now,
    pending: () => timers.size,
    runTimers() {
      const due = [...timers.entries()]
      timers.clear()
      for (const [, fn] of due) fn()
    },
    advance(ms) {
      now += ms
    },
  }
}

export const isManualClock = (c: Clock): c is ManualClock => 'runTimers' in c
