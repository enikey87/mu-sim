// Реестр ключей памяти мира (S.mem) и досок персонажей (S.actors). Каждый строковый ключ
// проходит через этот модуль: опечатка в ключе — молча мёртвое условие правила. Линтер правил
// (tools.test.ts, keyCheck: isMemKey) и memkeys.test.ts не пускают неизвестные ключи.

/** Ключ пары утверждений «пойманы на противоречии»; канонический формат — здесь, lies.ts реэкспортирует. */
export const pairKey = (a: string, b: string): string => [a, b].sort().join('|')

export const HEAT = 'rude.heat'
export const blocked = 'blocked'
export const blockedHint = 'blocked.hint'
export const polite = 'polite'
export const alikDead = 'alik_dead'
export const mourning = 'mourning'
export const evicted = 'evicted'
export const vendetta = 'vendetta'
export const court = 'court'
export const courtVerdict = 'court.verdict'
export const ritualCount = 'ritual.count'
export const ritualCut = 'ritual.cut'
export const caughtCount = 'caught'
export const cryptoHodl = 'crypto.hodl'
export const bathAsked = 'bath.asked'
export const mamaCalls = 'mama.calls'
export const phoneKarine = 'phone.karine'
export const alikDay = 'alik.day'
export const mooAt = 'mooAt'
export const sorryAt = 'sorryAt'
export const rudeAt = 'rudeAt'
export const topicRun = 'topicRun'
export const topicLast = 'topicLast'
export const legendPromiseAt = 'legendPromiseAt'
export const legendId = 'legend.id'
export const legendDay = 'legend.day'
export const legendArc = 'legend.arc'
export const nextTransfer = 'nextTransfer'
export const tileCornerRemoved = 'tile.cornerRemoved'
export const nivaAway = 'niva.away'
export const garikConcrete = 'garik.concrete'
export const garikCut = 'garik.cut'
export const houseOnGarik = 'house.onGarik'
export const borisMarried = 'boris.married'
export const borisSmetaReady = 'boris.smetaReady'
export const taxFrozen = 'tax.frozen'
export const taxThawed = 'tax.thawed'
export const actSigned = 'act.signed'
export const grantPaid = 'grant.paid'
export const rubikFined = 'rubik.fined'
/** Игрок сдавал кровь — только тогда донорский центр благодарит. */
export const bloodGiven = 'blood.given'
export const nuneKeyPassed = 'nune.keyPassed'
export const nuneDekretOver = 'nune.dekretOver'
export const grandpaDying = 'grandpa.dying'
export const betonSet = 'beton.set'
export const cardSent = 'card.sent'

export const payday = {
  at: 'payday.at', sum: 'payday.sum', chain: 'payday.chain', caught: 'payday.caught',
  morning: 'payday.morning', contra: 'payday.contra', doubt: 'payday.doubt', refused: 'payday.refused',
} as const

export const count = {
  rude: 'count.rude', cow: 'count.cow', threat: 'count.threat',
  violence: 'count.violence', intimidation: 'count.intimidation', sorry: 'count.sorry',
} as const

export const endgame = {
  active: 'endgame.active', started: 'endgame.started', forms: 'endgame.forms',
  exits: 'endgame.exits', mutes: 'endgame.mutes', renames: 'endgame.renames',
} as const

export const lie = { old: 'lie.old', new: 'lie.new', alikOld: 'lie.alikOld', kind: 'lie.kind' } as const

export const said = (claim: string): string => `said.${claim}`
export const saidLast = (claim: string): string => `saidLast.${claim}`
export const byClaim = (claim: string): string => `by.${claim}`
export const cb = (claim: string): string => `cb.${claim}`
export const met = (who: string): string => `met.${who}`
export const intro = (who: string): string => `intro.${who}`
export const asked = (arc: string): string => `asked.${arc}`
export const doneAsked = (arc: string): string => `doneAsked.${arc}`
export const topic = (k: string): string => `topic.${k}`
export const topicMute = (k: string): string => `topicMute.${k}`
export const finaleOf = (arc: string): string => `finale.${arc}`
export const legendOf = (arc: string): string => `legend.of.${arc}`
export const caughtPair = (a: string, b: string): string => `caught.${pairKey(a, b)}`
export const wedding = (who: string): string => `wedding.${who}`
/** Активная сцена Дня выплаты (id узла) — факт на доске мира. */
export const paydayScene = 'payday'

/** Ключи досок персонажей (S.actors), не мира. */
export const sick = 'sick'
export const interjections = 'interjections'
export const ACTOR_KEYS: ReadonlySet<string> = new Set([sick, interjections])

/** Параметризованные namespace'ы mem-ключей. */
export const MEM_PREFIXES: readonly string[] = [
  'said.', 'saidLast.', 'by.', 'cb.', 'caught.', 'met.', 'intro.',
  'asked.', 'doneAsked.', 'topic.', 'topicMute.', 'finale.', 'legend.of.', 'inv.', 'wedding.', 'count.',
]

/** Факты события (собираются в facts() на каждый fire) — не mem, но валидатор обязан их знать. */
export const EVENT_KEYS: ReadonlySet<string> = new Set([
  'day', 'dow', 'month', 'dom', 'sent', 'moo', 'tier', 'mood', 'patience', 'money', 'debt', 'fifty',
  'items', 'latestItem', 'legend', 'mooFresh', 'sinceRude', 'sorrySwing', 'promiseLive',
  'period', 'night', 'offline', 'scene', 'sinceAlik', 'lateCount', 'arcAvailable',
  'arcsStarted', 'arcsDone', 'quests', 'callbackReady', 'arcUnfinished', 'deathCanAdvance',
  'intent', 'tone', 'arg', 'category', 'arc', 'argArcDone',
])
export const EVENT_PREFIXES: readonly string[] = ['arc.', 'ach.', 'since.', 'ctx.', 'has.']

export const MEM_KEYS: ReadonlySet<string> = new Set([
  HEAT, blocked, blockedHint, polite, bloodGiven, alikDead, mourning, evicted, vendetta, court, courtVerdict,
  ritualCount, ritualCut, caughtCount, cryptoHodl, bathAsked, mamaCalls, phoneKarine, alikDay, mooAt, sorryAt,
  rudeAt, topicRun, topicLast, legendPromiseAt, legendId, legendDay, legendArc, nextTransfer, tileCornerRemoved, nivaAway,
  garikConcrete, garikCut, houseOnGarik, borisMarried, borisSmetaReady, taxFrozen, taxThawed,
  actSigned, grantPaid, rubikFined, nuneKeyPassed, nuneDekretOver, grandpaDying, betonSet, cardSent, paydayScene,
  ...Object.values(payday), ...Object.values(count), ...Object.values(endgame), ...Object.values(lie),
])

/** Известный ли ключ факта: mem, доска персонажа или факт события. Точное совпадение — раньше префиксов. */
export const isMemKey = (key: string): boolean =>
  MEM_KEYS.has(key) || ACTOR_KEYS.has(key) || EVENT_KEYS.has(key)
  || MEM_PREFIXES.some((p) => key.startsWith(p)) || EVENT_PREFIXES.some((p) => key.startsWith(p))
