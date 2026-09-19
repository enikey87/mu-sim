import { describe, it, expect } from 'vitest'
import { seededRng, shuffle, rndInt, chance, mathRng } from './rng'
import { Decks, type Bags } from './deck'
import { Seen, hash, keyOf } from './uniq'
import { periodOf, tierOf, fmtTime, fmtDate, fmtDayMonth, dateOf, HANDOVER } from './time'
import { manualClock, realClock } from './clock'
import { freshState, loadState, saveState, SAVE_KEY } from './state'
import { typo } from './typo'
import { memStorage } from '../test/helpers'

describe('rng', () => {
  it('seeded rng is deterministic and in [0,1)', () => {
    const a = seededRng(42), b = seededRng(42)
    for (let i = 0; i < 100; i++) {
      const x = a.random()
      expect(x).toBe(b.random())
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
    expect(mathRng.random()).toBeLessThan(1)
  })
  it('shuffle keeps elements, rndInt in range, chance extremes', () => {
    const r = seededRng(1)
    expect(shuffle(r, [1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5])
    for (let i = 0; i < 100; i++) expect(rndInt(r, 3)).toBeLessThan(3)
    expect(chance(r, 0)).toBe(false)
    expect(chance(r, 1)).toBe(true)
  })
})

describe('Decks (без повторов)', () => {
  it('each element once per cycle, no repeat across cycle boundary', () => {
    const bags: Bags = {}
    const d = new Decks(bags, seededRng(3))
    const arr = ['a', 'b', 'c', 'd']
    let prev = ''
    for (let cycle = 0; cycle < 50; cycle++) {
      const got = arr.map(() => d.draw('k', arr))
      expect([...got].sort()).toEqual(arr)
      expect(got[0]).not.toBe(prev)
      prev = got[3]
    }
  })
  it('noRefill returns null after exhaustion; state persists in bags', () => {
    const bags: Bags = {}
    const d = new Decks(bags, seededRng(3))
    expect(d.tryDraw('x', [1, 2], true)).not.toBeNull()
    expect(d.tryDraw('x', [1, 2], true)).not.toBeNull()
    expect(d.tryDraw('x', [1, 2], true)).toBeNull()
    expect(bags.x.n).toBe(2)
    expect(new Decks(bags, seededRng(9)).tryDraw('x', [1, 2], true)).toBeNull()
  })
  it('resets when array size changes; empty array gives null', () => {
    const d = new Decks({}, seededRng(1))
    d.draw('k', [1, 2, 3])
    expect([1, 2, 3, 4, 5]).toContain(d.draw('k', [1, 2, 3, 4, 5]))
    expect(d.tryDraw('e', [])).toBeNull()
  })
})

describe('Seen (уникальность реплик)', () => {
  it('keyOf and hash', () => {
    expect(keyOf('a')).toBe('a')
    expect(keyOf({ texts: ['a', 'b'] })).toBe('a|b')
    expect(keyOf({ text: 't' })).toBe('t')
    expect(keyOf({ t: 'x' })).toBe('x')
    expect(hash('abc')).toBe(hash('abc'))
    expect(hash('abc')).not.toBe(hash('abd'))
  })
  it('pickFresh avoids seen and decorates when exhausted', () => {
    const list: number[] = []
    const s = new Seen(list)
    s.mark('a')
    expect(s.has('a')).toBe(true)
    expect(list).toHaveLength(1)
    expect(s.pickFresh(() => 'a', (t) => t + '!')).toBe('a!')
    s.mark('a!')
    s.mark('a!')
    expect(list).toHaveLength(2)
    // если и перефразировать нельзя — возвращаем как есть (не зависаем)
    expect(s.pickFresh(() => 'a', (t) => t)).toBe('a')
  })
  it('restores from saved list', () => {
    const s = new Seen([hash('x')])
    expect(s.has('x')).toBe(true)
  })
})

describe('time', () => {
  it('periods by hour and day of week', () => {
    expect(periodOf(3, 1)).toBe('night')
    expect(periodOf(8, 1)).toBe('morning')
    expect(periodOf(11, 1)).toBe('day')
    expect(periodOf(13, 1)).toBe('lunch')
    expect(periodOf(20, 5)).toBe('friday')
    expect(periodOf(20, 2)).toBe('evening')
  })
  it('tiers and formatting', () => {
    expect(tierOf(184)).toBe(0)
    expect(tierOf(250)).toBe(1)
    expect(tierOf(330)).toBe(2)
    expect(tierOf(999)).toBe(3)
    expect(fmtTime(9 * 60 + 5)).toBe('09:05')
    expect(dateOf(0).getTime()).toBe(HANDOVER.getTime())
    expect(fmtDate(0)).toMatch(/18 марта 2026/)
    expect(fmtDayMonth(0)).toBe('18 марта')
    expect(fmtDayMonth(0)).not.toMatch(/г\./)
  })
})

describe('clock', () => {
  it('manual clock runs timers on demand', async () => {
    const c = manualClock(1000)
    let n = 0
    const id = c.setTimeout(() => n++, 100)
    c.setTimeout(() => n++, 100)
    c.clearTimeout(id)
    expect(c.pending()).toBe(1)
    c.runTimers()
    expect(n).toBe(1)
    await c.sleep(10_000)
    c.advance(500)
    expect(c.now()).toBe(1500)
  })
  it('real clock scales sleep', async () => {
    const t = Date.now()
    await realClock(0.001).sleep(1000)
    expect(Date.now() - t).toBeLessThan(200)
  })
})

describe('state', () => {
  it('save/load roundtrip, trims messages, merges defaults', () => {
    const st = memStorage()
    const s = freshState()
    for (let i = 0; i < 200; i++) s.msgs.push({ id: i, kind: 'sys', text: 'x' })
    saveState(st, s)
    expect(s.msgs).toHaveLength(200) // живая история не обрезается
    const back = loadState(st)!
    expect(back.msgs).toHaveLength(150)
    const partial = memStorage({ [SAVE_KEY]: JSON.stringify({ msgs: [], day: 300 }) })
    const merged = loadState(partial)!
    expect(merged.day).toBe(300)
    expect(merged.battery).toBe(100) // поле по умолчанию подставилось
  })
  it('corrupt or missing save gives null; no storage is safe', () => {
    expect(loadState(memStorage({ [SAVE_KEY]: '{oops' }))).toBeNull()
    expect(loadState(memStorage())).toBeNull()
    expect(loadState(null)).toBeNull()
    expect(() => saveState(null, freshState())).not.toThrow()
  })
})

describe('typo', () => {
  it('autocorrect keeps capitalization and produces a fix line', () => {
    const decks = new Decks({}, seededRng(1))
    let found = false
    for (let seed = 1; seed < 60 && !found; seed++) {
      const t = typo('Брат, бетон обиделся.', seededRng(seed), decks)
      if (t && /Борат|батон/.test(t.text)) {
        found = true
        if (t.text.startsWith('Борат')) expect(t.fix).toMatch(/Брат/)
        if (t.text.includes('батон')) expect(t.fix).toMatch(/бетон/)
      }
    }
    expect(found).toBe(true)
  })
  it('does not touch substrings inside other words; short text without long words gives null', () => {
    const decks = new Decks({}, seededRng(1))
    for (let seed = 1; seed < 30; seed++) {
      const t = typo('Экрана нет.', seededRng(seed), decks)
      if (t) expect(t.text).not.toMatch(/Экрах/)
    }
    expect(typo('Да.', seededRng(1), decks)).toBeNull()
  })
})
