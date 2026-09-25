// Негативные контроли #258: опечатка в ключе факта — ошибка typecheck, не рантайм-сканер.
import { describe, it, expect } from 'vitest'
import type { Criterion } from '../engine/rules'
import type { FactKey } from './factkeys'
import { HEAT } from './memkeys'
import { eq, is, missing, gte, ne, exists, add, lte, sinceWithin } from './typed-criteria'

/** Литерал условия должен нести FactKey — иначе сырой `{ key: 'blcoked' }` проходит. */
const factCrit = (c: { key: FactKey } & Omit<Criterion, 'key'>): Criterion => c

describe('FactKey: опечатки не компилируются', () => {
  it('конструкторы и литералы — @ts-expect-error на каждую опечатку из аудитов', () => {
    // @ts-expect-error audit #131
    is('ach.q_hsah')
    // @ts-expect-error audit #131
    missing('ach.rdeo')
    // @ts-expect-error audit #131
    gte('arc.betno', 1)
    // @ts-expect-error audit #206
    is('payday.chian')
    // @ts-expect-error audit #218
    eq('promiseLvie', true)
    // @ts-expect-error audit #221 / колода
    factCrit({ key: 'blcoked', op: '!=', value: true })
    // @ts-expect-error since.daed
    gte('since.daed', 1)
    // @ts-expect-error верхняя граница since.* только через sinceWithin
    lte('since.dead', 3)
    // живые ключи компилируются
    expect(is('blocked').key).toBe('blocked')
    expect(ne('offline', true).key).toBe('offline')
    expect(exists('promiseLive').key).toBe('promiseLive')
    expect(add(HEAT).key).toBe('rude.heat')
    expect(sinceWithin('dead', 3).map((c) => c.key)).toEqual(['since.dead', 'since.dead'])
  })
})
