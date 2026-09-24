// Реестр фактов и facts() не расходятся молча: переименованный факт — красный с обеих сторон.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { ARCS } from './arcs'
import { ACH } from './achievements'
import { EVENT_KEYS } from './memkeys'
import { CTX_KEYS, FAMILIES, HAS_KEYS, isFactKey } from './factkeys'

describe('ключи фактов', () => {
  it('под префиксом известен только элемент семейства', () => {
    for (const k of ['arc.boris', 'arc.done', 'ach.q_niva', 'since.dead', 'ctx.topic', 'has.boris', 'said.money_jar', 'caught.money_dubai|money_jar', 'intro.arsen', 'met.baran', 'finale.boris', 'legend.of.niva', 'wedding.samvel', 'topic.beton', 'inv.Валерьянка Алику']) expect(isFactKey(k), k).toBe(true)
    for (const k of ['since.daed', 'arc.borsi', 'ach.nope', 'ctx.topci', 'has.karine', 'said.money_jarr', 'caught.money_jar', 'caught.money_jar|nope', 'met.borris', 'finale.nope', 'topic.nope', 'inv.Воздух', 'wedding.crane', 'payday.chian', 'no.such.key']) expect(isFactKey(k), k).toBe(false)
  })

  it('facts() и реестр сверены в обе стороны', () => {
    const { game } = makeGame()
    for (const id of Object.keys(ARCS)) game.S.arcs[id] = { i: 1, last: 0 }
    for (const k of Object.keys(ACH)) game.S.ach[k] = game.S.day
    // без ручной подстановки intent/arg/… — facts() сам кладёт слоты события
    const produced = Object.keys(game.facts())
    expect(produced.filter((k) => !isFactKey(k)), 'facts() порождает ключ, которого реестр не знает').toEqual([])
    const set = new Set(produced)
    expect([...EVENT_KEYS].filter((k) => !set.has(k)), 'реестр знает факт, которого facts() не порождает').toEqual([])
    const family = (p: string) => produced.filter((k) => k.startsWith(p)).map((k) => k.slice(p.length)).sort()
    expect(family('ctx.')).toEqual([...CTX_KEYS].sort())
    expect(family('has.')).toEqual([...HAS_KEYS].sort())
    expect(family('ach.')).toEqual(Object.keys(ACH).sort())
    expect(family('since.')).toEqual(Object.keys(ACH).sort())
    expect(family('arc.')).toEqual([...Object.keys(ARCS), 'done'].sort())
    for (const p of Object.keys(FAMILIES)) expect(p.endsWith('.'), p).toBe(true)
  })
})
