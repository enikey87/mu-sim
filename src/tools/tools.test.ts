// Инструменты автора: линтер правил и покрытие. Эти тесты не дают контенту тихо сломаться.
import { describe, it, expect } from 'vitest'
import { lintRules, type Rule } from '../engine/rules'
import { allRules } from '../content/rules'
import { isFactKey } from '../content/factkeys'
import { multiSampleCoverage, runCoverageJobs, formatCoverage, neverClass, neverInAllSamples, gateIssues, stableGateIssues, endgameOnly, COVERAGE_SAMPLES, DIRECT_MIN_GAMES, type SampleReport, type SampleSpec } from './coverage'
import { DIRECT } from './direct'
import { is } from '../content/fact'
import { endgame } from '../content/memkeys'
import { wallClock } from '../engine/clock'
import { ruleCoverage } from './coverage'

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
  it('выборки стартуют вместе, возвращаются по порядку и не теряются', async () => {
    const specs: SampleSpec[] = [1, 2, 3].map((seed) => ({ kind: 'full', seeds: [seed], turns: 1, grumpy: 0 }))
    const complete: Array<(report: SampleReport) => void> = []
    const pending = runCoverageJobs(specs, () => new Promise((resolve) => complete.push(resolve)))
    expect(complete).toHaveLength(3)
    const report = (seed: number): SampleReport => ({
      kind: 'full', turns: seed, weighted: [], fired: {}, games: {}, never: seed === 2 ? ['B'] : ['A', 'B'], unsaid: [], events: {},
    })
    complete[2](report(3))
    complete[0](report(1))
    complete[1](report(2))
    const result = await pending
    expect(result.samples.map((s) => s.turns)).toEqual([1, 2, 3])
    expect(result.never).toEqual(['B'])
    await expect(runCoverageJobs([], async () => report(0))).rejects.toThrow('Нет выборок')
    await expect(multiSampleCoverage([])).rejects.toThrow('Нет выборок')
    await expect(runCoverageJobs(specs, async () => undefined as unknown as SampleReport)).rejects.toThrow()
    await expect(runCoverageJobs(specs, async () => { throw new Error('sample failed') })).rejects.toThrow('sample failed')
  })
  it('воркеры дают те же отчёты, что последовательные выборки', async () => {
    const specs: SampleSpec[] = [
      { kind: 'full', seeds: [7], turns: 12, grumpy: 0 },
      { kind: 'main', seeds: [103], turns: 12, grumpy: 0 },
    ]
    const parallel = await multiSampleCoverage(specs, { freeText: 0.15 })
    const serial = await Promise.all(specs.map(async (s) => ({
      ...await ruleCoverage(s.seeds, s.turns, undefined, s.grumpy, { freeText: 0.15, untilEnding: s.kind === 'main' }), kind: s.kind,
    })))
    expect(parallel.samples).toEqual(serial)
    expect(parallel.never).toEqual(neverInAllSamples(serial.map((s) => s.never)))
  })
  it('недостижимость в отчёте — пересечение never по выборкам', () => {
    expect(neverInAllSamples([['A', 'B'], ['B', 'C'], ['B']])).toEqual(['B'])
    expect(neverInAllSamples([['A'], ['B'], ['C']])).toEqual([])
  })
  const sample = (kind: 'full' | 'main', games: Record<string, number>) => ({ kind, fired: {}, games })
  const rule = (name: string, late = false) => ({ name, when: late ? [is(endgame.active)] : [] })
  it('одна сыгранная партия — достижимо; частота не красит', () => {
    const s = [sample('main', { Once: 1, Often: 60 }), sample('main', {}), sample('full', { Often: 48 })]
    expect(gateIssues(s, [rule('Once'), rule('Often')], {})).toEqual([])
  })
  it('недостижимое правило без прямого случая — красное; со случаем — нет', () => {
    const s = [sample('main', {}), sample('full', {})]
    expect(gateIssues(s, [rule('Dead')], {})).toEqual([expect.stringMatching(/^Dead: ни разу до экрана концовки/)])
    expect(gateIssues(s, [rule('Dead')], { Dead: {} })).toEqual([])
  })
  it('правило основной игры обязано сыграть до концовки: полная выборка его не спасает', () => {
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

// DIRECT (#329): освобождение от гейта — привилегия редких правил, а не способ его расширить.

describe('гейт: DIRECT освобождает только редкие правила (#329)', () => {
  const sample = (kind: 'full' | 'main', games: Record<string, number>) => ({ kind, fired: {}, games })
  const rule = (name: string, late = false) => ({ name, when: late ? [is(endgame.active)] : [] })
  it('запись DIRECT у правила от порога и выше — красное «снять из DIRECT»', () => {
    const s = [sample('main', { Hot: DIRECT_MIN_GAMES, Warm: DIRECT_MIN_GAMES - 1 })]
    expect(gateIssues(s, [rule('Hot'), rule('Warm')], { Hot: {}, Warm: {} }))
      .toEqual([expect.stringMatching(new RegExp(`^Hot: сработало в ${DIRECT_MIN_GAMES} партиях`))])
  })
  it('полная выборка частого правила не считается: считаются партии его рода', () => {
    const s = [sample('main', { Hot: 2 }), sample('full', { Hot: 20 })]
    expect(gateIssues(s, [rule('Hot')], { Hot: {} })).toEqual([])
    const fullOnly = [sample('main', {}), sample('full', { Hot: 20 })]
    expect(gateIssues(fullOnly, [rule('Hot')], {})).toEqual([expect.stringMatching(/^Hot: ни разу до экрана концовки/)])
  })
  it('правило эндгейма из DIRECT считается по всем выборкам', () => {
    const s = [sample('main', { Late: 2 }), sample('full', { Late: DIRECT_MIN_GAMES - 3 })]
    expect(gateIssues(s, [rule('Late', true)], { Late: {} })).toEqual([])
    expect(gateIssues([sample('main', { Late: 2 }), sample('full', { Late: DIRECT_MIN_GAMES })], [rule('Late', true)], { Late: {} }))
      .toEqual([expect.stringMatching(/^Late: сработало в/)])
  })
  it('частые правила основной игры не в DIRECT: гейт видит их сам — контроль с light.off краснеет', () => {
    expect(['Bill_Due', 'Credit_Due', 'Turn_LightOff'].filter((n) => n in DIRECT)).toEqual([])
  })
})

describe('гейт на чужих семействах сидов (#434)', () => {
  const rule = (name: string, late = false) => ({ name, when: late ? [is(endgame.active)] : [] })
  const family = (shift: number, main: Record<string, number>, full: Record<string, number> = {}) => ({
    shift,
    samples: [{ kind: 'main' as const, games: main }, { kind: 'full' as const, games: full }],
  })

  it('0/8/4 требует прямой случай; с ним вердикт один и зелёный', () => {
    const families = [family(2000, {}), family(4000, { Rare: 8 }), family(6000, { Rare: 4 })]
    expect(stableGateIssues(families, [rule('Rare')], {})).toEqual([
      expect.stringMatching(/^Rare: .*\+2000: 0.*\+4000: 8.*\+6000: 4.*прямой случай/),
    ])
    expect(stableGateIssues(families, [rule('Rare')], { Rare: {} })).toEqual([])
  })

  it('9/9/9 снимает DIRECT; 6/7/9 оставляет его', () => {
    const hot = [2000, 4000, 6000].map((shift) => family(shift, { Hot: 9 }))
    expect(stableGateIssues(hot, [rule('Hot')], { Hot: {} })).toEqual([
      expect.stringMatching(/^Hot: .*\+2000: 9.*\+4000: 9.*\+6000: 9.*снять из DIRECT/),
    ])
    const threshold = [2000, 4000, 6000].map((shift) => family(shift, { Hot: DIRECT_MIN_GAMES }))
    expect(stableGateIssues(threshold, [rule('Hot')], { Hot: {} })).toHaveLength(1)
    const mixed = [family(2000, { Hot: 6 }), family(4000, { Hot: 7 }), family(6000, { Hot: 9 })]
    expect(stableGateIssues(mixed, [rule('Hot')], { Hot: {} })).toEqual([])
  })

  it('0/0/0 без DIRECT красный; эндгейм считает и полные выборки', () => {
    const families = [family(2000, {}, { Late: 1 }), family(4000, {}, { Late: 8 }), family(6000, {}, { Late: 4 })]
    expect(stableGateIssues(families, [rule('Dead')], {})).toEqual([
      expect.stringMatching(/^Dead: .*прямой случай/),
    ])
    expect(stableGateIssues(families, [rule('Late', true)], {})).toEqual([])
    expect(stableGateIssues(families, [rule('Late')], {})).toEqual([
      expect.stringMatching(/^Late: .*прямой случай/),
    ])
    expect(stableGateIssues([], [rule('Dead')], {})).toEqual([
      expect.stringMatching(/нет семейств/),
    ])
    expect(stableGateIssues([{ shift: 2000, samples: [{ kind: 'main', games: {} }] }], [rule('Dead')], {}))
      .toEqual([expect.stringMatching(/main и full/)])
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
