import { describe, it, expect } from 'vitest'
import {
  eq, ne, gt, gte, lt, lte, between, exists, missing, matches, is, named, of,
  set, add, mul, invert, during, test, describeCriterion, watchFactKeys, type Resolver,
} from './criteria'
import type { Facts } from './types'

describe('условия: операторы', () => {
  const f: Facts = { n: 5, s: 'abc', t: true, z: 0, e: '', nul: null }
  it.each([
    [eq('n', 5), true], [eq('n', 6), false], [ne('n', 5), false], [ne('n', 6), true],
    [gt('n', 4), true], [gt('n', 5), false], [gte('n', 5), true], [gte('n', 6), false],
    [lt('n', 6), true], [lt('n', 5), false], [lte('n', 5), true], [lte('n', 4), false],
    [matches('s', /b/), true], [matches('s', /x/), false], [matches('n', /5/), false],
    [is('t'), true], [is('z'), false],
  ])('%j → %s', (c, want) => expect(test(c, f)).toBe(want))

  it('exist: undefined/null/false/"" — нет факта, 0 — есть', () => {
    for (const k of ['nope', 'nul', 'e']) {
      expect(test(exists(k), { ...f, nope: undefined })).toBe(false)
      expect(test(missing(k), f)).toBe(true)
    }
    expect(test(exists('z'), f)).toBe(true)
    expect(test(missing('z'), f)).toBe(false)
    expect(test(exists('c'), { c: false })).toBe(false)
  })
  it('отсутствующий факт: == false истинно, числа считаются нулём, строки приводятся', () => {
    expect(test(eq('x', false), {})).toBe(true)
    expect(test(eq('x', 0), {})).toBe(false)
    expect(test(gte('x', 0), {})).toBe(true)
    expect(test(gt('x', 0), {})).toBe(false)
    expect(test(gt('s', 1), { s: '5' })).toBe(true)
  })
  it('between — два условия', () => {
    const [a, b] = between('n', 1, 5)
    expect(test(a, f) && test(b, f)).toBe(true)
    expect(test(b, { n: 6 })).toBe(false)
  })
})

describe('именованные условия и доски персонажей', () => {
  it('named: все составляющие должны выполниться; пустое — истинно', () => {
    const c = named('Evening', gte('h', 18), lte('h', 23))
    expect(test(c, { h: 20 })).toBe(true)
    expect(test(c, { h: 10 })).toBe(false)
    expect(test({ key: 'Empty', op: 'all' }, {})).toBe(true)
    expect(describeCriterion(c)).toBe('Evening')
  })
  it('of(actor, …) передаёт персонажа в resolver; scope тоже доходит', () => {
    const calls: Array<[string, string | undefined, string | undefined]> = []
    const r: Resolver = (k, s, a) => { calls.push([k, s, a]); return a === 'boris' ? true : undefined }
    expect(test(of('boris', is('sick')), r)).toBe(true)
    expect(test(is('sick', 'sender'), r)).toBe(false)
    expect(calls).toEqual([['sick', undefined, 'boris'], ['sick', 'sender', undefined]])
  })
})

describe('описание условий', () => {
  it.each([
    [exists('x'), 'x'], [missing('x'), '!x'], [exists('x', 'sender'), 'sender.x'], [missing('x', 'world'), '!world.x'],
    [eq('a', 'b'), 'a == "b"'], [gte('n', 3, 'target'), 'target.n >= 3'], [matches('s', /ab+/), 's match ab+'],
    [of('boris', is('sick')), 'boris.sick == true'],
  ])('%j', (c, want) => expect(describeCriterion(c)).toBe(want))
})

describe('записи в память', () => {
  it('конструкторы операций', () => {
    expect(set('a', 1)).toEqual({ key: 'a', op: '=', value: 1 })
    expect(add('a')).toEqual({ key: 'a', op: '+', value: 1 })
    expect(add('a', 3, { scope: 'target', delay: 2 })).toEqual({ key: 'a', op: '+', value: 3, scope: 'target', delay: 2 })
    expect(mul('a', 2)).toEqual({ key: 'a', op: '*', value: 2 })
    expect(invert('a')).toEqual({ key: 'a', op: '!' })
    expect(during('wedding', 5)).toEqual({ key: 'wedding', op: '=', value: true, forDays: 5, scope: undefined })
    expect(during('sick', 3, 'yes', 'target')).toMatchObject({ value: 'yes', scope: 'target', forDays: 3 })
  })
})

describe('watchFactKeys', () => {
  it('ловит ключи условий и записей; null снимает сторож', () => {
    const seen: string[] = []
    watchFactKeys((k) => seen.push(k))
    is('sick')
    set('heat', 1)
    during('wedding', 2)
    exists('arc.boris')
    ne('blocked', true)
    add('count.rude')
    watchFactKeys(null)
    is('ignored')
    expect(seen).toEqual(['sick', 'heat', 'wedding', 'arc.boris', 'blocked', 'count.rude'])
  })
})
