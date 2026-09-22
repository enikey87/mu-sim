// Типы событийно-ответной системы правил.
// По мотивам доклада Valve (Left 4 Dead, «AI-driven Dynamic Dialog»), Firewatch, The Last of Us
// и их порта в gorecode/kawaii-doom (EventResponseService, FactBlackboard, EventResponseGroup).

export type Value = string | number | boolean | null | undefined
export type Facts = Record<string, Value>

/**
 * Где искать факт:
 * - event  — факты самого события и «процедурные» факты мира на момент запроса;
 * - sender / target — доска памяти персонажа-отправителя / получателя события;
 * - world  — общая память мира.
 * Без scope — каскад: event → target → sender → world.
 */
export type Scope = 'event' | 'sender' | 'target' | 'world'
export type WriteScope = 'world' | 'sender' | 'target'

export type Op = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'exist' | '!exist' | 'match' | 'all'

export interface Criterion {
  key: string
  op: Op
  value?: Value | RegExp
  scope?: Scope
  /** Читать с доски конкретного персонажа (например, «Борис болеет»), независимо от sender/target. */
  actor?: string
  /** Для именованного условия (op: 'all'): его составляющие. */
  all?: Criterion[]
}

export interface FactOp {
  key: string
  /** = присвоить, + прибавить, * умножить, ! инвертировать (0 ↔ 1). */
  op: '=' | '+' | '*' | '!'
  value?: number | string | boolean
  scope?: WriteScope
  /** Записать не сразу, а через N игровых дней. */
  delay?: number
  /** Факт действует N игровых дней, потом возвращается прежнее значение (только для '='). */
  forDays?: number
}

/** `E` — имена событий игры: движок generic, контент подставляет свой union (content/rules/events.ts). */
export interface Trigger<E extends string = string> {
  event: E
  facts?: Facts
  /** Через N игровых дней (иначе — сразу после ответа). */
  delay?: number
  /** Шанс, что событие вообще будет вызвано (0..1). */
  probability?: number
  /** Вызвать, только если ответ правила что-то сделал (respond не вернул false). */
  ifResponded?: boolean
  /** Отправитель/получатель следующего события (по умолчанию — те же, что у текущего). */
  sender?: string
  target?: string
}

export interface Cooldown {
  /** Не срабатывать повторно N ходов игрока. */
  turns?: number
  /** Не срабатывать повторно N игровых дней. */
  days?: number
}

/** Приоритет речи (как в The Last of Us): ниже текущего порога — отклоняется. */
export type Priority = 'idle' | 'chatter' | 'default' | 'cinematic' | 'system'
export const PRIORITY: Record<Priority, number> = { idle: 0, chatter: 1, default: 2, cinematic: 3, system: 4 }

export interface Query {
  event: string
  sender?: string
  target?: string
  /** Факты события. */
  facts?: Facts
}

export interface RuleCtx<G> {
  game: G
  facts: Facts
  rule: Rule<G>
  query: Query
  /** Прочитать факт с учётом досок (для ответов, которым нужна память персонажа). */
  get: (key: string, scope?: Scope, actor?: string) => Value
}

export interface Rule<G, E extends string = string> {
  name: string
  event: E
  when: Criterion[]
  /** Правило только для событий от этого персонажа / к этому персонажу (+1 к специфичности каждое). */
  sender?: string
  target?: string
  /** Явная специфичность (по умолчанию = условия + sender/target + bonus). */
  specificity?: number
  /** Фиктивные условия для приоритета (requirementsDummy). */
  bonus?: number
  /** Вес при выборе среди равных по специфичности. */
  weight?: number | ((facts: Facts) => number)
  /** Шанс сработать при выполненных условиях (0..1). */
  odds?: number
  /** Один раз за игру (matchOnce). */
  once?: boolean
  /** Перерыв после срабатывания. */
  cooldown?: Cooldown
  /** Приоритет речи; по умолчанию 'default'. */
  priority?: Priority
  /** Записи в память перед ответом (applyFacts). */
  remember?: FactOp[]
  /** Ответ. Вернуть false — «ничего не сделал» (для trigger.ifResponded). */
  respond?: (ctx: RuleCtx<G>) => void | boolean | Promise<void | boolean>
  /** Для событий-сборщиков: что правило предлагает. */
  offer?: (ctx: RuleCtx<G>) => unknown
  /** Из правил с одинаковым слотом сборщик берёт только лучшее. */
  slot?: string
  /** Следующие события (сразу — после ответа, то есть «после того как реплика прозвучала»). */
  trigger?: Trigger<E>[]
}

// ---- трассировка ----
export type Blocked = 'odds' | 'once' | 'cooldown' | 'priority'
export interface Candidate {
  name: string
  specificity: number
  ok: boolean
  /** Невыполненные условия. */
  failed: string[]
  blocked?: Blocked
}
export interface Trace {
  event: string
  mode: 'match' | 'collect'
  facts: Facts
  sender?: string
  target?: string
  candidates: Candidate[]
  chosen: string[]
}

// ---- персистентное состояние движка ----
export interface GroupState { n: number; left: number[] | null; last: number; seq?: number }

export type Scheduled =
  | { at: number; kind: 'ops'; ops: FactOp[]; sender?: string; target?: string }
  | { at: number; kind: 'restore'; key: string; scope: WriteScope; actor?: string; value: Value }
  | { at: number; kind: 'event'; event: string; facts?: Facts; sender?: string; target?: string }

export interface RuleState {
  once: Record<string, boolean>
  cooldown: Record<string, { turn: number; day: number }>
  schedule: Scheduled[]
  groups: Record<string, GroupState>
  /** Реплики, которые уже прозвучали: id → когда (для «один раз» и перерывов). */
  said: Record<string, { turn: number; day: number }>
}

export const freshRuleState = (): RuleState => ({ once: {}, cooldown: {}, schedule: [], groups: {}, said: {} })
