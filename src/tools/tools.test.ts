// Инструменты автора: линтер правил и покрытие. Эти тесты не дают контенту тихо сломаться.
import { describe, it, expect } from 'vitest'
import { lintRules, type Rule } from '../engine/rules'
import { allRules } from '../content/rules'
import { isFactKey } from '../content/factkeys'
import {
  multiSampleCoverage, formatCoverage, neverClass, neverInAllSamples, exemptionIssues, fragile, COMMON_GAMES, COVERAGE_SAMPLES,
} from './coverage'
import { PROVEN } from './proven'
import { RARE } from './rare'

describe('линтер правил', () => {
  it('в игре нет правил, которые никогда не могут победить, и правил без ответа', () => {
    expect(lintRules(allRules, ['BuildChoices'], { keyCheck: isFactKey })).toEqual([])
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

describe('полоса исключений — по живым выборкам', () => {
  it('недостижимость — только пересечение never по выборкам', () => {
    // правило выпало из одной выборки (шум) — гейт молчит; из всех — падает
    expect(neverInAllSamples([['A', 'B'], ['B', 'C'], ['B']])).toEqual(['B'])
    expect(neverInAllSamples([['A'], ['B'], ['C']])).toEqual([])
  })
  const live = (full: Record<string, number>[], main: Record<string, number>[]) => [
    ...full.map((games) => ({ kind: 'full' as const, games })), ...main.map((games) => ({ kind: 'main' as const, games })),
  ]
  const names = ['Often', 'Rare', 'Gone', 'MainOnly']
  // партии, в которых правило сработало: Often — 22 из 120, MainOnly — 20 (только main), Rare — 4, Gone — 0
  const samples = live(
    [{ Often: 5, Rare: 1 }, { Often: 3, Rare: 0 }, { Often: 4, Rare: 2 }],
    [{ Often: 4, MainOnly: 7 }, { Often: 3, Rare: 1, MainOnly: 6 }, { Often: 3, MainOnly: 7 }],
  )
  it('исключение красное от COMMON_GAMES партий, а не от суммы срабатываний', () => {
    expect(COMMON_GAMES).toBe(20)
    expect(exemptionIssues(samples, new Set(['Often', 'Rare', 'Gone']), new Set(['MainOnly']), names)).toEqual([
      expect.stringMatching(/^Often: в RARE, а стенд доходит в 22 партиях \(full 5\/3\/4 · main 4\/3\/3\)/),
      expect.stringMatching(/^MainOnly: в PROVEN, а стенд доходит в 20 партиях/),
    ])
    // на одну партию ниже порога — полоса: список не мигает от одной партии
    expect(exemptionIssues(live([{ X: 7 }, { X: 6 }, { X: 6 }], [{}, {}, {}]), new Set(['X']), new Set(), ['X'])).toEqual([])
    // пачка срабатываний в одной партии — всё ещё одна партия
    expect(exemptionIssues(live([{ X: 1 }], []), new Set(['X']), new Set(), ['X'])).toEqual([])
  })
  it('запись без правила — красное в обоих списках', () => {
    expect(exemptionIssues(samples, new Set(['Ghost']), new Set(['Phantom']), names)).toEqual([
      expect.stringMatching(/^Ghost: в RARE, а такого правила нет/), expect.stringMatching(/^Phantom: в PROVEN, а такого правила нет/),
    ])
  })
  it('на грани — правило под гейтом, которое держится на одной партии', () => {
    expect(fragile(live([{ A: 1 }, {}, {}], [{}, { B: 1 }, { B: 2 }]), ['A', 'B', 'C'])).toEqual(['A'])
  })
  it('выборки гейта: два рода, сиды не пересекаются, main — до экрана концовки', () => {
    expect(COVERAGE_SAMPLES.filter((s) => s.kind === 'full')).toHaveLength(3)
    expect(COVERAGE_SAMPLES.filter((s) => s.kind === 'main')).toHaveLength(3)
    const all = COVERAGE_SAMPLES.flatMap((s) => s.seeds)
    expect(new Set(all).size).toBe(all.length)
  })
  it('классы never — только rare / proven / unexplained; префикс не освобождает', () => {
    expect(neverClass('Tone_Cow')).toBe('rare')
    expect(neverClass('Quiet_PhoneKarine_AlikAway')).toBe('proven')
    expect(neverClass('Quiet_BrandNew')).toBe('unexplained')
    expect(neverClass('Finale_made_up')).toBe('unexplained')
  })
  it('RARE и PROVEN ⊆ allRules, пересечения нет', () => {
    const names = new Set(allRules.map((r) => r.name))
    expect([...RARE].filter((n) => !names.has(n))).toEqual([])
    expect([...PROVEN].filter((n) => !names.has(n))).toEqual([])
    expect([...RARE].filter((n) => PROVEN.has(n))).toEqual([])
  })
})

// Редкие правила: срабатывают только при особых сочетаниях, которые бот за разумное время не собирает

describe('покрытие правил', () => {
  it(`за ${COVERAGE_SAMPLES.length} непересекающихся выборок (${COVERAGE_SAMPLES.filter((s) => s.kind === 'main').length} — до концовки) срабатывают все правила, кроме исключений, а исключения — по полосе`, async () => {
    const r = await multiSampleCoverage()
    const names = allRules.map((x) => x.name)
    if (process.env.RULES_REPORT) {
      for (const [i, s] of r.samples.entries()) process.stdout.write(`\n# sample ${i} (${s.kind})\n` + formatCoverage(s) + '\n')
      process.stdout.write(`\nunion never: ${r.never.join(', ') || '(none)'}\n`)
      process.stdout.write(`на грани (одна выборка): ${fragile(r.samples, names).join(', ') || '(none)'}\n`)
    }
    // Классы «не сработало» и их прямые тесты — в coverage.ts: необъяснённых быть не должно.
    expect(r.never.filter((n) => neverClass(n) === 'unexplained')).toEqual([])
    // списки — по тем же выборкам: RARE, до которого стенд доходит всегда, и PROVEN, до которого дошёл, — красные
    expect(exemptionIssues(r.samples, RARE, PROVEN, names)).toEqual([])
  }, 900_000)
})
