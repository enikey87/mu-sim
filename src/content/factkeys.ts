// Какие ключи фактов игра реально порождает. Точные — реестр memkeys; семейные (`arc.<id>`,
// `said.<claim>`…) — до конкретного элемента: пространства имён недостаточно, опечатка под
// префиксом иначе становится не мёртвым условием, а «всегда разрешено» (число без факта — 0).
//
// FactKey — тип для конструкторов условий (#258): опечатка не компилируется. isFactKey — рантайм
// для линтера и наследия (fx.set / динамика); новые условия идут через типизированные конструкторы.
import { ARCS, CAST } from './arcs'
import { ACH } from './achievements'
import { CLAIMS } from './lies'
import { TOPICS } from './topics'
import { EXTRAS } from './world'
import type { AchId, ArcId, CastId, ClaimKey, TopicId, WhoId } from './ids'
import { invoiceItems, invKey } from './scenes'
import {
  ACTOR_KEYS, EVENT_KEYS, MEM_KEYS, type EventKey, type ActorKey,
  HEAT, blocked, blockedHint, statusHidden, polite, bloodGiven, alikDead, mourning, evicted,
  vendetta, court, courtVerdict, courtReferral, ritualCount, ritualCut, caughtCount, cryptoHodl,
  bathAsked, mamaCalls, phoneKarine, alikShaved, alikDay, mooAt, sorryAt, rudeAt, thanksAt, topicRun, topicLast,
  legendPromiseAt, legendId, legendDay, legendArc, nextTransfer, tileCornerRemoved, nivaAway,
  garikConcrete, garikCut, houseOnGarik, borisMarried, borisSmetaReady, taxFrozen, taxThawed,
  actSigned, grantPaid, rubikFined, threatClaim, nuneKeyPassed, nuneDekretOver, grandpaDying,
  betonSet, cardSent, saidTomorrow, saidFriday, payday, count, endgame, holidayGreeted, lend50,
  lie, paydayScene, lightOff, netRation, phoneWarn, creditStage, creditOffer, creditBroke, momDone,
} from './memkeys'
import type { LoanId, MomId, ThingId } from './credit'
import { valueOf } from '../engine/rules'

/** Факты контекста последней реплики — facts() кладёт их все на каждый fire; сверка — factkeys.test.ts. */
export const CTX_KEYS = [
  'topic', 'type', 'amount', 's', 'shortTimey', 'when', 'whenNever', 'whenFresh', 'whenDate', 'rel', 'relYou',
  'sad', 'festive', 'revived', 'constr', 'legendary', 'arc', 'quote', 'arcCanAdvance', 'legend', 'chorus', 'memory',
  'group', 'wrong', 'deleted', 'offended',
] as const
export type CtxKey = (typeof CTX_KEYS)[number]
export const HAS_KEYS = ['boris', 'niva'] as const
export type HasKey = (typeof HAS_KEYS)[number]

export type { WhoId }
export type WeddingId = CastId | 'anush'
export type BillPart = 'rent' | 'phone' | 'transit'
export type BillField = 'dueAt' | 'due' | 'unpaid' | 'streak'

/** Точные ключи памяти мира (константы memkeys). */
export type MemExactKey =
  | typeof HEAT | typeof blocked | typeof blockedHint | typeof statusHidden | typeof polite | typeof bloodGiven
  | typeof alikDead | typeof mourning | typeof evicted | typeof vendetta | typeof court | typeof courtVerdict
  | typeof courtReferral | typeof ritualCount | typeof ritualCut | typeof caughtCount | typeof cryptoHodl
  | typeof bathAsked | typeof mamaCalls | typeof phoneKarine | typeof alikShaved | typeof alikDay | typeof mooAt | typeof sorryAt
  | typeof rudeAt | typeof thanksAt | typeof topicRun | typeof topicLast | typeof legendPromiseAt
  | typeof legendId | typeof legendDay | typeof legendArc | typeof nextTransfer | typeof tileCornerRemoved
  | typeof nivaAway | typeof garikConcrete | typeof garikCut | typeof houseOnGarik | typeof borisMarried
  | typeof borisSmetaReady | typeof taxFrozen | typeof taxThawed | typeof actSigned | typeof grantPaid
  | typeof rubikFined | typeof threatClaim | typeof nuneKeyPassed | typeof nuneDekretOver | typeof grandpaDying
  | typeof betonSet | typeof cardSent | typeof saidTomorrow | typeof saidFriday | typeof paydayScene
  | typeof lightOff | typeof netRation | typeof phoneWarn | typeof holidayGreeted
  | typeof creditStage | typeof creditOffer | typeof creditBroke | typeof momDone
  | typeof payday[keyof typeof payday] | typeof count[keyof typeof count]
  | typeof endgame[keyof typeof endgame] | typeof lend50[keyof typeof lend50] | typeof lie[keyof typeof lie]

/** Ключ факта: опечатка — ошибка typecheck (#258). Динамика — только через builders (intro/said/sold…). */
export type FactKey =
  | MemExactKey | EventKey | ActorKey
  | `arc.${ArcId | 'done'}`
  | `ach.${AchId}`
  | `since.${AchId}`
  | `has.${HasKey}`
  | `ctx.${CtxKey}`
  | `said.${ClaimKey}` | `saidLast.${ClaimKey}` | `by.${ClaimKey}` | `cb.${ClaimKey}`
  | `caught.${ClaimKey}|${ClaimKey}`
  | `met.${WhoId}` | `intro.${WhoId}`
  | `asked.${ArcId}` | `doneAsked.${ArcId}` | `finale.${ArcId}` | `legend.of.${ArcId}`
  | `topic.${TopicId}` | `topicMute.${TopicId}`
  | `wedding.${WeddingId}`
  | `bills.${BillPart}.${BillField}`
  | `sold.${ThingId}` | `mom.${MomId}` | `mom.done`
  | `credit.${LoanId}.taken` | `credit.${LoanId}.dueAt` | `credit.${LoanId}.failed`
  | `inv.${string}` // позиции акта — русские названия из invoiceItems; рантайм-сторож в isFactKey

export type SinceKey = `since.${AchId}`

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
  'wedding.': (r) => Object.hasOwn(CAST, r) || r === 'anush',
  'bills.': (r) => /^(rent|phone|transit)\.(dueAt|due|unpaid|streak)$/.test(r),
  'sold.': (r) => /^(microwave|guitar|tile|tires)$/.test(r),
  'mom.': (r) => /^(pension|pickles|dacha|done)$/.test(r),
  'credit.': (r) => /^(consumer|refi|micro)\.(taken|dueAt|failed)$/.test(r),
}

/** Известный ли ключ факта: точный — из реестра, семейный — до элемента. Точное совпадение — раньше семейств. */
export const isFactKey = (key: string): boolean =>
  MEM_KEYS.has(key) || ACTOR_KEYS.has(key) || EVENT_KEYS.has(key)
  || Object.entries(FAMILIES).some(([p, ok]) => key.startsWith(p) && ok(key.slice(p.length)))
