// Отчёт покрытия правил: симуляция N партий → какие правила срабатывают, какие никогда,
// и в каких событиях чаще всего побеждает общий ответ (там не хватает частного контента).
import { Game } from '../engine/game'
import { manualClock } from '../engine/clock'
import { seededRng } from '../engine/rng'
import { specificityOf } from '../engine/rules'
import { botTurn } from './bot'

export interface CoverageReport {
  turns: number
  /** События, где выбор идёт по весам среди равных (доля «общих» там не имеет смысла). */
  weighted: string[]
  /** Сколько раз правило было выбрано (match) или попало в выбранные (collect). */
  fired: Record<string, number>
  never: string[]
  /** По событиям: сколько выборов и какая доля досталась самым общим правилам события. */
  events: Record<string, { total: number; generic: number }>
}

/** grumpy — номера партий (с конца), где бот много грубит: иначе лестница грубости не проходится. */
export async function ruleCoverage(seeds: number[], turns: number, hours = [14, 3, 20, 8, 20, 13, 9], grumpy = 0): Promise<CoverageReport> {
  const fired: Record<string, number> = {}
  const events: CoverageReport['events'] = {}
  let total = 0
  let names: string[] = []
  let weighted: string[] = []
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
      { const g = i >= seeds.length - grumpy; await botTurn(game, g ? 0.15 : 0.7, g ? 0.6 : 0.06) } // грубый бот почти не извиняется
      // события «игрок молчит» бот сам не вызывает — дёргаем их иногда
      if (k % 7 === 0 && !game.busy && !game.dead) await game.fire('AlikIdle')
      total++
    }
  }
  return { turns: total, weighted, fired, never: names.filter((n) => !fired[n]), events }
}

export function formatCoverage(r: CoverageReport): string {
  const lines = [`Ходов: ${r.turns}`, '', 'Событие                доля общих ответов   выборов']
  for (const [e, v] of Object.entries(r.events).sort((a, b) => b[1].total - a[1].total))
    lines.push(`${e.padEnd(22)} ${(r.weighted.includes(e) ? '— (по весам)' : Math.round((v.generic / v.total) * 100) + '%').padStart(12)}   ${String(v.total).padStart(8)}`)
  lines.push('', `Ни разу не сработали (${r.never.length}):`, ...r.never.map((n) => '  ' + n))
  lines.push('', 'Самые частые:', ...Object.entries(r.fired).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => `  ${String(c).padStart(5)}  ${n}`))
  return lines.join('\n')
}
