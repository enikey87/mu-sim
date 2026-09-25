// Инструменты автора: линтер правил и покрытие. Эти тесты не дают контенту тихо сломаться.
import { describe, it, expect } from 'vitest'
import { lintRules, type Rule } from '../engine/rules'
import { allRules } from '../content/rules'
import { isFactKey } from '../content/factkeys'
import { multiSampleCoverage, formatCoverage, neverClass, neverInAllSamples, gateIssues, endgameOnly, COVERAGE_SAMPLES } from './coverage'
import { DIRECT } from './direct'
import { is } from '../content/fact'
import { endgame } from '../content/memkeys'

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

describe('гейт покрытия: сработало хоть раз (#278)', () => {
  it('недостижимость в отчёте — пересечение never по выборкам', () => {
    expect(neverInAllSamples([['A', 'B'], ['B', 'C'], ['B']])).toEqual(['B'])
    expect(neverInAllSamples([['A'], ['B'], ['C']])).toEqual([])
  })
  const sample = (kind: 'full' | 'main', fired: Record<string, number>) => ({ kind, fired })
  const rule = (name: string, late = false) => ({ name, when: late ? [is(endgame.active)] : [] })
  it('одно срабатывание в одной выборке — достижимо; частота не красит', () => {
    const s = [sample('main', { Once: 1, Often: 900 }), sample('main', {}), sample('full', { Often: 900 })]
    expect(gateIssues(s, [rule('Once'), rule('Often')], {})).toEqual([])
  })
  it('недостижимое правило без прямого случая — красное; со случаем — нет', () => {
    const s = [sample('main', {}), sample('full', {})]
    expect(gateIssues(s, [rule('Dead')], {})).toEqual([expect.stringMatching(/^Dead: ни разу до экрана концовки/)])
    expect(gateIssues(s, [rule('Dead')], { Dead: {} })).toEqual([])
  })
  it('правило основной игры обязано сработать до концовки: полная выборка его не спасает', () => {
    const s = [sample('main', {}), sample('full', { Late: 5 })]
    expect(gateIssues(s, [rule('Late')], {})).toEqual([expect.stringMatching(/^Late: ни разу до экрана концовки/)])
    // правило эндгейма (условие требует endgame.active) — по всем выборкам
    expect(gateIssues(s, [rule('Late', true)], {})).toEqual([])
    expect(gateIssues([sample('main', {}), sample('full', {})], [rule('Late', true)], {})).toEqual([expect.stringMatching(/^Late: правило эндгейма/)])
  })
  it('правило эндгейма — по условию, а не по имени', () => {
    expect(allRules.filter(endgameOnly).map((r) => r.name)).toContain('Endgame_Idle')
    expect(allRules.filter(endgameOnly).map((r) => r.name)).toContain('Lend50_yes')
    expect(endgameOnly({ when: [] })).toBe(false)
  })
  it('выборки гейта: два рода, сиды не пересекаются, main — до экрана концовки', () => {
    expect(COVERAGE_SAMPLES.filter((s) => s.kind === 'full')).toHaveLength(3)
    expect(COVERAGE_SAMPLES.filter((s) => s.kind === 'main')).toHaveLength(3)
    const all = COVERAGE_SAMPLES.flatMap((s) => s.seeds)
    expect(new Set(all).size).toBe(all.length)
  })
  it('классы never — только direct / unexplained; префикс не освобождает', () => {
    expect(neverClass('Tone_Cow')).toBe('direct')
    expect(neverClass('Quiet_PhoneKarine_AlikAway')).toBe('direct')
    expect(neverClass('Quiet_BrandNew')).toBe('unexplained')
    expect(Object.keys(DIRECT).length).toBeGreaterThan(0)
  })
})

// Редкие правила: срабатывают только при особых сочетаниях, которые бот за разумное время не собирает

describe('покрытие правил', () => {
  it(`за ${COVERAGE_SAMPLES.length} непересекающихся выборок (${COVERAGE_SAMPLES.filter((s) => s.kind === 'main').length} — до концовки) срабатывают все правила без прямого случая`, async () => {
    const r = await multiSampleCoverage()
    if (process.env.RULES_REPORT) {
      for (const [i, s] of r.samples.entries()) process.stdout.write(`\n# sample ${i} (${s.kind})\n` + formatCoverage(s) + '\n')
      process.stdout.write(`\nunion never: ${r.never.join(', ') || '(none)'}\n`)
    }
    // правило без прямого случая обязано сработать хоть раз; основной игры — до концовки
    expect(gateIssues(r.samples, allRules)).toEqual([])
  }, 900_000)
})
