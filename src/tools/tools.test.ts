// Инструменты автора: линтер правил и покрытие. Эти тесты не дают контенту тихо сломаться.
import { describe, it, expect } from 'vitest'
import { lintRules, type Rule } from '../engine/rules'
import { allRules } from '../content/rules'
import { isFactKey } from '../content/factkeys'
import {
  multiSampleCoverage, formatCoverage, neverClass, neverInAllSamples, rareReached, COVERAGE_SAMPLES,
} from './coverage'

describe('линтер правил', () => {
  it('в игре нет правил, которые никогда не могут победить, и правил без ответа', () => {
    expect(lintRules(allRules, ['BuildChoices'], { keyCheck: isFactKey })).toEqual([])
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
  it('RARE — только то, до чего не дошла ни одна выборка', () => {
    // «X» сработало хоть где-то — стенд дошёл, записи место в FLAKY; «Y» нет ни в одной — законная запись
    expect(rareReached(['Y'], ['X', 'Y'])).toEqual(['X'])
    expect(rareReached(['X', 'Y'], ['X', 'Y'])).toEqual([])
  })
})

// Редкие правила: срабатывают только при особых сочетаниях, которые бот за разумное время не собирает

describe('покрытие правил', () => {
  it(`за ${COVERAGE_SAMPLES.length} непересекающихся выборок срабатывают все правила, кроме заведомо редких; RARE ⊆ never`, async () => {
    const r = await multiSampleCoverage()
    if (process.env.RULES_REPORT) {
      for (const [i, s] of r.samples.entries()) process.stdout.write(`\n# sample ${i}\n` + formatCoverage(s) + '\n')
      process.stdout.write(`\nunion never: ${r.never.join(', ') || '(none)'}\nrareReached: ${r.rareReached.join(', ') || '(none)'}\n`)
    }
    // Классы «не сработало» и их прямые тесты — в coverage.ts: необъяснённых быть не должно.
    expect(r.never.filter((n) => neverClass(n) === 'unexplained')).toEqual([])
    // И обратно: правило, до которого стенд дошёл, не прячется в RARE
    expect(r.rareReached).toEqual([])
  }, 900_000)
})
