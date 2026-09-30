import { describe, it, expect } from 'vitest'
import { registerDaysSince, daySinceEvent, isDaySinceCounter, daysSince } from './days-since'

describe('days-since', () => {
  it('since.* → ach.*; прочие — из registerDaysSince', () => {
    expect(daySinceEvent('since.dead')).toBe('ach.dead')
    expect(isDaySinceCounter('since.dead')).toBe(true)
    expect(daySinceEvent('plain')).toBeNull()
    expect(isDaySinceCounter('plain')).toBe(false)
    expect(registerDaysSince('ctr.x', 'evt.x')).toBe('ctr.x')
    expect(daySinceEvent('ctr.x')).toBe('evt.x')
    expect(isDaySinceCounter('ctr.x')).toBe(true)
  })

  it('без события — undefined; с событием — разница дней', () => {
    expect(daysSince(10, undefined)).toBeUndefined()
    expect(daysSince(10, null)).toBeUndefined()
    expect(daysSince(10, false)).toBeUndefined()
    expect(daysSince(10, '')).toBeUndefined()
    expect(daysSince(10, 7)).toBe(3)
  })
})
