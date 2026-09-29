// Бухгалтерия лжи: типизированный журнал знаний игрока (docs/design/lie-ledger.md).
// Реплика публикует смысл (предмет + значение + источник), а не строка переписки:
// показанный текст, опечатка и формат сообщения не определяют знание. Контент помечает
// реплику ключом утверждения (`claims`), CLAIM_LEDGER переводит ключ в предмет и значение;
// кнопка «Поймать на лжи» читает открытые эпизоды журнала.
import type { ClaimKey, WhoId } from './ids'
import { isWhoId } from './ids'
import { pairKey } from './memkeys'

/** Где лежат деньги — значения предмета `money.location` (документ, таблица MVP). */
export type MoneyLocation =
  | 'bank' | 'dubai' | 'noah' | 'wife' | 'apricots' | 'deposit' | 'wall'
  | 'mattress' | 'crypto' | 'garni' | 'ferry' | 'safe' | 'foundation' | 'niva'

/** Предметы и значения MVP. Первые три взаимоисключающи; остальные — знания без противоречий. */
export interface LedgerValueMap {
  'money.location': MoneyLocation
  'grandpa.life': 'alive' | 'dead'
  'customer.payment': 'owes' | 'paid'
  /** «Всё перевёл» — знание/материал воспоминаний, не несовместимое состояние. */
  'money.sent': 'transferred'
  /** «Денег нет» — знание, а не противоречие «всё перевёл». */
  'money.none': 'gone'
  'beton.mood': 'offended'
  'crane.where': 'wedding'
  'salary.eagle': 'taken'
}
export type LedgerSubject = keyof LedgerValueMap
type LedgerPoint = { [S in LedgerSubject]: { subject: S; value: LedgerValueMap[S] } }[LedgerSubject]

/** Предметы, у которых два разных известных значения — противоречие. */
export const CONFLICTING: ReadonlySet<LedgerSubject> = new Set(['money.location', 'grandpa.life', 'customer.payment'])

export type ClaimSource = 'alik' | WhoId

export interface ClaimRec {
  id: number
  subject: LedgerSubject
  value: string
  /** Кто это сказал: слова Гранта или Нуне не приписываются Алику. */
  source: ClaimSource
  /** Игровой день, когда игрок это услышал. */
  day: number
  /** Сообщение ленты, через которое знание появилось; у мигрированного legacy-знания его нет. */
  msgId?: number
  /** Ключ утверждения контента (или перенесённый из старого сохранения). */
  claimKey?: ClaimKey
}

export interface TransitionRec {
  id: number
  subject: LedgerSubject
  from: string
  /** null — отзыв версии: перехода нет, версия снята. */
  to: string | null
  source: ClaimSource
  day: number
  msgId?: number
}

export type EpisodeStatus = 'open' | 'caught' | 'explained' | 'retracted'

/** Эпизод противоречия — запись состояния, а не одноразовый контекст ответа. */
export interface EpisodeRec {
  id: number
  subject: LedgerSubject
  a: string
  b: string
  aClaim: number
  bClaim: number
  /** День публикации второй версии — день рождения эпизода. */
  day: number
  status: EpisodeStatus
}

export interface LedgerState {
  v: 1
  next: number
  claims: ClaimRec[]
  transitions: TransitionRec[]
  episodes: EpisodeRec[]
}

export function freshLedger(): LedgerState {
  return { v: 1, next: 1, claims: [], transitions: [], episodes: [] }
}

export interface PublishMeta {
  source: ClaimSource
  day: number
  msgId?: number
  claimKey?: ClaimKey
}

/** Опубликовать утверждение: знание появляется только после реально показанной реплики. */
export function publishClaim<S extends LedgerSubject>(l: LedgerState, subject: S, value: LedgerValueMap[S], meta: PublishMeta): ClaimRec {
  const rec: ClaimRec = { id: l.next++, subject, value, ...meta }
  l.claims.push(rec)
  maybeConflict(l, rec)
  return rec
}

/** Отзыв последней версии не возвращает в силу ещё более старую. */
export function activeClaim(l: LedgerState, subject: LedgerSubject): ClaimRec | undefined {
  let best: ClaimRec | undefined
  for (const c of l.claims) if (c.subject === subject && (!best || c.id > best.id)) best = c
  if (best && l.transitions.some((t) => t.subject === subject && t.to === null && t.from === best.value && t.id > best.id)) return undefined
  return best
}

/** Опубликовать переход: известное объяснение, как одно значение сменилось другим. */
export function publishTransition<S extends LedgerSubject>(l: LedgerState, subject: S, from: LedgerValueMap[S], to: LedgerValueMap[S], meta: PublishMeta): TransitionRec {
  const rec: TransitionRec = { id: l.next++, subject, from, to, ...meta }
  l.transitions.push(rec)
  closePair(l, subject, from, to, 'explained')
  return rec
}

