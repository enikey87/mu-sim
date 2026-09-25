// Второе мнение о гейте: `npm run rules:stable` (не в обычном `npm test`) гоняет ту же проверку на других
// сидах — трижды. Если правило без прямого случая здесь не срабатывает, его место в direct.ts, а не удача CI.
import { describe, it, expect } from 'vitest'
import { COVERAGE_SAMPLES, multiSampleCoverage, gateIssues } from './coverage'
import { allRules } from '../content/rules'

describe.runIf(process.env.RULES_STABLE)('гейт на других сидах', () => {
  it('правила без прямого случая срабатывают на трёх чужих семействах сидов', async () => {
    for (const shift of [2000, 4000, 6000]) {
      const samples = COVERAGE_SAMPLES.map((s) => ({ ...s, seeds: s.seeds.map((x) => x + shift) }))
      const r = await multiSampleCoverage(samples)
      process.stdout.write(`\n# сдвиг сидов +${shift}: never ${r.never.join(', ') || '(none)'}\n`)
      expect(gateIssues(r.samples, allRules), `+${shift}`).toEqual([])
    }
  }, 3_600_000)
})
