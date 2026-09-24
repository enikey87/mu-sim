// Набор правил: выбор самого специфичного, сборщик, память, перерывы, приоритеты, расписание.
import type { Rng } from '../rng'
import type {
  Blocked, Candidate, Facts, FactOp, Priority, Query, Rule, RuleCtx, RuleState, Scheduled, Trace, Value, WriteScope,
} from './types'
import { PRIORITY } from './types'
import { test, describeCriterion } from './criteria'
import { type Hub, resolver, writeBoard, applyOp, actorOf } from './blackboard'

export const specificityOf = <G>(r: Rule<G>): number =>
  r.specificity ?? r.when.length + (r.sender ? 1 : 0) + (r.target ? 1 : 0) + (r.bonus ?? 0)

export interface Clock {
  turn: number
  day: number
}

export interface RuleSetOptions<G = unknown> {
  rng: Rng
  hub: Hub
  state: RuleState
  /** Текущий ход игрока и игровой день — для перерывов и расписания. */
  now: () => Clock
  /**
   * Строгий режим молчания: зовётся до commit правила, возвращает проверку, которую fire вызовет после отката
   * промолчавшего правила. Проверка бросает, если ответ успел что-то записать в игру.
   */
  silence?: (game: G, rule: Rule<G>) => () => void
}

export interface FireOptions {
  /** Порог приоритета: правила ниже него отклоняются. */
  floor?: Priority
  /** Имена правил, уже промолчавших в этом `fire` — match их не берёт (иначе вечная тишина заслоняет остальных). */
  skip?: ReadonlySet<string>
  /** Броски шанса (odds) этого `fire`: повторный match берёт выпавшее, а не бросает заново. */
  rolled?: Map<string, boolean>
}

export class RuleSet<G, O = unknown> {
  private byEvent = new Map<string, Rule<G, string, O>[]>()
  readonly all: Rule<G, string, O>[] = []
  /** Если задан — получает трассировку каждого выбора. */
  tracer: ((t: Trace) => void) | null = null
  readonly hub: Hub
  readonly state: RuleState
  private rng: Rng
  private now: () => Clock

  private silence: RuleSetOptions<G>['silence']

  constructor(o: RuleSetOptions<G>) {
    this.rng = o.rng
    this.silence = o.silence
    this.hub = o.hub
    this.state = o.state
    this.now = o.now
  }

