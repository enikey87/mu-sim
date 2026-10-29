// Состояние игры (сохраняется целиком) и сообщения чата.
import type { Bags } from './deck'
import { type Facts, type RuleState, freshRuleState } from './rules'
import { START_DAY } from './time'
import { SAVE_KEY } from './keys'
import type { PromiseCondition, Rel, WhenKind } from '../content/excuses'
import type { Vars } from '../content/scenes'
import { freshLedger, migrateLedger, caughtPairs, type LedgerState } from '../content/ledger'
import { caughtUnique } from '../content/memkeys'
import type { MooPhrase } from './moo'

/** Ключи хранения — в `engine/keys.ts`: их читает и вход страницы, которому состояние игры не нужно. */
export { ENDINGS_SEEN_KEY, LEND50_SEEN_KEY, SAVE_KEY } from './keys'
export const DEBT0 = 240000
/** Старт с запасом: дно должно наступить по пути к Дню выплаты, а не в первые ходы (#184). */
export const START_MONEY = 28000
export const MAX_PATIENCE = 5
/** День 0 партии — календарный факт (`engine/time.ts`): им называют число дней титры шелла (#1444). */
export { START_DAY } from './time'
/** Дней «маринования» до первой арки (#1004): первые дни — только шаблонные отмазки Алика,
 *  без сериалов, легенд и родни; задержка считается в `availableArcs` и `facts` — в одном месте. */
export const ARC_MARINATION_DAYS = 6

export type Tone = 'polite' | 'neutral' | 'rude' | 'threat' | 'cow'
export type InputCategory =
  | 'threat' | 'violent-threat' | 'intimidation'
  | 'insult' | 'accusation' | 'anger' | 'rude'
  | 'request' | 'apology' | 'gratitude' | 'greeting' | 'cow' | 'neutral'

interface MsgBase { id: number; time?: string }
export type Msg =
  | (MsgBase & { kind: 'sep'; text: string })
  | (MsgBase & { kind: 'sys'; text: string; unread?: boolean })
  | (MsgBase & { kind: 'text'; from: 'me' | 'alik'; text: string; who?: string; legend?: boolean; deleted?: boolean; edited?: boolean; react?: string; topical?: boolean; topicText?: string })
  | (MsgBase & { kind: 'transfer'; from: 'alik'; text: string; amount?: number })
  | (MsgBase & { kind: 'voice'; from: 'alik'; /** Старое сохранение: выдуманная длительность, в показе не участвует (#1420). */ len?: number; feast?: boolean; /** Закреплённый звук фразы; у старых сообщений выводится из id. */ moo?: MooPhrase })
  | (MsgBase & { kind: 'photo'; from: 'alik'; text: string })
  | (MsgBase & { kind: 'sticker'; from: 'alik'; e: string; c: string })
  | (MsgBase & { kind: 'fwd'; from: 'alik'; f: string; text: string })
  | (MsgBase & { kind: 'doc'; from: 'alik'; title: string; rows: Array<[string, number]>; total: number })
  | (MsgBase & { kind: 'job'; from: 'alik'; text: string; answered?: boolean })
  | (MsgBase & { kind: 'lend50'; text: string; link?: string; join?: boolean; buy?: boolean; stars?: boolean })
  | (MsgBase & { kind: 'muen'; text: string; link: string })
  | (MsgBase & { kind: 'card' } & Card)

/** Что за событие телефона: по нему оракул отличает законный повтор (сводка, отказ, уровень) от настоящего (#304).
 *  Массив, а не только тип: свип «показал — ответить нельзя» (#1487) сверяет реестр карточек движка
 *  с этим списком, и новое событие без классификации красит сюит. */
export const PHONE_EVENTS = ['bank.summary', 'bank.offer', 'bank.refusal', 'bank.level', 'bank.warn', 'mom', 'life', 'battery', 'unread'] as const
export type PhoneEvent = (typeof PHONE_EVENTS)[number]

/** Карточка телефона в ленте (банк, МФО, мама, Авито): не реплика и не требует нажатия; `offer` — кнопки кредита (#287). */
export interface Card {
  icon: string
  app: string
  text: string
  lines?: string[]
  offer?: { take?: string; sell?: string }
  event?: PhoneEvent
  /** Игровой день показа: числа в результате верны на день нажатия, не показа (#553/#556). */
  day?: number
  /** Кнопки закрыты; `result` — чем кончилось. */
  answered?: boolean
  result?: string
}
/** Недельная сводка банка: что прошло по карте с понедельника `week`; баланс — после последней строки. */
export interface BankWeek {
  week: number
  lines: Record<string, { sum: number; n: number }>
  bal: number
  shown?: Record<string, { sum: number; n: number }>
}

export type NewMsg = Msg extends infer M ? (M extends Msg ? Omit<M, 'id'> : never) : never

