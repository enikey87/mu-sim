import { describe, it, expect } from 'vitest'
import { Groups } from './groups'
import { seededRng } from '../rng'
import type { GroupState } from './types'

const mk = (state: Record<string, GroupState> = {}, seed = 1) => ({ state, g: new Groups(state, seededRng(seed)) })

describe('группы ответов', () => {
  it('shuffle: каждый элемент раз за цикл, на стыке циклов без повтора', () => {
    const { g } = mk()
    const items = ['a', 'b', 'c']
    let prev: string | null = null
    for (let cycle = 0; cycle < 60; cycle++) {
      const got = items.map(() => g.next('k', items)!)
      expect([...got].sort()).toEqual(items)
      expect(got[0]).not.toBe(prev)
      prev = got[2]
    }
  })
  it('один элемент — всегда он', () => {
    const { g } = mk()
    for (let i = 0; i < 5; i++) expect(g.next('one', ['x'])).toBe('x')
  })
  it('shuffle + noRepeat: после исчерпания — null (и после перезагрузки тоже)', () => {
    const { g, state } = mk()
    expect(g.next('k', [1, 2], { noRepeat: true })).not.toBeNull()
    expect(g.next('k', [1, 2], { noRepeat: true })).not.toBeNull()
    expect(g.next('k', [1, 2], { noRepeat: true })).toBeNull()
    expect(new Groups(state, seededRng(5)).next('k', [1, 2], { noRepeat: true })).toBeNull()
  })
  it('sequential: по порядку по кругу; с noRepeat — до конца и молчит', () => {
    const { g } = mk()
    expect([1, 2, 3, 4, 5].map(() => g.next('s', ['a', 'b', 'c'], { mode: 'sequential' }))).toEqual(['a', 'b', 'c', 'a', 'b'])
    expect([1, 2, 3].map(() => g.next('n', ['x', 'y'], { mode: 'sequential', noRepeat: true }))).toEqual(['x', 'y', null])
  })
  it('random: без состояния', () => {
    const { g, state } = mk()
    for (let i = 0; i < 20; i++) expect(['a', 'b']).toContain(g.next('r', ['a', 'b'], { mode: 'random' }))
    expect(state.r).toBeUndefined()
  })
  it('пустая группа — null; смена размера — новый цикл', () => {
    const { g } = mk()
    expect(g.next('e', [])).toBeNull()
    g.next('k', [1, 2, 3])
    expect([1, 2, 3, 4]).toContain(g.next('k', [1, 2, 3, 4]))
  })
  it('remaining: сколько осталось', () => {
    const { g } = mk()
    expect(g.remaining('x', 3)).toBe(3)
    g.next('x', [1, 2, 3])
    expect(g.remaining('x', 3)).toBe(2)
    expect(g.remaining('x', 4)).toBe(4) // другой размер — как новая
    g.next('s', [1, 2, 3], { mode: 'sequential' })
    expect(g.remaining('s', 3, 'sequential')).toBe(2)
    expect(g.remaining('fresh', 2, 'sequential')).toBe(2)
    const st: Record<string, GroupState> = { y: { n: 2, left: null, last: -1 } }
    expect(new Groups(st, seededRng(1)).remaining('y', 2)).toBe(2)
    expect(new Groups({ z: { n: 2, left: null, last: -1 } }, seededRng(1)).remaining('z', 2, 'sequential')).toBe(2)
  })
})
