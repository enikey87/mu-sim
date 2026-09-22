// Инструменты автора: линтер правил и покрытие. Эти тесты не дают контенту тихо сломаться.
import { describe, it, expect } from 'vitest'
import { lintRules, type Rule } from '../engine/rules'
import { allRules } from '../content/rules'
import { isMemKey } from '../content/memkeys'
import { ruleCoverage, formatCoverage, neverClass } from './coverage'

describe('линтер правил', () => {
  it('в игре нет правил, которые никогда не могут победить, и правил без ответа', () => {
    expect(lintRules(allRules, ['BuildChoices'], { keyCheck: isMemKey })).toEqual([])
  })
  it('находит перекрытое правило и правило без ответа', () => {
    const rules: Rule<unknown>[] = [
      { name: 'Wide', event: 'E', when: [], bonus: 2, respond: () => {} },
      { name: 'Narrow', event: 'E', when: [{ key: 'x', op: '==', value: 1 }], respond: () => {} },
      { name: 'Empty', event: 'F', when: [] },
    ]
    const issues = lintRules(rules)
    expect(issues).toContainEqual(expect.objectContaining({ rule: 'Narrow', kind: 'shadowed' }))
    expect(issues).toContainEqual(expect.objectContaining({ rule: 'Empty', kind: 'no-effect' }))
  })
})

// Редкие правила: срабатывают только при особых сочетаниях, которые бот за разумное время не собирает


describe('покрытие правил', () => {
  it('за 16 партий (2 — с грубым игроком) срабатывают все правила, кроме заведомо редких', async () => {
    const r = await ruleCoverage([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 500, undefined, 2, { freeText: 0.15 })
    if (process.env.RULES_REPORT) process.stdout.write('\n' + formatCoverage(r) + '\n')
    // Классы «не сработало» и их прямые тесты — в coverage.ts; здесь только требование, чтобы необъяснённых не было.
    expect(r.never.filter((n) => neverClass(n) === 'unexplained')).toEqual([])
  }, 300_000)
})