/** Опубликовать отзыв версии: открытые эпизоды закрываются, активная версия снимается. */
export function publishRetraction<S extends LedgerSubject>(l: LedgerState, subject: S, value: LedgerValueMap[S], meta: PublishMeta): TransitionRec {
  const rec: TransitionRec = { id: l.next++, subject, from: value, to: null, ...meta }
  l.transitions.push(rec)
  for (const e of l.episodes) {
    if (e.status === 'open' && e.subject === subject && (e.a === value || e.b === value)) e.status = 'retracted'
  }
  return rec
}

/** Открытые эпизоды, новейший первым. */
export function openEpisodes(l: LedgerState, subject?: LedgerSubject): EpisodeRec[] {
  return l.episodes.filter((e) => e.status === 'open' && (!subject || e.subject === subject)).sort((x, y) => y.id - x.id)
}

/** Новейшее открытое противоречие — то, что игрок припомнит первым. */
export function currentEpisode(l: LedgerState): EpisodeRec | null {
  return openEpisodes(l)[0] ?? null
}

/** Закрыть конкретный эпизод: пойман, объяснён переходом или отозван. */
export function closeEpisode(l: LedgerState, id: number, how: Exclude<EpisodeStatus, 'open'>): EpisodeRec | null {
  const e = l.episodes.find((x) => x.id === id)
  if (!e || e.status !== 'open') return null
  e.status = how
  return e
}

function maybeConflict(l: LedgerState, rec: ClaimRec): void {
  if (!CONFLICTING.has(rec.subject)) return
  // активная версия — последняя запись предмета ДО этой публикации
  let active: ClaimRec | undefined
  for (const c of l.claims) if (c.subject === rec.subject && c.id < rec.id && (!active || c.id > active.id)) active = c
  if (!active || active.value === rec.value) return
  if (l.transitions.some((t) => t.subject === rec.subject && t.to === null && t.from === active.value && t.id > active.id && t.id < rec.id)) return
  if (hasTransition(l, rec.subject, active.value, rec.value)) return
  const pair = pairKey(active.value, rec.value)
  if (l.episodes.some((e) => e.subject === rec.subject && e.status === 'open' && pairKey(e.a, e.b) === pair)) return
  l.episodes.push({ id: l.next++, subject: rec.subject, a: active.value, b: rec.value, aClaim: active.id, bClaim: rec.id, day: rec.day, status: 'open' })
}

function hasTransition(l: LedgerState, subject: LedgerSubject, x: string, y: string): boolean {
  const pair = pairKey(x, y)
  return l.transitions.some((t) => t.subject === subject && t.to !== null && pairKey(t.from, t.to) === pair)
}

function closePair(l: LedgerState, subject: LedgerSubject, a: string, b: string, how: Exclude<EpisodeStatus, 'open'>): void {
  const pair = pairKey(a, b)
  for (const e of l.episodes) {
    if (e.status === 'open' && e.subject === subject && pairKey(e.a, e.b) === pair) e.status = how
  }
}

function claimOfValue(l: LedgerState, subject: LedgerSubject, value: string): ClaimRec | undefined {
  let best: ClaimRec | undefined
  for (const c of l.claims) if (c.subject === subject && c.value === value && (!best || c.id > best.id)) best = c
  return best
}

// --- какое типизированное знание публикует ключ утверждения контента.
const point = <S extends LedgerSubject>(subject: S, value: LedgerValueMap[S]): LedgerPoint => ({ subject, value }) as LedgerPoint

/** Ключ утверждения по предмету и значению — текст кнопки и тематические ответы. */
export function claimKeyOf(subject: LedgerSubject, value: string): ClaimKey | undefined {
  for (const [k, p] of Object.entries(CLAIM_LEDGER) as [ClaimKey, LedgerPoint][]) {
    if (p.subject === subject && p.value === value) return k
  }
  return undefined
}

export const CLAIM_LEDGER: Record<ClaimKey, LedgerPoint> = {
  money_jar: point('money.location', 'bank'),
  money_dubai: point('money.location', 'dubai'),
  money_noah: point('money.location', 'noah'),
  money_wife: point('money.location', 'wife'),
  money_apricots: point('money.location', 'apricots'),
  money_deposit: point('money.location', 'deposit'),
  money_wall: point('money.location', 'wall'),
  money_mattress: point('money.location', 'mattress'),
  money_crypto: point('money.location', 'crypto'),
  money_garni: point('money.location', 'garni'),
  money_ferry: point('money.location', 'ferry'),
  money_safe: point('money.location', 'safe'),
  money_foundation: point('money.location', 'foundation'),
  money_niva: point('money.location', 'niva'),
  sent: point('money.sent', 'transferred'),
  no_money: point('money.none', 'gone'),
  grandpa_dead: point('grandpa.life', 'dead'),
  grandpa_alive: point('grandpa.life', 'alive'),
  customer_owes: point('customer.payment', 'owes'),
  customer_paid: point('customer.payment', 'paid'),
  beton: point('beton.mood', 'offended'),
  crane_wedding: point('crane.where', 'wedding'),
  eagle: point('salary.eagle', 'taken'),
}

