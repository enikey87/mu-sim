// Настоящие партии ботом: гейт покрытия (#278) и живые таймеры баннера (#288).
// Вынесено из tools.test.ts отдельным файлом (#CI): на 4 ядрах гейт занимает почти столько же,
// сколько весь остальной набор (98s из 131s), и в CI он идёт своим job'ом параллельно остальным.
// Синтетические проверки гейта (семейства сидов, классы never, DIRECT) остались в tools.test.ts.
import { describe, it, expect } from 'vitest'
import { availableParallelism } from 'node:os'
import { multiSampleCoverage, formatCoverage, gateIssues, ruleCoverage, COVERAGE_SAMPLES } from './coverage'
import { allRules } from '../content/rules'
import { wallClock } from '../engine/clock'

describe('покрытие правил: настоящие партии', () => {
  // ВРЕМЕННАЯ ДИАГНОСТИКА PR-а: сколько ядер видит раннер
  it('diagnostic: parallelism', () => { console.log(`DIAG cores=${availableParallelism()}`) })
  it(`за ${COVERAGE_SAMPLES.length} непересекающихся выборок (${COVERAGE_SAMPLES.filter((s) => s.kind === 'main').length} — до концовки) срабатывают все правила без прямого случая`, async () => {
    const r = await multiSampleCoverage()
    if (process.env.RULES_REPORT) {
      for (const [i, s] of r.samples.entries()) process.stdout.write(`\n# sample ${i} (${s.kind})\n` + formatCoverage(s) + '\n')
      process.stdout.write(`\nunion never: ${r.never.join(', ') || '(none)'}\n`)
    }
    // правило без прямого случая обязано сработать хоть раз; основной игры — до концовки
    expect(gateIssues(r.samples, allRules)).toEqual([])
  }, 900_000)

  it('партии стенда не оставляют живых таймеров: баннер уведомления пережил бы прогон (#288)', async () => {
    const pending = new Set<unknown>()
    let banners = 0
    const set = wallClock.setTimeout.bind(wallClock)
    const clear = wallClock.clearTimeout.bind(wallClock)
    wallClock.setTimeout = (fn, ms) => {
      banners++
      const id = set(() => { pending.delete(id); fn() }, ms)
      pending.add(id)
      return id
    }
    wallClock.clearTimeout = (id) => { pending.delete(id); clear(id) }
    try {
      await ruleCoverage([7], 60, undefined, 0, { freeText: 0.2 })
    } finally {
      wallClock.setTimeout = set
      wallClock.clearTimeout = clear
    }
    expect(banners, 'баннеров не было — проверка была бы пустой').toBeGreaterThan(0)
    expect(pending.size, 'таймер баннера остался живым после прогона').toBe(0)
  }, 300_000)
})
