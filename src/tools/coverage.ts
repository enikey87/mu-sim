// Отчёт покрытия правил: симуляция N партий → какие правила срабатывают, какие никогда,
// и в каких событиях чаще всего побеждает общий ответ (там не хватает частного контента).
//
// Гейт покрытия смотрит на объединение нескольких непересекающихся выборок: правило достижимо,
// если сработало хотя бы в одной. Одна выборка путает недостижимость с невезением розыгрыша.
import { Game } from '../engine/game'
import { manualClock } from '../engine/clock'
import { seededRng } from '../engine/rng'
import { specificityOf, lineId, spec } from '../engine/rules'
import { MEMORY } from '../content/memory'
import { RARE } from './rare'
import { PROVEN } from './proven'
import { botTurn } from './bot'

/**
 * Почему правило не сработало в симуляции.
 * `rare` — RARE (прямой случай в rare.test.ts; членство — по широкому замеру).
 * `proven` — явное доказательство вне статистики (прямой тест или структурная недостижимость).
 * Больше нет освобождения по имени модуля или префиксу.
 */
export type NeverClass = 'rare' | 'proven' | 'unexplained'

/** Три непересекающихся пакета сидов: по одной выборке не отличить покрытие от удачи траектории. */
export const COVERAGE_SAMPLES: number[][] = [
  Array.from({ length: 16 }, (_, i) => i + 1),
  Array.from({ length: 16 }, (_, i) => i + 101),
  Array.from({ length: 16 }, (_, i) => i + 201),
]

export const neverClass = (name: string): NeverClass =>
  RARE.has(name) ? 'rare' : name in PROVEN ? 'proven' : 'unexplained'

/** Где именно правило проверяется, если симуляция до него не доходит. */
const NEVER_HINT: Record<NeverClass, string> = {
  rare: 'прямой тест: content/rules/rare.test.ts',
  proven: 'доказательство: tools/proven.ts → указанный тест / structural',
  unexplained: 'НЕ ОБЪЯСНЕНО — гейт покрытия обязан падать',
}

export interface CoverageReport {
  turns: number
  /** События, где выбор идёт по весам среди равных (доля «общих» там не имеет смысла). */
  weighted: string[]
  /** Сколько раз правило было выбрано (match) или попало в выбранные (collect). */
  fired: Record<string, number>
  never: string[]
  /** Реплики памяти, которые ни разу не прозвучали (условие не наступило или пул не дошёл). */
  unsaid: string[]
  /** По событиям: сколько выборов и какая доля досталась самым общим правилам события. */
  events: Record<string, { total: number; generic: number }>
}

export interface MultiCoverage {
  samples: CoverageReport[]
  /** Ни разу ни в одной выборке — настоящая недостижимость для гейта. */
  never: string[]
}

/** Пересечение «никогда»: имя есть в каждом списке never. */
export function neverInAllSamples(sampleNevers: string[][]): string[] {
  if (!sampleNevers.length) return []
  const rest = sampleNevers.slice(1).map((n) => new Set(n))
  return sampleNevers[0].filter((name) => rest.every((s) => s.has(name)))
}

/**
 * Широкий замер (tools/coverage-measure.json, пишет `npm run rules:stable`): по правилу — срабатывания в каждом
 * из пакетов по 16 партий. Решает, кому место в исключениях гейта, — вместо трёх выборок самого гейта, где
 * граница «редкое / нет» мигала от любой правки текста.
 */
export interface Measure { packs: number[][]; rules: Record<string, number[]> }
/** Доля пакетов, где правило не сработало ни разу. */
export const zeroShare = (v: readonly number[]): number => v.filter((x) => x === 0).length / v.length
/**
 * Граница исключений с гистерезисом (z — доля пакетов замера, где правило молчит). Исключение (RARE / PROVEN)
 * допустимо, только если стенд молчит хоть в одном пакете (z ≥ 0,1: «достигает не всегда»), и обязательно при
 * z ≥ 0,3: шанс, что правка текста обнулит такое правило во всех трёх выборках CI, ≈ z³ ≥ 2,7 %. Между ними —
 * решает автор: иначе правило на границе мигало бы от одного перемера к другому.
 */
export const RARE_ZERO_SHARE = { allowed: 0.1, required: 0.3 }

/** Расхождения исключений с замером: исключение, которое стенд достигает почти всегда; редкое правило без исключения; пропуски. */
export function exemptionIssues(m: Measure, exempt: ReadonlySet<string>, names: readonly string[]): string[] {
  const issues: string[] = []
  const known = new Set(names)
  for (const n of Object.keys(m.rules)) if (!known.has(n)) issues.push(`${n}: в замере, но такого правила нет — перемерить (npm run rules:stable)`)
  for (const n of exempt) {
    const v = m.rules[n]
    if (!v) issues.push(`${n}: исключение без замера — перемерить (npm run rules:stable)`)
    else if (zeroShare(v) < RARE_ZERO_SHARE.allowed) issues.push(`${n}: исключение, а стенд доходит всегда (${v.join('/')}) — снять`)
  }
  for (const [n, v] of Object.entries(m.rules)) if (known.has(n) && !exempt.has(n) && zeroShare(v) >= RARE_ZERO_SHARE.required) issues.push(`${n}: редкое (${v.join('/')}) и без исключения — гейт будет мигать; в RARE с прямым случаем`)
  return issues
}

