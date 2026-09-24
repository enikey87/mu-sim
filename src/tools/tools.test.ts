// Инструменты автора: линтер правил и покрытие. Эти тесты не дают контенту тихо сломаться.
import { describe, it, expect } from 'vitest'
import { lintRules, type Rule } from '../engine/rules'
import { allRules } from '../content/rules'
import { isMemKey } from '../content/memkeys'
import {
  multiSampleCoverage, formatCoverage, neverClass, neverInAllSamples, staleRare, COVERAGE_SAMPLES,
} from './coverage'

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

describe('гистерезис покрытия', () => {
  it('недостижимость — только пересечение never по выборкам', () => {
    // правило выпало из одной выборки (шум) — гейт молчит; из всех — падает
    expect(neverInAllSamples([['A', 'B'], ['B', 'C'], ['B']])).toEqual(['B'])
    expect(neverInAllSamples([['A'], ['B'], ['C']])).toEqual([])
  })
  it('протухание RARE — сработало во всех выборках, а не в одной', () => {
    expect(staleRare({ X: 3, Y: 1 }, 3, ['X', 'Y', 'Z'])).toEqual(['X'])
    expect(staleRare({ Y: 2 }, 3, ['Y'])).toEqual([])
  })
})

// Редкие правила: срабатывают только при особых сочетаниях, которые бот за разумное время не собирает

describe('покрытие правил', () => {
  it(`за ${COVERAGE_SAMPLES.length} непересекающихся выборок срабатывают все правила, кроме заведомо редких; RARE не протух`, async () => {
    const r = await multiSampleCoverage()
    if (process.env.RULES_REPORT) {
      for (const [i, s] of r.samples.entries()) process.stdout.write(`\n# sample ${i}\n` + formatCoverage(s) + '\n')
      process.stdout.write(`\nunion never: ${r.never.join(', ') || '(none)'}\nrareStale: ${r.rareStale.join(', ') || '(none)'}\n`)
    }
    // Классы «не сработало» и их прямые тесты — в coverage.ts; здесь только требование, чтобы необъяснённых не было.
    expect(r.never.filter((n) => neverClass(n) === 'unexplained')).toEqual([])
    expect(r.rareStale).toEqual([])
  }, 900_000)
})
