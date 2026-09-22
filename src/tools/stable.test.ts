// Дрейф списка RARE: запись, которая срабатывает во ВСЕХ выборках, больше не редкая, и исключение
// пора убрать — иначе гейт покрытия перестаёт её сторожить. Запуск: `npm run rules:stable`
// (в обычном `npm test` файл пропускается: это три полных прогона симуляции).
import { describe, it, expect } from 'vitest'
import { ruleCoverage } from './coverage'
import { RARE } from './rare'

/** Выборки не пересекаются: по одной не отличить покрытие от удачи траектории. */
const SAMPLES: number[][] = [
  Array.from({ length: 16 }, (_, i) => i + 1),
  Array.from({ length: 16 }, (_, i) => i + 101),
  Array.from({ length: 16 }, (_, i) => i + 201),
]

describe.runIf(process.env.RULES_STABLE)('дрейф RARE', () => {
  it('ни одна запись RARE не срабатывает во всех выборках', async () => {
    const firedIn: Record<string, number> = {}
    for (const seeds of SAMPLES) {
      const r = await ruleCoverage(seeds, 500, undefined, 2, { freeText: 0.15 })
      const never = new Set(r.never)
      for (const name of RARE) if (!never.has(name)) firedIn[name] = (firedIn[name] ?? 0) + 1
    }
    expect([...RARE].filter((n) => (firedIn[n] ?? 0) === SAMPLES.length)).toEqual([])
  }, 600_000)
})
