// Отчёт покрытия правил: симуляция N партий → какие правила срабатывают, какие никогда,
// и в каких событиях чаще всего побеждает общий ответ (там не хватает частного контента).
import { Game } from '../engine/game'
import { manualClock } from '../engine/clock'
import { seededRng } from '../engine/rng'
import { specificityOf, lineId, spec } from '../engine/rules'
import { MEMORY } from '../content/memory'
import { rudeRules, rudeSaysRules } from '../content/rules/rude'
import { endgameRules } from '../content/rules/endgame'
import { RARE } from './rare'
import { botTurn } from './bot'

/** Почему правило не сработало в симуляции. У каждого класса, кроме последнего, есть прямой тест. */
export type NeverClass = 'rare' | 'deterministic' | 'endgame' | 'unexplained'

const DETERMINISTIC = new Set(
  [...rudeRules, ...rudeSaysRules, ...endgameRules].map((r) => r.name)
    .concat('Opt_Via_boris', 'Opt_Via_karine', 'Opt_Via_mama', 'Opt_Moo'),
)
const ENDGAME_ONLY = /^(Finale|Ending|Payday|Quiet)_/

export const neverClass = (name: string): NeverClass =>
  RARE.has(name) ? 'rare' : DETERMINISTIC.has(name) ? 'deterministic' : ENDGAME_ONLY.test(name) ? 'endgame' : 'unexplained'

/** Где именно правило проверяется, если симуляция до него не доходит. */
const NEVER_HINT: Record<NeverClass, string> = {
  rare: 'прямой тест: content/rules/rare.test.ts',
  deterministic: 'прямой тест: rude / dialog / endgame',
  endgame: 'прямой тест: finales / payday / endgame',
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
    const game = new Game({ storage: null, clock, rng: seededRng(seed), noTimers: true, hour: hours[i % hours.length] })
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
      if (k % 7 === 0 && !game.ui.busy && !game.ui.dead) await game.fire('AlikIdle')
      total++
    }
    for (const id of Object.keys(game.S.rules.said)) said.add(id)
  }
  const unsaid = MEMORY.map(spec).filter((l) => !said.has(l.id ?? lineId('MEMORY', l.t))).map((l) => l.t)
  return { turns: total, weighted, fired, never: names.filter((n) => !fired[n]), events, unsaid }
}

export function formatCoverage(r: CoverageReport): string {
  const lines = [`Ходов: ${r.turns}`, '', 'Событие                доля общих ответов   выборов']
  for (const [e, v] of Object.entries(r.events).sort((a, b) => b[1].total - a[1].total))
    lines.push(`${e.padEnd(22)} ${(r.weighted.includes(e) ? '— (по весам)' : Math.round((v.generic / v.total) * 100) + '%').padStart(12)}   ${String(v.total).padStart(8)}`)
  const groups: Record<NeverClass, string[]> = { rare: [], deterministic: [], endgame: [], unexplained: [] }
  for (const n of r.never) groups[neverClass(n)].push(n)
  lines.push('', `Ни разу не сработали (${r.never.length}): редкие ${groups.rare.length} · детерминированные ${groups.deterministic.length} · только в финалах ${groups.endgame.length} · необъяснённые ${groups.unexplained.length}`)
  for (const cls of ['unexplained', 'rare', 'deterministic', 'endgame'] as NeverClass[]) {
    if (!groups[cls].length) continue
    lines.push(`  ${cls} — ${NEVER_HINT[cls]}:`, ...groups[cls].map((n) => '    ' + n))
  }
  lines.push('', `Память: не прозвучали (${r.unsaid.length}):`, ...r.unsaid.map((t) => '  ' + t.slice(0, 80)))
  lines.push('', 'Самые частые:', ...Object.entries(r.fired).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => `  ${String(c).padStart(5)}  ${n}`))
  return lines.join('\n')
}
