// Событийно-ответная система правил по мотивам доклада Valve (Left 4 Dead, «AI-driven Dynamic Dialog»)
// и её реализации в gorecode/kawaii-doom (EventResponseService).
//
// Событие (concept) + факты → выбирается САМОЕ СПЕЦИФИЧНОЕ правило (больше всего условий),
// среди равных — случайное с учётом веса. Правило может записать факты в память (remember)
// и вызвать следующие события (trigger). Общий ответ работает по умолчанию, частный случай —
// отдельное правило с дополнительным условием, без правки общего.
import { type Rng } from './rng'

export type Value = string | number | boolean | null | undefined
export type Facts = Record<string, Value>

export type Op = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'exist' | '!exist' | 'match'

export interface Criterion {
  key: string
  op: Op
  value?: Value | RegExp
}

export interface FactOp {
  key: string
  op: '=' | '+'
  value: number | string | boolean
}

export interface Trigger {
  event: string
  facts?: Facts
}

export interface RuleCtx<G> {
  game: G
  facts: Facts
  rule: Rule<G>
}

export interface Rule<G> {
  name: string
  event: string
  when: Criterion[]
  /** Явная специфичность (по умолчанию = число условий + bonus). */
  specificity?: number
  /** Дополнительные «фиктивные» условия для приоритета (requirementsDummy). */
  bonus?: number
  /** Вес при выборе среди равных по специфичности (число или функция от фактов). */
  weight?: number | ((facts: Facts) => number)
  /** Вероятность, что правило сработает, даже если условия выполнены (0..1). */
  odds?: number
  /** Сработать только один раз за игру (matchOnce). */
  once?: boolean
  /** Записать факты в память перед ответом (applyFacts). */
  remember?: FactOp[]
  /** Ответ. */
  respond?: (ctx: RuleCtx<G>) => void | Promise<void>
  /** Для событий-сборщиков (collect): что правило предлагает. */
  offer?: (ctx: RuleCtx<G>) => unknown
  /** Слот: из правил с одинаковым слотом collect берёт только лучшее. */
  slot?: string
  /** События, которые запускаются после ответа. */
  trigger?: Trigger[]
}

// ---- условия ----
export const eq = (key: string, value: Value): Criterion => ({ key, op: '==', value })
export const ne = (key: string, value: Value): Criterion => ({ key, op: '!=', value })
export const gt = (key: string, value: number): Criterion => ({ key, op: '>', value })
export const gte = (key: string, value: number): Criterion => ({ key, op: '>=', value })
export const lt = (key: string, value: number): Criterion => ({ key, op: '<', value })
export const lte = (key: string, value: number): Criterion => ({ key, op: '<=', value })
export const exists = (key: string): Criterion => ({ key, op: 'exist' })
export const missing = (key: string): Criterion => ({ key, op: '!exist' })
export const matches = (key: string, re: RegExp): Criterion => ({ key, op: 'match', value: re })
export const is = (key: string): Criterion => eq(key, true)
export const set = (key: string, value: number | string | boolean): FactOp => ({ key, op: '=', value })
export const add = (key: string, value = 1): FactOp => ({ key, op: '+', value })

export function test(c: Criterion, facts: Facts): boolean {
  const v = facts[c.key]
  switch (c.op) {
    case 'exist': return v !== undefined && v !== null && v !== false && v !== ''
    case '!exist': return v === undefined || v === null || v === false || v === ''
    case '==': return v === c.value || (v === undefined && c.value === false)
    case '!=': return v !== c.value
    case 'match': return typeof v === 'string' && (c.value as RegExp).test(v)
  }
  const n = typeof v === 'number' ? v : Number(v ?? 0)
  const x = c.value as number
  switch (c.op) {
    case '<': return n < x
    case '<=': return n <= x
    case '>': return n > x
    case '>=': return n >= x
  }
  return false
}

export const specificityOf = <G>(r: Rule<G>): number => r.specificity ?? r.when.length + (r.bonus ?? 0)

export function applyFactOps(memory: Facts, ops: FactOp[] | undefined): void {
  for (const o of ops ?? []) {
    if (o.op === '=') memory[o.key] = o.value
    else memory[o.key] = Number(memory[o.key] ?? 0) + Number(o.value)
  }
}

