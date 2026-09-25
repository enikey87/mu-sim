// Второе мнение о полосе исключений: `npm run rules:stable` (не в обычном `npm test`) гоняет ту же сверку,
// что и гейт, на других сидах — трижды. Запись, которую хочется снять или добавить, должна пройти и здесь:
// иначе список подстроен под одну выборку CI.
import { describe, it, expect } from 'vitest'
import { COVERAGE_SAMPLES, multiSampleCoverage, exemptionIssues, fragile, neverClass } from './coverage'
import { RARE } from './rare'
import { PROVEN } from './proven'
import { allRules } from '../content/rules'

describe.runIf(process.env.RULES_STABLE)('полоса исключений на других сидах', () => {
  it('исключения гейта держатся на трёх чужих семействах сидов', async () => {
    const names = allRules.map((r) => r.name)
    for (const shift of [2000, 4000, 6000]) {
      const samples = COVERAGE_SAMPLES.map((s) => ({ ...s, seeds: s.seeds.map((x) => x + shift) }))
      const r = await multiSampleCoverage(samples)
      process.stdout.write(`\n# сдвиг сидов +${shift}: never ${r.never.join(', ') || '(none)'}; на грани: ${fragile(r.samples, names).join(', ') || '(none)'}\n`)
      expect(r.never.filter((n) => neverClass(n) === 'unexplained'), `+${shift}`).toEqual([])
      expect(exemptionIssues(r.samples, RARE, PROVEN, names), `+${shift}`).toEqual([])
    }
  }, 3_600_000)
})
