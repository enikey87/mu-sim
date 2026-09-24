// Дрейф списка RARE: запись, до которой выборки всё-таки дошли, больше не редкая — её место
// в RARE_FLAKY (если редкая) или под сторожем. Запуск: `npm run rules:stable` (в обычном
// `npm test` тот же критерий уже в tools.test.ts через multiSampleCoverage).
import { describe, it, expect } from 'vitest'
import { multiSampleCoverage } from './coverage'

describe.runIf(process.env.RULES_STABLE)('дрейф RARE', () => {
  it('ни одна запись RARE не срабатывает в выборках', async () => {
    const r = await multiSampleCoverage()
    expect(r.rareReached).toEqual([])
  }, 900_000)
})
