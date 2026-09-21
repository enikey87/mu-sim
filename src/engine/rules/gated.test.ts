import { describe, it, expect } from 'vitest'
import { Gated, gate, isOpen, valueOf, mapEntry } from './gated'
import { is, gte } from './criteria'

describe('элементы пула с требованиями', () => {
  it('без требований — всегда уместен; с требованиями — по фактам', () => {
    const crane = gate(is('crane'))('кран уехал')
    expect(isOpen('просто строка', {})).toBe(true)
    expect(isOpen(crane, {})).toBe(false)
    expect(isOpen(crane, { crane: true })).toBe(true)
    expect(isOpen(crane, (k) => (k === 'crane' ? true : undefined))).toBe(true)
    expect(valueOf(crane)).toBe('кран уехал')
    expect(valueOf({ f: 'Мама', t: 'Сынок' })).toEqual({ f: 'Мама', t: 'Сынок' })
  })
  it('вложенные требования складываются, значение не заворачивается дважды', () => {
    const both = gate(is('a'))(gate(gte('day', 200))({ t: 'x', d: null }))
    expect(both).toBeInstanceOf(Gated)
    expect(both.v).toEqual({ t: 'x', d: null })
    expect(isOpen(both, { a: true, day: 100 })).toBe(false)
    expect(isOpen(both, { a: true, day: 250 })).toBe(true)
  })
  it('mapEntry сохраняет требования', () => {
    const said = gate(is('a'))(['boris', 'Бее'] as const)
    const text = mapEntry(said, ([, t]) => t)
    expect(text).toBeInstanceOf(Gated)
    expect(valueOf(text)).toBe('Бее')
    expect(isOpen(text, {})).toBe(false)
    expect(mapEntry(['alik', 'Брат'] as const, ([, t]) => t)).toBe('Брат')
  })
})
