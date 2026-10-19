// Второе мнение о гейте: три других семейства сидов дают один вердикт для каждого правила.
// Здесь же сходятся обе части единого условия освобождения от DIRECT (#1100): CI-выборки и семьи.
import { describe, it, expect } from 'vitest'
import { COVERAGE_SAMPLES, gateIssues, multiSampleCoverage, stableGateIssues } from './coverage'
import { allRules } from '../content/rules'
import { DIRECT } from './direct'

describe.runIf(process.env.RULES_STABLE)('гейт на других сидах', () => {
  it('страховка держится на чужих семействах, освобождение от DIRECT доказано везде (#1100)', async () => {
    const base = await multiSampleCoverage(COVERAGE_SAMPLES)
    process.stdout.write(`\n# CI-выборки: never ${base.never.join(', ') || '(none)'}\n`)
    const families = []
    for (const shift of [2000, 4000, 6000]) {
      const samples = COVERAGE_SAMPLES.map((s) => ({ ...s, seeds: s.seeds.map((x) => x + shift) }))
      const r = await multiSampleCoverage(samples)
      process.stdout.write(`\n# сдвиг сидов +${shift}: never ${r.never.join(', ') || '(none)'}\n`)
      families.push({ shift, samples: r.samples })
    }
    // единое условие (#1100): снять запись можно, только когда CI-порог взят и ни в одной семье нет нуля
    expect(gateIssues(base.samples, allRules, DIRECT, families)).toEqual([])
    // второй гейт — только страховка: ноль в семье у правила без прямого случая
    expect(stableGateIssues(families, allRules)).toEqual([])
  }, 3_600_000)
})
