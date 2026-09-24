// Какие ключи фактов игра реально порождает. Точные — реестр memkeys; семейные (`arc.<id>`,
// `said.<claim>`…) — до конкретного элемента: пространства имён недостаточно, опечатка под
// префиксом иначе становится не мёртвым условием, а «всегда разрешено» (число без факта — 0).
import { ARCS, CAST } from './arcs'
import { ACH } from './achievements'
import { CLAIMS } from './lies'
import { TOPICS } from './topics'
import { EXTRAS } from './world'
import { invoiceItems, invKey } from './scenes'
import { ACTOR_KEYS, EVENT_KEYS, MEM_KEYS } from './memkeys'
import { valueOf } from '../engine/rules'

/** Факты контекста последней реплики — facts() кладёт их все на каждый fire; сверка — factkeys.test.ts. */
export const CTX_KEYS: readonly string[] = [
  'topic', 'type', 'amount', 's', 'shortTimey', 'when', 'whenNever', 'whenFresh', 'whenDate', 'rel', 'relYou',
  'sad', 'festive', 'revived', 'constr', 'legendary', 'arc', 'quote', 'arcCanAdvance', 'legend', 'chorus', 'memory',
  'group', 'wrong', 'deleted', 'offended',
]
export const HAS_KEYS: readonly string[] = ['boris', 'niva']

const setOf = (xs: Iterable<string>) => { const s = new Set(xs); return (x: string) => s.has(x) }
const arcs = setOf(Object.keys(ARCS))
const ach = setOf(Object.keys(ACH))
const claims = setOf(CLAIMS.map((c) => c.key))
const topics = setOf(Object.keys(TOPICS))
const who = setOf([...Object.keys(CAST), ...EXTRAS])
const items = setOf(invoiceItems(30).map((r) => invKey(valueOf(r)[0]).slice('inv.'.length)))

/** Семейство: префикс → допустимый остаток. */
export const FAMILIES: Record<string, (rest: string) => boolean> = {
  'arc.': (r) => arcs(r) || r === 'done',
  'ach.': ach, 'since.': ach,
  'has.': setOf(HAS_KEYS), 'ctx.': setOf(CTX_KEYS),
  'said.': claims, 'saidLast.': claims, 'by.': claims, 'cb.': claims,
  'caught.': (r) => r.split('|').length === 2 && r.split('|').every(claims),
  'met.': who, 'intro.': who,
  'asked.': arcs, 'doneAsked.': arcs, 'finale.': arcs, 'legend.of.': arcs,
  'topic.': topics, 'topicMute.': topics,
  'inv.': items,
  'wedding.': setOf(Object.keys(CAST)),
}

/** Известный ли ключ факта: точный — из реестра, семейный — до элемента. Точное совпадение — раньше семейств. */
export const isFactKey = (key: string): boolean =>
  MEM_KEYS.has(key) || ACTOR_KEYS.has(key) || EVENT_KEYS.has(key)
  || Object.entries(FAMILIES).some(([p, ok]) => key.startsWith(p) && ok(key.slice(p.length)))
