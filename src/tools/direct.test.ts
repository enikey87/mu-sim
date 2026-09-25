// Каждый прямой случай гейта покрытия — свой тест: сломал правило — красный именно он (#278).
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { allRules } from '../content/rules'
import { DIRECT, type DirectCase } from './direct'

/** Срабатывает ли правило (у многих есть шанс — пробуем на разных сидах). */
function fires(name: string, c: DirectCase): boolean {
  for (let seed = 1; seed <= 40; seed++) {
    const { game } = makeGame({ seed })
    c.setup?.(game)
    if (c.event === 'BuildChoices') {
      if (game.rules.collect({ event: c.event }, game.facts()).some((r) => r.name === name)) return true
      continue
    }
    const r = game.rules.match({ event: c.event, target: c.target, facts: c.facts ?? {} }, game.facts(c.facts ?? {}))
    if (r?.name === name) return true
  }
  return false
}

describe('прямые случаи гейта покрытия', () => {
  for (const [name, c] of Object.entries(DIRECT)) it(name, () => { expect(fires(name, c)).toBe(true) })

  it('случай — про существующее правило', () => {
    const names = new Set(allRules.map((r) => r.name))
    expect(Object.keys(DIRECT).filter((n) => !names.has(n))).toEqual([])
  })
  // issue #102: Quiet_*_PromiseConditionMet были недостижимы — удалены, а не «освобождены»
  it('Quiet_*_PromiseConditionMet нет в правилах', () => {
    expect(allRules.filter((r) => /^Quiet_.*_PromiseConditionMet$/.test(r.name)).map((r) => r.name)).toEqual([])
  })
})