export class RuleSet<G> {
  private byEvent = new Map<string, Rule<G>[]>()
  readonly all: Rule<G>[] = []

  constructor(
    private rng: Rng,
    /** Память (персистентные факты). Сюда пишут remember и отметки once. */
    private memory: Facts,
  ) {}

  add(...rules: Rule<G>[]): this {
    for (const r of rules) {
      if (this.all.some((x) => x.name === r.name)) throw new Error(`Duplicate rule name: ${r.name}`)
      this.all.push(r)
      const list = this.byEvent.get(r.event) ?? []
      list.push(r)
      list.sort((a, b) => specificityOf(b) - specificityOf(a))
      this.byEvent.set(r.event, list)
    }
    return this
  }

  rules(event: string): Rule<G>[] {
    return this.byEvent.get(event) ?? []
  }

  private passes(r: Rule<G>, facts: Facts): boolean {
    if (r.once && this.memory[`once.${r.name}`]) return false
    if (!r.when.every((c) => test(c, facts))) return false
    if (r.odds !== undefined && this.rng.random() >= r.odds) return false
    return true
  }

  // Упорядочить равные по специфичности правила: взвешенная случайная перестановка
  private weightedOrder(list: Rule<G>[], facts: Facts): Rule<G>[] {
    const w = (r: Rule<G>): number => Math.max(0, typeof r.weight === 'function' ? r.weight(facts) : (r.weight ?? 1))
    const pool = list.slice()
    const out: Rule<G>[] = []
    while (pool.length) {
      const total = pool.reduce((n, r) => n + w(r), 0)
      let x = this.rng.random() * total
      let i = 0
      for (; i < pool.length - 1; i++) {
        x -= w(pool[i])
        if (x < 0) break
      }
      out.push(pool.splice(i, 1)[0])
    }
    return out
  }

  /** Лучшее правило для события или null. */
  match(event: string, facts: Facts): Rule<G> | null {
    const list = this.rules(event)
    let best = -1
    const tied: Rule<G>[] = []
    for (const r of list) {
      const s = specificityOf(r)
      if (best !== -1 && s < best) break
      if (!this.passes(r, facts)) continue
      if (best === -1) best = s
      tied.push(r)
    }
    return tied.length ? this.weightedOrder(tied, facts)[0] : null
  }

  /** Все подходящие правила: по убыванию специфичности, равные — взвешенно перемешаны, по одному на слот. */
  collect(event: string, facts: Facts): Rule<G>[] {
    const groups = new Map<number, Rule<G>[]>()
    for (const r of this.rules(event)) {
      if (!this.passes(r, facts)) continue
      const s = specificityOf(r)
      groups.set(s, [...(groups.get(s) ?? []), r])
    }
    const ordered = [...groups.keys()].sort((a, b) => b - a).flatMap((s) => this.weightedOrder(groups.get(s)!, facts))
    const slots = new Set<string>()
    return ordered.filter((r) => {
      if (!r.slot) return true
      if (slots.has(r.slot)) return false
      slots.add(r.slot)
      return true
    })
  }

  /** Отметить срабатывание: remember + once. */
  commit(r: Rule<G>): void {
    applyFactOps(this.memory, r.remember)
    if (r.once) this.memory[`once.${r.name}`] = true
  }

  /**
   * Вызвать событие: найти лучшее правило, записать память, выполнить ответ и цепочку событий.
   * factsFor — сборщик фактов (пересобирается для каждого события цепочки, чтобы видеть свежую память).
   */
  async fire(event: string, game: G, factsFor: (extra: Facts) => Facts, extra: Facts = {}, depth = 0): Promise<Rule<G> | null> {
    if (depth > 8) throw new Error(`Rule trigger chain too deep at ${event}`)
    const facts = factsFor(extra)
    const r = this.match(event, facts)
    if (!r) return null
    this.commit(r)
    await r.respond?.({ game, facts, rule: r })
    for (const t of r.trigger ?? []) await this.fire(t.event, game, factsFor, t.facts ?? {}, depth + 1)
    return r
  }
}
