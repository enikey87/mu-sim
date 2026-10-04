// Второе мнение о гейте: три других семейства сидов дают один вердикт для каждого правила.
import { describe, it, expect } from 'vitest'
import { COVERAGE_SAMPLES, multiSampleCoverage, stableGateIssues } from './coverage'
import { allRules } from '../content/rules'

describe.runIf(process.env.RULES_STABLE)('гейт на других сидах', () => {
  it('правила без прямого случая срабатывают на трёх чужих семействах сидов', async () => {
    const families = []
    for (const shift of [2000, 4000, 6000]) {
      const samples = COVERAGE_SAMPLES.map((s) => ({ ...s, seeds: s.seeds.map((x) => x + shift) }))
      const r = await multiSampleCoverage(samples)
      process.stdout.write(`\n# сдвиг сидов +${shift}: never ${r.never.join(', ') || '(none)'}\n`)
      families.push({ shift, samples: r.samples })
    }
    expect(stableGateIssues(families, allRules)).toEqual([])
  }, 3_600_000)
})