  add(...rules: Rule<G, string, O>[]): this {
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

  rules(event: string): Rule<G, string, O>[] {
    return this.byEvent.get(event) ?? []
  }

  // ---- проверка одного правила ----
  private check(r: Rule<G, string, O>, q: Query, facts: Facts, floor: number, rolled?: Map<string, boolean>): Candidate {
    const get = resolver(this.hub, q, facts)
    const failed = r.when.filter((c) => !test(c, get)).map(describeCriterion)
    if (r.sender && r.sender !== q.sender) failed.push(`sender == ${r.sender}`)
    if (r.target && r.target !== q.target) failed.push(`target == ${r.target}`)
    const cand: Candidate = { name: r.name, specificity: specificityOf(r), ok: false, failed }
    const blocked = failed.length ? undefined : this.blocked(r, floor, rolled)
    if (failed.length) return cand
    if (blocked) return { ...cand, blocked }
    return { ...cand, ok: true }
  }

  private blocked(r: Rule<G, string, O>, floor: number, rolled?: Map<string, boolean>): Blocked | undefined {
    if (PRIORITY[r.priority ?? 'default'] < floor) return 'priority'
    if (r.once && this.state.once[r.name]) return 'once'
    const cd = r.cooldown && this.state.cooldown[r.name]
    if (cd) {
      const now = this.now()
      if ((r.cooldown!.turns !== undefined && now.turn - cd.turn < r.cooldown!.turns) || (r.cooldown!.days !== undefined && now.day - cd.day < r.cooldown!.days)) return 'cooldown'
    }
    if (r.odds !== undefined) {
      let pass = rolled?.get(r.name)
      if (pass === undefined) { pass = this.rng.random() < r.odds; rolled?.set(r.name, pass) }
      if (!pass) return 'odds'
    }
    return undefined
  }

  private weightedOrder(list: Rule<G, string, O>[], facts: Facts): Rule<G, string, O>[] {
    const w = (r: Rule<G, string, O>): number => Math.max(0, typeof r.weight === 'function' ? r.weight(facts) : (r.weight ?? 1))
    const pool = list.slice()
    const out: Rule<G, string, O>[] = []
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

  /** Лучшее правило для запроса или null. */
  match(q: Query, facts: Facts = q.facts ?? {}, opts: FireOptions = {}): Rule<G, string, O> | null {
    const floor = PRIORITY[opts.floor ?? 'idle']
    const skip = opts.skip
    const trace: Candidate[] | null = this.tracer ? [] : null
    let best = -1
    const tied: Rule<G, string, O>[] = []
    for (const r of this.rules(q.event)) {
      const s = specificityOf(r)
      if (skip?.has(r.name)) {
        trace?.push({ name: r.name, specificity: s, ok: false, failed: ['уже промолчало в этом выборе'] })
        continue
      }
      if (best !== -1 && s < best) {
        if (!trace) break
        // для объяснения — досчитываем остальных, не тратя случайность на их шанс
        trace.push({ name: r.name, specificity: s, ok: false, failed: ['проиграло по специфичности'] })
        continue
      }
      const c = this.check(r, q, facts, floor, opts.rolled)
      trace?.push(c)
      if (!c.ok) continue
      if (best === -1) best = s
      tied.push(r)
    }
    const win = tied.length ? this.weightedOrder(tied, facts)[0] : null
    if (trace) this.tracer!({ event: q.event, mode: 'match', facts, sender: q.sender, target: q.target, candidates: trace, chosen: win ? [win.name] : [] })
    return win
  }

  /** Все подходящие: по убыванию специфичности, равные — взвешенно перемешаны, по одному на слот. */
  collect(q: Query, facts: Facts = q.facts ?? {}, opts: FireOptions = {}): Rule<G, string, O>[] {
    const floor = PRIORITY[opts.floor ?? 'idle']
    const trace: Candidate[] | null = this.tracer ? [] : null
    const groups = new Map<number, Rule<G, string, O>[]>()
    for (const r of this.rules(q.event)) {
      const c = this.check(r, q, facts, floor)
      trace?.push(c)
      if (!c.ok) continue
      groups.set(c.specificity, [...(groups.get(c.specificity) ?? []), r])
    }
    const ordered = [...groups.keys()].sort((a, b) => b - a).flatMap((s) => this.weightedOrder(groups.get(s)!, facts))
    const slots = new Set<string>()
    const out = ordered.filter((r) => {
      if (!r.slot) return true
      if (slots.has(r.slot)) return false
      slots.add(r.slot)
      return true
    })
    if (trace) this.tracer!({ event: q.event, mode: 'collect', facts, sender: q.sender, target: q.target, candidates: trace, chosen: out.map((r) => r.name) })
    return out
  }

  /** Контекст ответа правила. */
  ctx(game: G, r: Rule<G, string, O>, q: Query, facts: Facts): RuleCtx<G> {
    return { game, facts, rule: r, query: q, get: resolver(this.hub, q, facts) }
  }

  // ---- память ----
  /**
   * Применить записи: сразу, с задержкой (delay) или на время (forDays).
   * `undo` — журнал отката: правило, которое промолчит, не оставляет следов (см. commit).
   */
  applyOps(ops: FactOp[] | undefined, q: Pick<Query, 'sender' | 'target'>, undo?: Array<() => void>): void {
    const day = this.now().day
    for (const o of ops ?? []) {
      if (o.delay) {
        const item: Scheduled = { at: day + o.delay, kind: 'ops', ops: [{ ...o, delay: undefined }], sender: q.sender, target: q.target }
        this.schedule(item)
        undo?.push(() => { this.state.schedule = this.state.schedule.filter((x) => x !== item) })
        continue
      }
      const board = writeBoard(this.hub, q, o.scope)
      if (!board) continue
      if (o.forDays && o.op === '=') {
        const item: Scheduled = { at: day + o.forDays, kind: 'restore', key: o.key, scope: o.scope ?? 'world', actor: actorOf(q, o.scope), value: board[o.key] }
        this.schedule(item)
        undo?.push(() => { this.state.schedule = this.state.schedule.filter((x) => x !== item) })
      }
      const was = board[o.key]
      applyOp(board, o)
      const wrote = board[o.key]
      // откат — только своей записи: если во время ответа тот же факт переписали, чужая запись остаётся
      undo?.push(() => { if (board[o.key] !== wrote) return; if (was === undefined) delete board[o.key]; else board[o.key] = was })
    }
  }

  /**
   * Отметить срабатывание: once, перерыв, память. Возвращает откат — правило, которое промолчит
   * (respond вернул false), не тратит разовый шанс и не оставляет следов в мире.
   */
  commit(r: Rule<G, string, O>, q: Query): () => void {
    const undo: Array<() => void> = []
    // once до match не доходит (blocked) — откат снимает отметку; у перерыва прежняя отметка истекла, но была — её и вернуть
    if (r.once) { this.state.once[r.name] = true; undo.push(() => { delete this.state.once[r.name] }) }
    if (r.cooldown) {
      const was = this.state.cooldown[r.name]
      this.state.cooldown[r.name] = { ...this.now() }
      undo.push(() => { if (was) this.state.cooldown[r.name] = was; else delete this.state.cooldown[r.name] })
    }
    this.applyOps(r.remember, q, undo)
    // в обратном порядке: две записи одного факта возвращаются к исходному значению
    return () => { for (let i = undo.length - 1; i >= 0; i--) undo[i]!() }
  }

  // ---- расписание ----
  schedule(item: Scheduled): void {
    this.state.schedule.push(item)
    this.state.schedule.sort((a, b) => a.at - b.at)
  }

  /** Записи и откаты, наступившие к текущему дню, — сразу (при смене дня мир уже другой); события ждут due(). */
  settle(): void {
    const day = this.now().day
    const ready = this.state.schedule.filter((it): it is Exclude<Scheduled, { kind: 'event' }> => it.at <= day && it.kind !== 'event')
    this.state.schedule = this.state.schedule.filter((it) => it.at > day || it.kind === 'event')
    for (const it of ready) {
      if (it.kind === 'ops') this.applyOps(it.ops, it)
      else this.restore(it.scope, it.actor, it.key, it.value)
    }
  }

  /** Отложенные события, которые наступили к текущему дню (записи и откаты применяются сразу). */
  due(): Array<Extract<Scheduled, { kind: 'event' }>> {
    this.settle()
    const day = this.now().day
    const events: Array<Extract<Scheduled, { kind: 'event' }>> = []
    const later: Scheduled[] = []
    for (const it of this.state.schedule) {
      if (it.at <= day && it.kind === 'event') events.push(it)
      else later.push(it)
    }
    this.state.schedule = later
    return events
  }

  private restore(scope: WriteScope, actor: string | undefined, key: string, value: Value): void {
    const board = scope === 'world' ? this.hub.world : actor ? this.hub.actor(actor) : null
    if (!board) return
    if (value === undefined) delete board[key]
    else board[key] = value
  }

  /**
   * Вызвать событие: лучшее правило → память → ответ → цепочка событий.
   * factsFor пересобирает факты на каждое событие цепочки (чтобы видеть свежую память).
   * Промолчавшее правило (respond → false) откатывается; fire берёт следующее подходящее —
   * иначе правило, которое молчит всегда, заслоняло бы остальных на каждом ходе.
   * Если промолчали все — null, вызывающий отвечает сам.
   */
  async fire(game: G, q: Query, factsFor: (extra: Facts) => Facts, opts: FireOptions = {}, depth = 0): Promise<Rule<G, string, O> | null> {
    if (depth > 8) throw new Error(`Rule trigger chain too deep at ${q.event}`)
    const skip = new Set(opts.skip ?? [])
    const rolled = new Map<string, boolean>()
    while (true) {
      const facts = factsFor(q.facts ?? {})
      const r = this.match(q, facts, { ...opts, skip, rolled })
      if (!r) return null
      const check = this.silence?.(game, r)
      const undo = this.commit(r, q)
      const res = await r.respond?.(this.ctx(game, r, q, facts))
      const responded = res !== false
      if (!responded) { undo(); check?.(); skip.add(r.name); continue } // не случилось — и триггеров нет
      for (const t of r.trigger ?? []) {
        if (t.probability !== undefined && this.rng.random() >= t.probability) continue
        const next: Query = { event: t.event, facts: t.facts, sender: t.sender ?? q.sender, target: t.target ?? q.target }
        if (t.delay) this.schedule({ at: this.now().day + t.delay, kind: 'event', ...next })
        else await this.fire(game, next, factsFor, opts, depth + 1)
      }
      return r
    }
  }

  /** Вызвать все наступившие отложенные события. */
  async runDue(game: G, factsFor: (extra: Facts) => Facts, opts: FireOptions = {}): Promise<number> {
    const events = this.due()
    for (const e of events) await this.fire(game, { event: e.event, facts: e.facts, sender: e.sender, target: e.target }, factsFor, opts)
    return events.length
  }
}
