// Негативные контроли #258: опечатка в ключе факта — ошибка typecheck, не рантайм-сканер.
import { describe, it, expect } from 'vitest'
import type { Line } from './fact'
import { HEAT } from './memkeys'
import { eq, is, missing, gte, ne, exists, add, lte, sinceWithin, gate, named, type Criterion, type Rule } from './fact'
import type { Finale } from './finales'
import type { Episode } from './arcs'
import { meet, SPEAKS } from './world'
import type { Game } from '../engine/game'
import type { GameEvent } from './rules/events'

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
    // @ts-expect-error audit #221 / литерал в колоде
    const badLine: Line = { t: 'мимо конструктора', when: [{ key: 'blcoked', op: '!=', value: true }] }
    // @ts-expect-error литерал в gate
    gate({ key: 'blcoked', op: '!=', value: true })('мимо конструктора')
    // @ts-expect-error литерал внутри named/WORLD
    named('badWorld', { key: 'blcoked', op: '!=', value: true })
    // @ts-expect-error WORLD-образный реестр тоже контекстуализирует литерал узким Criterion
    const badWorld: Record<string, Criterion> = { bad: { key: 'blcoked', op: '!=', value: true } }
    // @ts-expect-error литерал в Finale.when
    const badFinale: Finale['when'] = [{ key: 'blcoked', op: '!=', value: true }]
    // @ts-expect-error литерал в Rule.when
    const badRule: Rule<Game, GameEvent>['when'] = [{ key: 'promiseLvie', op: '==', value: true }]
    // @ts-expect-error литерал в Rule.remember
    const badRemember: NonNullable<Rule<Game, GameEvent>['remember']> = [{ key: 'blcoked', op: '=', value: true }]
    // @ts-expect-error литерал в состоянии эпизода
    const badState: NonNullable<Episode['state']> = { key: 'blcoked', op: '=', value: true }
    // @ts-expect-error ключ SPEAKS — WhoId, опечатка не получает string-index
    void SPEAKS.bors
    // @ts-expect-error meet принимает только WhoId
    meet('arsne')
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
    expect([badLine, badWorld, badFinale, badRule, badRemember, badState]).toHaveLength(6)
  })
})
