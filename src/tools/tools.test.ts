// Инструменты автора: линтер правил и покрытие. Эти тесты не дают контенту тихо сломаться.
import { describe, it, expect } from 'vitest'
import { lintRules, type Rule } from '../engine/rules'
import { allRules } from '../content/rules'
import { ruleCoverage, formatCoverage } from './coverage'
import { rudeRules, rudeSaysRules } from '../content/rules/rude'

describe('линтер правил', () => {
  it('в игре нет правил, которые никогда не могут победить, и правил без ответа', () => {
    expect(lintRules(allRules, ['BuildChoices'])).toEqual([])
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
const RARE = new Set(['Due_Cosmic', 'Tone_Threat_Again', 'Tone_Cow', 'Says_catchLie_liekind_grandpa', 'Says_catchLie_caught3', 'Says_catchLie_caught2', 'Says_condole_ctxrevived'])

describe('покрытие правил', () => {
  it('за 10 партий (2 — с грубым игроком) срабатывают все правила, кроме заведомо редких', async () => {
    const r = await ruleCoverage([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 400, undefined, 2)
    if (process.env.RULES_REPORT) process.stdout.write('\n' + formatCoverage(r) + '\n')
    // финалы, концовки и лестница грубости зависят от стиля игры (одно извинение сбрасывает ссору) —
    // их проверяют отдельные детерминированные тесты: finales.test.ts, rude.test.ts
    const ladder = new Set([...rudeRules, ...rudeSaysRules].map((x) => x.name).concat('Opt_ViaBoris', 'Opt_Moo'))
    expect(r.never.filter((n) => !RARE.has(n) && !ladder.has(n) && !/^(Finale|Ending)_/.test(n))).toEqual([])
  }, 300_000)
})