/** Контекст последней реплики Алика — на него опираются варианты ответа игрока. */
export interface Ctx {
  type?: 'photo' | 'voice' | 'transfer' | 'readonly' | 'short' | 'idle' | 'sticker' | 'fwd' | 'reactOnly'
  amount?: number
  s?: string
  when?: string
  whenNever?: boolean
  whenKind?: WhenKind
  /** Абсолютный день горизонта срока (у «никогда» и абсурда нет); дни до него от сегодня — `ctx.whenDays`. */
  whenAt?: number
  /** Горизонт события взят из служебной оценки `est`, а не из даты, календаря или конца состояния в мире (#1255). */
  whenEst?: boolean
  /** Игровой день, в который Алик назвал срок — варианты игрока сверяются с календарём. */
  whenMade?: number
  /** Абсолютный день срока (`null` — «когда-нибудь»). */
  whenDue?: number | null
  rel?: Rel
  sad?: boolean
  festive?: boolean
  revived?: boolean
  constr?: boolean
  legendary?: boolean
  arc?: string
  /** Временный факт для строк серии: adjustDebt применил её debt/pay-эффект. */
  debtMoved?: boolean
  group?: boolean
  /** Что сказали в семейном чате — игрок может это процитировать. */
  quote?: string
  wrong?: boolean
  deleted?: boolean
  offended?: boolean
  /** Реплика по легенде денег / вмешался персонаж / Алик вспомнил — игрок может ответить именно на это. */
  legend?: string
  chorus?: string
  memory?: boolean
}

export interface Choice {
  text: string
  tone: Tone
  /** Только у свободно введённого текста; варианты уже несут точный act/arg. */
  category?: InputCategory
  act?: string
  arg?: string | number
  /** Тема вопроса: два варианта про одно и то же в одном блоке не стоят (#887). Ставит контент. */
  topic?: string
  scene?: string
  go?: string | null
  /** Залитая кнопка — только у ответа «Перевёл» в просьбе «займи 50» (#616). */
  primary?: boolean
}

export interface PromiseRec {
  t: string
  made: number
  due: number | null
  /** Названный срок в днях (горизонт от дня обещания, docs/design/deadline-replies.md): по нему
   *  хвост кнопки сверяет новый срок с рекордом партии (#1118). У «никогда» и события без оценки его нет. */
  days?: number
  /** Срок назван игроку числом дней в самой реплике («через 50 дней», «на днях»), а не датой календаря
   *  и не оценкой: только такой `days` игрок слышал как число, и только его называет хвост рекорда (#1269).
   *  У даты (`due`) `days` — производный span: «до Нового года» от 17 марта это 290 дней, которых никто не говорил. */
  daysNamed?: true
  /** Срок назван без точной даты — увёрткой, праздником или словом «когда-нибудь»: по этому роду
   *  отговорка «я обещал „примерно“» отличает свои обещания от точных (#1568). */
  vague?: true
  condition?: PromiseCondition
  met?: number
  asked?: boolean
  /** Алик сдержал слово (50 ₽ вместо перевода долга): в журнале это отдельное состояние, а не «припомнил». */
  kept?: boolean
  /** Ставка клятвы: «если не расплачусь — сбрею усы» (docs/design/moustache.md). */
  stake?: 'moustache'
  stakeDone?: true
  /** День амнистии: срок больше не припомнишь. Не `asked` — то «припомнил» или «сдержал на 50 ₽». */
  amnesty?: number
}
/** Просрочено — одно определение для lateCount, кнопки «вы обещали» и досье: срок с датой прошёл, не припомнено, не амнистировано. */
export const isLate = (p: PromiseRec, day: number): boolean => p.due != null && p.due < day && !p.asked && p.amnesty === undefined

export interface GameState {
  day: number
  clock: number
  /** Пишет один Game.adjustDebt (страж — engine/debt.test.ts). */
  readonly debt: number
  patience: number
  politeStreak: number
  mood: number
  msgs: Msg[]
  nextId: number
  ach: Record<string, number>
  promises: PromiseRec[]
  seen: number[]
  bags: Bags
  items: string[]
  /** fifty — только переводы ровно 50 ₽ (ачивка); paid — любой перевод от Алика (ответ на «спасибо»). */
  stats: { moo: number; fifty: number; paid: number; sent: number }
  offlineDays: number
  ram: boolean
  muted: boolean
  scene: { id: string; node: string; vars: Vars } | null
  ctx: Ctx | null
  choices: Choice[] | null
  /** byAsk — последняя серия показана по вопросу игрока (второй вопрос подряд — «пока без новостей»). */
  arcs: Record<string, { i: number; last: number; byAsk?: boolean }>
  tier: number
  battery: number
  /** Пишет один Game.adjustMoney (страж — engine/money.test.ts). */
  readonly money: number
  lastSeen: number
  /** Память мира для системы правил: счётчики, факты, временные состояния. */
  mem: Facts
  /** Доски памяти персонажей (Карине, Борис, Гарик…). */
  actors: Record<string, Facts>
  /** Состояние движка правил: once, перерывы, расписание, группы. */
  rules: RuleState
  /** Полученные концовки: id → день; ending — концовка, экран которой сейчас открыт. */
  endings: Record<string, number>
  ending: string | null
  /** Интро на экране блокировки показано (или пропущено): повтор — только на новой партии. */
  introShown: boolean
  bank: BankWeek | null
  /** Карточки телефона, отложенные до конца сцены (#300); переживают перезагрузку (#323). */
  pendingCards: Array<{ icon: string; app: string; text: string } & Partial<Pick<Card, 'lines' | 'offer' | 'answered' | 'result'>>>
  /** День, когда звучала строка бедности: окно тишины пула переживает перезагрузку (#387). */
  poorSaid: Record<string, number>
  /** Типизированный журнал знаний игрока: утверждения, переходы, эпизоды противоречий. */
  ledger: LedgerState
}

