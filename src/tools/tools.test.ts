// Инструменты автора: линтер правил и покрытие. Эти тесты не дают контенту тихо сломаться.
import { describe, it, expect } from 'vitest'
import { lintRules, type Rule } from '../engine/rules'
import { allRules } from '../content/rules'
import { isFactKey } from '../content/factkeys'
import { readFileSync } from 'node:fs'
import {
  multiSampleCoverage, formatCoverage, neverClass, neverInAllSamples, exemptionIssues, zeroShare,
  measurePackIssues, measureCiForgeIssues, RARE_ZERO_SHARE, COVERAGE_SAMPLES, type Measure,
} from './coverage'
import { PROVEN } from './proven'
import { RARE } from './rare'

const measure: Measure = JSON.parse(readFileSync('src/tools/coverage-measure.json', 'utf8'))

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

describe('гистерезис покрытия', () => {
  it('недостижимость — только пересечение never по выборкам', () => {
    // правило выпало из одной выборки (шум) — гейт молчит; из всех — падает
    expect(neverInAllSamples([['A', 'B'], ['B', 'C'], ['B']])).toEqual(['B'])
    expect(neverInAllSamples([['A'], ['B'], ['C']])).toEqual([])
  })
  it('граница исключений — по замеру, в обе стороны', () => {
    const m: Measure = { packs: [], rules: { Often: [3, 2, 4, 1, 5, 2, 1, 3, 2, 4], Rare: [0, 1, 0, 0, 2, 1, 0, 1, 1, 1], Gone: Array(10).fill(0), Edge: [0, 1, 2, 3, 1, 0, 2, 1, 1, 2] } }
    // исключение, которое стенд достигает всегда, и редкое правило без исключения — оба красные
    expect(exemptionIssues(m, new Set(['Often', 'Gone']), ['Often', 'Rare', 'Gone', 'Edge'])).toEqual([
      expect.stringMatching(/^Often: исключение/), expect.stringMatching(/^Rare: редкое/),
    ])
    expect(exemptionIssues(m, new Set(['Often', 'Gone']), ['Often', 'Rare', 'Gone', 'Edge'])[0]).toMatch(/перемерить/)
    // полоса гистерезиса (молчит в 2 пакетах из 10): и в исключениях, и под гейтом — законно
    expect(exemptionIssues(m, new Set(['Rare', 'Gone']), ['Often', 'Rare', 'Gone', 'Edge'])).toEqual([])
    expect(exemptionIssues(m, new Set(['Rare', 'Gone', 'Edge']), ['Often', 'Rare', 'Gone', 'Edge'])).toEqual([])
    // исключение без замера и замер несуществующего правила — перемерить
    expect(exemptionIssues(m, new Set(['Rare', 'Gone', 'New']), ['Often', 'Rare', 'Gone', 'Edge', 'New'])).toEqual([expect.stringMatching(/^New: исключение без замера/)])
    expect(exemptionIssues(m, new Set(['Rare', 'Gone']), ['Rare', 'Gone', 'Edge'])).toEqual([expect.stringMatching(/^Often: в замере, но такого правила нет/)])
    expect(zeroShare([0, 1, 0, 2])).toBe(0.5)
  })
  it('исключения гейта (RARE, PROVEN) совпадают с широким замером', () => {
    expect(measure.packs.length).toBeGreaterThanOrEqual(10)
    expect(Object.keys(measure.rules).length).toBeGreaterThan(200) // замер не пустой: пустой прошёл бы любую сверку
    expect(measurePackIssues(measure)).toEqual([])
    const exempt = new Set([...RARE, ...Object.keys(PROVEN)])
    expect(exemptionIssues(measure, exempt, allRules.map((r) => r.name))).toEqual([])
    expect(RARE_ZERO_SHARE.allowed).toBe(0.1)
    expect(RARE_ZERO_SHARE.required).toBe(0.3)
  })
  it('подделка снимка: нули в колонках CI при живом гейте во всех выборках — красное', () => {
    // Beat_FirstArc: обнулённые пакеты 0–1; живой прогон видит правило в каждой выборке CI (#208/#230)
    const m: Measure = {
      packs: COVERAGE_SAMPLES,
      rules: { Beat_FirstArc: [0, 0, 5, 4, 2, 1, 1, 3, 3, 3] },
    }
    const live = [{ fired: { Beat_FirstArc: 1 } }, { fired: { Beat_FirstArc: 7 } }, { fired: { Beat_FirstArc: 5 } }]
    expect(measureCiForgeIssues(m, live)).toEqual([
      expect.stringMatching(/^Beat_FirstArc: снимок пакета 0/),
      expect.stringMatching(/^Beat_FirstArc: снимок пакета 1/),
    ])
    // шум одной выборки (правка текста) — не подделка
    expect(measureCiForgeIssues(m, [{ fired: { Beat_FirstArc: 1 } }, { fired: {} }, { fired: { Beat_FirstArc: 5 } }])).toEqual([])
    // честный снимок (как у Turn_BorisSick: CI >0, нули только дальше) — зелёный
    expect(measureCiForgeIssues(
      { packs: COVERAGE_SAMPLES, rules: { Turn_BorisSick: [2, 1, 1, 3, 0, 1, 1, 0, 0, 0] } },
      [{ fired: { Turn_BorisSick: 2 } }, { fired: { Turn_BorisSick: 1 } }, { fired: { Turn_BorisSick: 1 } }],
    )).toEqual([])
    expect(measurePackIssues({ packs: [[1], ...COVERAGE_SAMPLES.slice(1)], rules: {} })).toEqual([
      expect.stringMatching(/пакет 0/),
    ])
  })
  it('подделка вне CI: ноль только в пакете 5 при полосе гистерезиса — красное', () => {
    const names = ['Beat_FirstArc', 'Often']
    // всегда-достижимое + один ноль в пакете 5 → z=0.1 без нуля в CI (#230 / аудит #214)
    const forged: Measure = {
      packs: [...COVERAGE_SAMPLES, [301], [401], [501], [601], [701], [801], [901]],
      rules: { Beat_FirstArc: [1, 7, 5, 4, 2, 0, 1, 3, 3, 3] },
    }
    expect(exemptionIssues(forged, new Set(['Beat_FirstArc']), names)).toEqual([
      expect.stringMatching(/^Beat_FirstArc: исключение в полосе гистерезиса без нуля в пакетах CI/),
    ])
    // z ≥ required за счёт нулей вне CI — законно (широкий замер)
    const rareOk: Measure = {
      packs: forged.packs,
      rules: { Often: [2, 2, 2, 0, 0, 0, 1, 1, 1, 1] },
    }
    expect(exemptionIssues(rareOk, new Set(['Often']), names)).toEqual([])
  })
  it('классы never — только rare / proven / unexplained; префикс не освобождает', () => {
    expect(neverClass('Tone_Cow')).toBe('rare')
    expect(neverClass('Endgame_Money')).toBe('proven')
    expect(neverClass('Quiet_BrandNew')).toBe('unexplained')
    expect(neverClass('Finale_made_up')).toBe('unexplained')
  })
  it('PROVEN ⊆ allRules, причины уникальны, содержательны и называют запись, пересечения с RARE нет', () => {
    const names = new Set(allRules.map((r) => r.name))
    const entries = Object.entries(PROVEN)
    expect(entries.filter(([n]) => !names.has(n)).map(([n]) => n)).toEqual([])
    expect(entries.filter(([, why]) => !why.trim()).map(([n]) => n)).toEqual([])
    // общая константа на всех (#130) — красная: причин меньше, чем записей
    expect(new Set(entries.map(([, why]) => why)).size).toBe(entries.length)
    expect(entries.filter(([n, why]) => !why.includes(n)).map(([n]) => n)).toEqual([])
    // шаблон «CASES.<name>» / пустой хвост — не причина (#230)
    expect(entries.filter(([n, why]) => why === `proven.test.ts CASES.${n}` || why === `${n}:`).map(([n]) => n)).toEqual([])
    expect(entries.filter(([n, why]) => !why.startsWith(`${n}: `) || why.length < n.length + 8).map(([n]) => n)).toEqual([])
    expect([...RARE].filter((n) => n in PROVEN)).toEqual([])
  })
})

// Редкие правила: срабатывают только при особых сочетаниях, которые бот за разумное время не собирает

describe('покрытие правил', () => {
  it(`за ${COVERAGE_SAMPLES.length} непересекающихся выборок срабатывают все правила, кроме исключений (RARE, PROVEN)`, async () => {
    const r = await multiSampleCoverage()
    if (process.env.RULES_REPORT) {
      for (const [i, s] of r.samples.entries()) process.stdout.write(`\n# sample ${i}\n` + formatCoverage(s) + '\n')
      process.stdout.write(`\nunion never: ${r.never.join(', ') || '(none)'}\n`)
    }
    // Классы «не сработало» и их прямые тесты — в coverage.ts: необъяснённых быть не должно.
    expect(r.never.filter((n) => neverClass(n) === 'unexplained')).toEqual([])
    // снимок vs живой гейт по колонкам CI — unit `подделка снимка`; живой дрейф редких
    // правил между замерами не краснеет здесь (иначе каждый контентный PR требует remasure)
  }, 900_000)
})
