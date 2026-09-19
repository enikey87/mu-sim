// Линтер правил: статические проверки, которые ловят контентные ошибки до игры.
import type { Criterion, Rule } from './types'
import { describeCriterion } from './criteria'
import { specificityOf } from './ruleset'

export interface LintIssue { rule: string; kind: 'shadowed' | 'no-effect' | 'bad-weight' | 'bad-odds'; message: string }

const keys = <G>(r: Rule<G>): Set<string> => {
  const s = new Set(r.when.map((c: Criterion) => describeCriterion(c)))
  if (r.sender) s.add(`sender == ${r.sender}`)
  if (r.target) s.add(`target == ${r.target}`)
  return s
}

/**
 * - shadowed: правило никогда не победит — есть более специфичное правило того же события, которое всегда
 *   доступно (без шанса, once, перерыва и с не меньшим приоритетом) и чьи условия — подмножество условий этого;
 * - no-effect: нет ни ответа, ни предложения;
 * - bad-weight / bad-odds: отрицательный вес, шанс вне 0..1.
 * Сборщики (collect) не проверяются на shadowed: там подходят все, а не один.
 */
export function lintRules<G>(rules: Rule<G>[], collectEvents: string[] = []): LintIssue[] {
  const issues: LintIssue[] = []
  for (const r of rules) {
    if (!r.respond && !r.offer) issues.push({ rule: r.name, kind: 'no-effect', message: 'нет respond/offer' })
    if (typeof r.weight === 'number' && r.weight < 0) issues.push({ rule: r.name, kind: 'bad-weight', message: `вес ${r.weight}` })
    if (r.odds !== undefined && (r.odds < 0 || r.odds > 1)) issues.push({ rule: r.name, kind: 'bad-odds', message: `шанс ${r.odds}` })
    if (collectEvents.includes(r.event)) continue
    const mine = keys(r)
    const pr = (x: Rule<G>) => ['idle', 'chatter', 'default', 'cinematic', 'system'].indexOf(x.priority ?? 'default')
    const shadow = rules.find((o) => o !== r && o.event === r.event && o.odds === undefined && !o.once && !o.cooldown
      && pr(o) >= pr(r) && specificityOf(o) > specificityOf(r) && [...keys(o)].every((k) => mine.has(k)))
    if (shadow) issues.push({ rule: r.name, kind: 'shadowed', message: `всегда проигрывает ${shadow.name}` })
  }
  return issues
}