export function freshState(): GameState {
  return sealCounts({
    day: START_DAY, clock: 9 * 60 + 41, debt: DEBT0, patience: MAX_PATIENCE, politeStreak: 0, mood: 5,
    msgs: [], nextId: 1, ach: {}, promises: [], seen: [], bags: {}, items: [],
    stats: { moo: 0, fifty: 0, paid: 0, sent: 0 },
    offlineDays: 0, ram: false, muted: false, scene: null, ctx: null, choices: null, arcs: {}, tier: 0,
    battery: 100, money: START_MONEY, lastSeen: 0, mem: {}, actors: {}, rules: freshRuleState(), endings: {}, ending: null, introShown: false, bank: null, pendingCards: [], poorSaid: {},
    ledger: freshLedger(),
  })
}

/**
 * Счёт партии (долг, деньги) — геттер без сеттера над приватной ячейкой: присваивание, `Object.assign`,
 * `Reflect.set` и запись по ключу его не меняют (strict mode — TypeError, `Reflect.set` — false).
 * Пишет только `setCount` из `Game.adjustDebt` / `Game.adjustMoney` (страж — `debt.test.ts`, `money.test.ts`).
 */
export type CountKey = 'debt' | 'money'
const CELLS = new WeakMap<object, Record<CountKey, number>>()
const cell = (s: GameState): Record<CountKey, number> => {
  const c = CELLS.get(s)
  if (!c) throw new Error('счёт без ячейки: состояние собрано не freshState/loadState')
  return c
}
export const countOf = (s: GameState, key: CountKey): number => cell(s)[key]
export const setCount = (s: GameState, key: CountKey, v: number): void => { cell(s)[key] = v }

/** Значение — в ячейку, на объекте остаётся только чтение (enumerable — иначе `JSON.stringify` его не сохранит). */
function sealCounts(s: GameState): GameState {
  CELLS.set(s, { debt: s.debt, money: s.money })
  for (const key of ['debt', 'money'] as CountKey[]) {
    Object.defineProperty(s, key, { get: (): number => cell(s)[key], enumerable: true, configurable: false })
  }
  return s
}

export interface Storage {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

/** Не-числа в сейве дают NaN в окне тишины и навсегда глушат строку (#401). */
function loadPoorSaid(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number') out[k] = v
  }
  return out
}

export function loadState(storage: Storage | null): GameState | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(SAVE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s || !Array.isArray(s.msgs)) return null
    // старые сохранения без introShown — сразу в чат: иначе интро врёт по обрезанной ленте (#249)
    const ledger = migrateLedger(s.mem ?? {}, s.ledger)
    // #1481: старые сохранения знали только тотальный `caught`; широта восстанавливается из журнала —
    // штамп пары здесь эпизод со статусом `caught`, отдельного ключа на пару партия не пишет
    const mem = { ...(s.mem ?? {}) }
    if (mem[caughtUnique] === undefined) mem[caughtUnique] = caughtPairs(ledger)
    return sealCounts({
      ...freshState(), ...s,
      introShown: typeof s.introShown === 'boolean' ? s.introShown : true,
      pendingCards: Array.isArray(s.pendingCards) ? s.pendingCards : [],
      poorSaid: loadPoorSaid(s.poorSaid),
      ledger,
      mem,
    })
  } catch {
    return null
  }
}

export function saveState(storage: Storage | null, s: GameState): void {
  if (!storage) return
  try {
    // в сохранение — только последние 150 сообщений; живая история на экране не обрезается
    storage.setItem(SAVE_KEY, JSON.stringify({ ...s, msgs: s.msgs.slice(-150) }))
  } catch { /* нет storage — играем без сохранения */ }
}

/** Отметка устройства → id открытых концовок. Битая строка (старая сборка, чужая правка) — пустая коллекция,
 *  а не падение: отметка живёт дольше одной версии сборки. */
export function endingsOnDevice(raw: string | null): Set<string> {
  if (!raw) return new Set()
  try {
    const ids: unknown = JSON.parse(raw)
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

/** Отметка после концовки: прежние id на месте, одна и та же концовка не двоится. */
export function withEndingOnDevice(raw: string | null, id: string): string {
  const ids = [...endingsOnDevice(raw)]
  if (!ids.includes(id)) ids.push(id)
  return JSON.stringify(ids)
}