// --- миграция старых сохранений (docs/design/lie-ledger.md, раздел «Сохранения»)
const LEGACY_SAID = 'said.'
const LEGACY_SAID_LAST = 'saidLast.'
const LEGACY_BY = 'by.'
const LEGACY_CAUGHT = 'caught.'
const LIE_OLD = 'lie.old'
const LIE_NEW = 'lie.new'

const legacyDay = (raw: unknown): number | null => {
  const day = Number(raw)
  return Number.isFinite(day) ? day : null
}

const legacySource = (mem: Record<string, unknown>, claimKey: string): ClaimSource => {
  const who = mem[LEGACY_BY + claimKey]
  return typeof who === 'string' && isWhoId(who) ? who : 'alik'
}

/**
 * Перенести `said.*`/`saidLast.*`/`by.*`/`lie.*`/`caughtPair.*` в журнал. Идемпотентна:
 * журнал с текущей версией возвращается как есть; старые ключи в памяти остаются —
 * новый код от них не зависит, их удаление — отдельная задача совместимости.
 */
export function migrateLedger(mem: Record<string, unknown>, saved: unknown): LedgerState {
  if (saved && typeof saved === 'object' && (saved as LedgerState).v === 1 && Array.isArray((saved as LedgerState).claims)) {
    return saved as LedgerState
  }
  const l = freshLedger()
  const legacy = new Map<string, { mapped: LedgerPoint; day: number }>()
  const collectLegacy = (claimKey: string, raw: unknown): void => {
    if (legacy.has(claimKey)) return
    const mapped = CLAIM_LEDGER[claimKey as ClaimKey]
    const day = legacyDay(raw)
    if (!mapped || day === null) return
    legacy.set(claimKey, { mapped, day })
  }
  // последнее известное saidLast.* — в запись знания без messageId; иначе said.*
  for (const [key, raw] of Object.entries(mem)) {
    if (key.startsWith(LEGACY_SAID_LAST)) collectLegacy(key.slice(LEGACY_SAID_LAST.length), raw)
  }
  for (const [key, raw] of Object.entries(mem)) {
    if (key.startsWith(LEGACY_SAID)) collectLegacy(key.slice(LEGACY_SAID.length), raw)
  }
  for (const [claimKey, { mapped, day }] of [...legacy].sort((a, b) => a[1].day - b[1].day)) {
    l.claims.push({ id: l.next++, subject: mapped.subject, value: mapped.value, source: legacySource(mem, claimKey), day, claimKey: claimKey as ClaimKey })
  }
  // незакрытые lie.old/new — в открытый эпизод, если обе стороны существуют и несовместимы
  const oldK = mem[LIE_OLD], newK = mem[LIE_NEW]
  if (typeof oldK === 'string' && typeof newK === 'string') {
    const o = CLAIM_LEDGER[oldK as ClaimKey], n = CLAIM_LEDGER[newK as ClaimKey]
    if (o && n && o.subject === n.subject && CONFLICTING.has(o.subject) && o.value !== n.value && !hasTransition(l, o.subject, o.value, n.value)) {
      const pair = pairKey(o.value, n.value)
      if (!l.episodes.some((e) => e.subject === o.subject && e.status === 'open' && pairKey(e.a, e.b) === pair)) {
        const ra = claimOfValue(l, o.subject, o.value), rb = claimOfValue(l, o.subject, n.value)
        if (ra && rb) l.episodes.push({ id: l.next++, subject: o.subject, a: o.value, b: n.value, aClaim: ra.id, bClaim: rb.id, day: rb.day, status: 'open' })
      }
    }
  }
  // caughtPair.* закрывает только перенесённый старый эпизод; новым эпизодам та же пары он не мешает
  for (const [key] of Object.entries(mem)) {
    if (!key.startsWith(LEGACY_CAUGHT)) continue
    const [a, b] = key.slice(LEGACY_CAUGHT.length).split('|')
    if (!a || !b) continue
    const pair = pairKey(a, b)
    for (const e of l.episodes) {
      if (e.status !== 'open') continue
      // пара legacy — по ключам утверждений, в журнале эпизод хранит значения
      const ca = l.claims.find((c) => c.id === e.aClaim), cb = l.claims.find((c) => c.id === e.bClaim)
      if (ca?.claimKey && cb?.claimKey && pairKey(ca.claimKey, cb.claimKey) === pair) e.status = 'caught'
    }
  }
  // cb.* (что Алик уже вспоминал) остаются в памяти как есть — callbackCandidate читает их и дальше.
  return l
}
