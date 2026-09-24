// Дрейф списка RARE: запись, которая срабатывает во ВСЕХ выборках, больше не редкая, и исключение
// пора убрать — иначе гейт покрытия перестаёт её сторожить. Запуск: `npm run rules:stable`
// (в обычном `npm test` тот же критерий уже в tools.test.ts через multiSampleCoverage).
import { describe, it, expect } from 'vitest'
import { multiSampleCoverage } from './coverage'

describe.runIf(process.env.RULES_STABLE)('дрейф RARE', () => {
  it('ни одна запись RARE не срабатывает во всех выборках', async () => {
    const r = await multiSampleCoverage()
    expect(r.rareStale).toEqual([])
  }, 900_000)
})
