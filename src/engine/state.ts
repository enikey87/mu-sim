// Состояние игры (сохраняется целиком) и сообщения чата.
import type { Bags } from './deck'
import { type Facts, type RuleState, freshRuleState } from './rules'
import type { PromiseCondition, Rel } from '../content/excuses'
import type { Vars } from '../content/scenes'

export const SAVE_KEY = 'alik-save-v4'
export const DEBT0 = 240000
export const MAX_PATIENCE = 5
export const START_DAY = 184

export type Tone = 'polite' | 'neutral' | 'rude' | 'threat' | 'cow'
export type InputCategory =
  | 'threat' | 'violent-threat' | 'intimidation'
  | 'insult' | 'accusation' | 'anger' | 'rude'
  | 'request' | 'apology' | 'gratitude' | 'greeting' | 'cow' | 'neutral'

interface MsgBase { id: number; time?: string }
export type Msg =
  | (MsgBase & { kind: 'sep'; text: string })
  | (MsgBase & { kind: 'sys'; text: string; unread?: boolean })
  | (MsgBase & { kind: 'text'; from: 'me' | 'alik'; text: string; who?: string; legend?: boolean; deleted?: boolean; edited?: boolean; react?: string; topical?: boolean })
  | (MsgBase & { kind: 'transfer'; from: 'alik'; text: string; amount?: number })
  | (MsgBase & { kind: 'voice'; from: 'alik'; len: number; feast?: boolean })
  | (MsgBase & { kind: 'photo'; from: 'alik'; text: string })
  | (MsgBase & { kind: 'sticker'; from: 'alik'; e: string; c: string })
  | (MsgBase & { kind: 'fwd'; from: 'alik'; f: string; text: string })
  | (MsgBase & { kind: 'doc'; from: 'alik'; title: string; rows: Array<[string, number]>; total: number })
  | (MsgBase & { kind: 'job'; from: 'alik'; text: string; answered?: boolean })

export type NewMsg = Msg extends infer M ? (M extends Msg ? Omit<M, 'id'> : never) : never

/** Контекст последней реплики Алика — на него опираются варианты ответа игрока. */
export interface Ctx {
  type?: 'photo' | 'voice' | 'transfer' | 'readonly' | 'short' | 'idle' | 'sticker' | 'fwd' | 'reactOnly'
  amount?: number
  s?: string
  when?: string
  whenNever?: boolean
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
  scene?: string
  go?: string | null
}

export interface PromiseRec {
  t: string
  made: number
  due: number | null
  condition?: PromiseCondition
  met?: number
  asked?: boolean
  /** День амнистии: срок больше не припомнишь. Не `asked` — то «припомнил» или «сдержал на 50 ₽». */
  amnesty?: number
}
/** Просрочено — одно определение для lateCount, кнопки «вы обещали» и досье: срок с датой прошёл, не припомнено, не амнистировано. */
export const isLate = (p: PromiseRec, day: number): boolean => p.due != null && p.due < day && !p.asked && p.amnesty === undefined

export interface GameState {
  day: number
  clock: number
  /** Только чтение: пишет один Game.adjustDebt (после Дня выплаты долг запечатан). Страж — engine/debt.test.ts. */
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
  stats: { moo: number; fifty: number; sent: number }
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
  money: number
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
}

export function freshState(): GameState {
  return {
    day: START_DAY, clock: 9 * 60 + 41, debt: DEBT0, patience: MAX_PATIENCE, politeStreak: 0, mood: 5,
    msgs: [], nextId: 1, ach: {}, promises: [], seen: [], bags: {}, items: [],
    stats: { moo: 0, fifty: 0, sent: 0 },
    offlineDays: 0, ram: false, muted: false, scene: null, ctx: null, choices: null, arcs: {}, tier: 0,
    battery: 100, money: 12400, lastSeen: 0, mem: {}, actors: {}, rules: freshRuleState(), endings: {}, ending: null, introShown: false,
  }
}

export interface Storage {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

export function loadState(storage: Storage | null): GameState | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(SAVE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    return s && Array.isArray(s.msgs) ? { ...freshState(), ...s } : null
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
