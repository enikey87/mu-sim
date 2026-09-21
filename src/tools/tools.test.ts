// Инструменты автора: линтер правил и покрытие. Эти тесты не дают контенту тихо сломаться.
import { describe, it, expect } from 'vitest'
import { lintRules, type Rule } from '../engine/rules'
import { allRules } from '../content/rules'
import { ruleCoverage, formatCoverage } from './coverage'
import { RARE } from './rare'
import { rudeRules, rudeSaysRules } from '../content/rules/rude'
import { endgameRules } from '../content/rules/endgame'

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


describe('покрытие правил', () => {
  it('за 10 партий (2 — с грубым игроком) срабатывают все правила, кроме заведомо редких', async () => {
    const r = await ruleCoverage([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 500, undefined, 2)
    if (process.env.RULES_REPORT) process.stdout.write('\n' + formatCoverage(r) + '\n')
    // Ветки по стилю и post-payday проверяются детерминированно в finales, rude, dialog и endgame тестах.
    const deterministic = new Set([...rudeRules, ...rudeSaysRules, ...endgameRules].map((x) => x.name).concat('Opt_Via_boris', 'Opt_Via_karine', 'Opt_Via_mama', 'Opt_Moo'))
    expect(r.never.filter((n) => !RARE.has(n) && !deterministic.has(n) && !/^(Finale|Ending|Payday|Quiet)_/.test(n))).toEqual([])
  }, 300_000)
})
