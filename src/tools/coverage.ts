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
 * `rare` — RARE: стенд доходит не каждый раз, прямой случай в rare.test.ts.
 * `proven` — PROVEN: стенд не доходит никогда, прямой случай в proven.test.ts.
 * Больше нет освобождения по имени модуля или префиксу.
 */
export type NeverClass = 'rare' | 'proven' | 'unexplained'

/**
 * Выборка гейта: `full` — партия до конца (после выплаты бот живёт в эндгейме), `main` — до экрана концовки,
 * иначе правилам основной игры не хватает ходов (#269). Сиды родов не пересекаются: партия до выплаты та же.
 */
export interface SampleSpec { kind: 'full' | 'main'; seeds: number[]; turns: number; grumpy: number }
export type SampleKind = SampleSpec['kind']

const seeds = (from: number, n: number): number[] => Array.from({ length: n }, (_, i) => from + i)

/** Три полные и три «до концовки» выборки: по одной не отличить покрытие от удачи траектории. */
export const COVERAGE_SAMPLES: SampleSpec[] = [
  { kind: 'full', seeds: seeds(1, 16), turns: 500, grumpy: 2 },
  { kind: 'full', seeds: seeds(101, 16), turns: 500, grumpy: 2 },
  { kind: 'full', seeds: seeds(201, 16), turns: 500, grumpy: 2 },
  { kind: 'main', seeds: seeds(1001, 24), turns: 500, grumpy: 3 },
  { kind: 'main', seeds: seeds(1101, 24), turns: 500, grumpy: 3 },
  { kind: 'main', seeds: seeds(1201, 24), turns: 500, grumpy: 3 },
]

export const neverClass = (name: string): NeverClass =>
  RARE.has(name) ? 'rare' : PROVEN.has(name) ? 'proven' : 'unexplained'

/** Где именно правило проверяется, если симуляция до него не доходит. */
const NEVER_HINT: Record<NeverClass, string> = {
  rare: 'прямой тест: content/rules/rare.test.ts',
  proven: 'прямой тест: tools/proven.test.ts',
  unexplained: 'НЕ ОБЪЯСНЕНО — гейт покрытия обязан падать',
}

export interface CoverageReport {
  turns: number
  /** События, где выбор идёт по весам среди равных (доля «общих» там не имеет смысла). */
  weighted: string[]
  /** Сколько раз правило было выбрано (match) или попало в выбранные (collect). */
  fired: Record<string, number>
  /** В скольких партиях правило сработало хоть раз: одна партия даёт пачку срабатываний, партии — нет. */
  games: Record<string, number>
  never: string[]
  /** Реплики памяти, которые ни разу не прозвучали (условие не наступило или пул не дошёл). */
  unsaid: string[]
  /** По событиям: сколько выборов и какая доля досталась самым общим правилам события. */
  events: Record<string, { total: number; generic: number }>
}

export interface SampleReport extends CoverageReport { kind: SampleKind }

export interface MultiCoverage {
  samples: SampleReport[]
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
 * Полоса исключений — по живым выборкам CI, снимка нет (#269: правимый руками снимок подделывался, перемер двигал
 * границу). Мера — партии, где правило сработало: одна партия даёт пачку срабатываний, и сумма гуляет от правки
 * текста в разы, число партий — нет. Исключение красное от COMMON_GAMES партий из 120 (каждая шестая); ниже — полоса,
 * где список не мигает, снимать оттуда решает автор (`rules:stable` — второе мнение).
 */
export const COMMON_GAMES = 20

const gamesOf = (samples: ReadonlyArray<Pick<SampleReport, 'games'>>, name: string): number =>
  samples.reduce((n, s) => n + (s.games[name] ?? 0), 0)

const counts = (samples: ReadonlyArray<Pick<SampleReport, 'kind' | 'games'>>, name: string): string =>
  (['full', 'main'] as const)
    .map((k) => `${k} ${samples.filter((s) => s.kind === k).map((s) => s.games[name] ?? 0).join('/')}`)
    .join(' · ')

export function exemptionIssues(
  samples: ReadonlyArray<Pick<SampleReport, 'kind' | 'games'>>,
  rare: ReadonlySet<string>,
  proven: ReadonlySet<string>,
  names: readonly string[],
): string[] {
  const issues: string[] = []
  const known = new Set(names)
  for (const [list, set] of [['RARE', rare], ['PROVEN', proven]] as const) {
    for (const n of set) {
      if (!known.has(n)) { issues.push(`${n}: в ${list}, а такого правила нет`); continue }
      const g = gamesOf(samples, n)
      if (g >= COMMON_GAMES) issues.push(`${n}: в ${list}, а стенд доходит в ${g} партиях (${counts(samples, n)}) — снять`)
    }
  }
  return issues
}

/** Правила под гейтом, которые держатся на одной партии: не красное, но повод для RARE до того, как гейт мигнёт. */
export function fragile(samples: ReadonlyArray<Pick<SampleReport, 'games'>>, names: readonly string[]): string[] {
  return names.filter((n) => !RARE.has(n) && !PROVEN.has(n) && gamesOf(samples, n) === 1)
}

/**
 * grumpy — номера партий (с конца), где бот много грубит: иначе лестница грубости не проходится.
 * untilEnding — партия кончается на первом экране концовки (выборка `main`).
 */
export async function ruleCoverage(
  seeds: number[], turns: number, hours = [14, 3, 20, 8, 20, 13, 9], grumpy = 0,
  opts: { freeText?: number; untilEnding?: boolean } = {},
): Promise<CoverageReport> {
  const fired: Record<string, number> = {}
  const games: Record<string, number> = {}
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
    const seen = new Set<string>()
    game.rules.tracer = (t) => {
      const e = (events[t.event] ??= { total: 0, generic: 0 })
      for (const n of t.chosen) {
        fired[n] = (fired[n] ?? 0) + 1
        seen.add(n)
        e.total++
        if (specOf[n] === minSpec[t.event]) e.generic++
      }
    }
    for (let k = 0; k < turns; k++) {
      { const g = i >= seeds.length - grumpy; await botTurn(game, g ? 0.15 : 0.7, g ? 0.6 : 0.06, opts.freeText ?? 0) } // грубый бот почти не извиняется
      // события «игрок молчит» бот сам не вызывает — дёргаем их иногда
      if (k % 7 === 0 && !game.ui.busy && !game.battery.dead) await game.fire('AlikIdle')
      total++
      if (opts.untilEnding && game.S.ending) break
    }
    for (const id of Object.keys(game.S.rules.said)) said.add(id)
    for (const n of seen) games[n] = (games[n] ?? 0) + 1
  }
  const unsaid = MEMORY.map(spec).filter((l) => !said.has(l.id ?? lineId('MEMORY', l.t))).map((l) => l.t)
  return { turns: total, weighted, fired, games, never: names.filter((n) => !fired[n]), events, unsaid }
}

/** Несколько выборок → достижимость по объединению. */
export async function multiSampleCoverage(
  samples = COVERAGE_SAMPLES,
  opts: { freeText?: number } = { freeText: 0.15 },
): Promise<MultiCoverage> {
  const reports: SampleReport[] = []
  for (const s of samples) {
    const r = await ruleCoverage(s.seeds, s.turns, undefined, s.grumpy, { ...opts, untilEnding: s.kind === 'main' })
    reports.push({ ...r, kind: s.kind })
  }
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
