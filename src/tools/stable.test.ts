// Широкий замер покрытия: `npm run rules:stable` (≈5 минут, не в обычном `npm test`).
// 10 пакетов по 16 партий (три — те же, что у гейта CI) → tools/coverage-measure.json. По замеру
// tools.test.ts решает, кому место в исключениях гейта (RARE, PROVEN); здесь та же сверка — на свежих данных.
// Замер перезаписывается при каждом запуске: закоммитьте его вместе с правкой RARE / PROVEN.
import { writeFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { COVERAGE_SAMPLES, ruleCoverage, exemptionIssues, type Measure } from './coverage'
import { RARE } from './rare'
import { PROVEN } from './proven'
import { allRules } from '../content/rules'

const PACKS: number[][] = [
  ...COVERAGE_SAMPLES,
  ...Array.from({ length: 7 }, (_, p) => Array.from({ length: 16 }, (_, i) => 301 + p * 100 + i)),
]

describe.runIf(process.env.RULES_STABLE)('широкий замер покрытия', () => {
  it('исключения гейта совпадают со свежим замером', async () => {
    const m: Measure = { packs: PACKS, rules: {} }
    for (const [p, seeds] of PACKS.entries()) {
      const r = await ruleCoverage(seeds, 500, undefined, 2, { freeText: 0.15 })
      for (const n of [...Object.keys(r.fired), ...r.never]) (m.rules[n] ??= Array(PACKS.length).fill(0))[p] = r.fired[n] ?? 0
    }
    const rules = Object.fromEntries(Object.entries(m.rules).sort(([a], [b]) => a.localeCompare(b)))
    writeFileSync('src/tools/coverage-measure.json', `{\n  "packs": ${JSON.stringify(PACKS)},\n  "rules": {\n${Object.entries(rules).map(([n, v]) => `    ${JSON.stringify(n)}: ${JSON.stringify(v)}`).join(',\n')}\n  }\n}\n`)
    expect(exemptionIssues({ packs: PACKS, rules }, new Set([...RARE, ...Object.keys(PROVEN)]), allRules.map((r) => r.name))).toEqual([])
  }, 3_600_000)
})