/** grumpy — номера партий (с конца), где бот много грубит: иначе лестница грубости не проходится. */
export async function ruleCoverage(seeds: number[], turns: number, hours = [14, 3, 20, 8, 20, 13, 9], grumpy = 0, opts: { freeText?: number } = {}): Promise<CoverageReport> {
  const fired: Record<string, number> = {}
  const events: CoverageReport['events'] = {}
  let total = 0
  let names: string[] = []
  let weighted: string[] = []
  const said = new Set<string>()
  for (const [i, seed] of seeds.entries()) {
    // разные часы и дни недели — чтобы срабатывали утро, обед, вечер, пятница
    const clock = manualClock(Date.parse('2026-09-14T12:00:00Z') + (i % 7) * 864e5)
    const game = new Game({ storage: null, clock, rng: seededRng(seed), noTimers: true, hour: hours[i % hours.length], strictSilence: true })
    names = game.rules.all.map((r) => r.name)
    weighted = [...new Set(game.rules.all.filter((r) => r.specificity === 0).map((r) => r.event))]
    const minSpec: Record<string, number> = {}
    for (const r of game.rules.all) minSpec[r.event] = Math.min(minSpec[r.event] ?? Infinity, specificityOf(r))
    const specOf = Object.fromEntries(game.rules.all.map((r) => [r.name, specificityOf(r)]))
    game.rules.tracer = (t) => {
      const e = (events[t.event] ??= { total: 0, generic: 0 })
      for (const n of t.chosen) {
        fired[n] = (fired[n] ?? 0) + 1
        e.total++
        if (specOf[n] === minSpec[t.event]) e.generic++
      }
    }
    for (let k = 0; k < turns; k++) {
      { const g = i >= seeds.length - grumpy; await botTurn(game, g ? 0.15 : 0.7, g ? 0.6 : 0.06, opts.freeText ?? 0) } // грубый бот почти не извиняется
      // события «игрок молчит» бот сам не вызывает — дёргаем их иногда
      if (k % 7 === 0 && !game.ui.busy && !game.battery.dead) await game.fire('AlikIdle')
      total++
    }
    for (const id of Object.keys(game.S.rules.said)) said.add(id)
  }
  const unsaid = MEMORY.map(spec).filter((l) => !said.has(l.id ?? lineId('MEMORY', l.t))).map((l) => l.t)
  return { turns: total, weighted, fired, never: names.filter((n) => !fired[n]), events, unsaid }
}

/** Несколько выборок → достижимость по объединению, RARE — по пересечению «никогда». */
export async function multiSampleCoverage(
  samples = COVERAGE_SAMPLES,
  turns = 500,
  grumpy = 2,
  opts: { freeText?: number } = { freeText: 0.15 },
): Promise<MultiCoverage> {
  const reports: CoverageReport[] = []
  for (const seeds of samples) reports.push(await ruleCoverage(seeds, turns, undefined, grumpy, opts))
  const never = neverInAllSamples(reports.map((r) => r.never))
  return { samples: reports, never }
}

export function formatCoverage(r: CoverageReport): string {
  const lines = [`Ходов: ${r.turns}`, '', 'Событие                доля общих ответов   выборов']
  for (const [e, v] of Object.entries(r.events).sort((a, b) => b[1].total - a[1].total))
    lines.push(`${e.padEnd(22)} ${(r.weighted.includes(e) ? '— (по весам)' : Math.round((v.generic / v.total) * 100) + '%').padStart(12)}   ${String(v.total).padStart(8)}`)
  const groups: Record<NeverClass, string[]> = { rare: [], proven: [], unexplained: [] }
  for (const n of r.never) groups[neverClass(n)].push(n)
  lines.push('', `Ни разу не сработали (${r.never.length}): редкие ${groups.rare.length} · proven ${groups.proven.length} · необъяснённые ${groups.unexplained.length}`)
  for (const cls of ['unexplained', 'rare', 'proven'] as NeverClass[]) {
    if (!groups[cls].length) continue
    lines.push(`  ${cls} — ${NEVER_HINT[cls]}:`, ...groups[cls].map((n) => '    ' + n))
  }
  lines.push('', `Память: не прозвучали (${r.unsaid.length}):`, ...r.unsaid.map((t) => '  ' + t.slice(0, 80)))
  lines.push('', 'Самые частые:', ...Object.entries(r.fired).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => `  ${String(c).padStart(5)}  ${n}`))
  return lines.join('\n')
}
