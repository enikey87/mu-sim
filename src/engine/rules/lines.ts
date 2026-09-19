// Выбор реплики из пула — как в Hades: у каждой строки свои требования, приоритет и отметка «уже сказано».
// 1) условия по фактам и памяти → 2) не сказанные и не на перерыве → 3) верхний приоритет → 4) случайно.
// Строка без полей — реплика без условий, приоритет 0, звучит один раз.
import { type Resolver, test } from './criteria'
import type { Criterion, Facts, FactOp } from './types'
import { type Rng, rndInt } from '../rng'

export interface LineSpec {
  t: string
  /** Постоянный id (иначе — ключ пула + хеш текста). */
  id?: string
  when?: Criterion[]
  /** Выше — важнее: пока есть подходящая реплика с большим приоритетом, меньшие молчат. */
  prio?: number
  /** Можно повторять (после перерыва); иначе — один раз за игру. */
  repeat?: boolean
  /** Перерыв для повторяемой реплики. */
  cooldown?: { turns?: number; days?: number }
  /** Что запомнить, когда реплика прозвучала. */
  remember?: FactOp[]
}
export type Line = string | LineSpec

export interface LineOpts {
  /** Все реплики пула повторяемые (по умолчанию — один раз каждая). */
  repeat?: boolean
  cooldown?: { turns?: number; days?: number }
  /** Дополнительный фильтр (например, «этот персонаж ещё не появился»). */
  filter?: (spec: LineSpec) => boolean
}

export interface Picked { id: string; text: string; spec: LineSpec }
export type SaidState = Record<string, { turn: number; day: number }>

/** Короткий стабильный хеш текста — id реплики в сохранении. */
export function lineId(key: string, t: string): string {
  let h = 5381
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0
  return `${key}#${(h >>> 0).toString(36)}`
}

export const spec = (l: Line): LineSpec => (typeof l === 'string' ? { t: l } : l)

export class Lines {
  constructor(
    private said: SaidState,
    private rng: Rng,
    private now: () => { turn: number; day: number },
  ) {}

  /** Подходящие реплики пула (условия, «сказано», перерыв, фильтр) — для выбора и для отчёта автора. */
  eligible(key: string, pool: readonly Line[], facts: Facts | Resolver, opts: LineOpts = {}): Picked[] {
    const now = this.now()
    const out: Picked[] = []
    for (const l of pool) {
      const s = spec(l)
      const id = s.id ?? lineId(key, s.t)
      if (s.when && !s.when.every((c) => test(c, facts))) continue
      if (opts.filter && !opts.filter(s)) continue
      const was = this.said[id]
      if (was) {
        if (!(s.repeat ?? opts.repeat)) continue
        const cd = s.cooldown ?? opts.cooldown
        if (cd && ((cd.turns !== undefined && now.turn - was.turn < cd.turns) || (cd.days !== undefined && now.day - was.day < cd.days))) continue
      }
      out.push({ id, text: s.t, spec: s })
    }
    return out
  }

  /** Лучшая реплика: верхний приоритет среди подходящих, внутри — случайно, свежие раньше повторов. */
  pick(key: string, pool: readonly Line[], facts: Facts | Resolver, opts: LineOpts = {}): Picked | null {
    const all = this.eligible(key, pool, facts, opts)
    if (!all.length) return null
    const top = Math.max(...all.map((p) => p.spec.prio ?? 0))
    const best = all.filter((p) => (p.spec.prio ?? 0) === top)
    const fresh = best.filter((p) => !this.said[p.id])
    const from = fresh.length ? fresh : best
    return from[rndInt(this.rng, from.length)]
  }

  /** Отметить «сказано». */
  mark(id: string): void {
    this.said[id] = this.now()
  }

  has(id: string): boolean {
    return id in this.said
  }
}

/** Линтер пулов: пустые реплики и повторяющиеся id внутри пула. */
export function lintLines(key: string, pool: readonly Line[]): string[] {
  const issues: string[] = []
  const ids = new Set<string>()
  for (const l of pool) {
    const s = spec(l)
    const id = s.id ?? lineId(key, s.t)
    if (!s.t.trim()) issues.push(`${key}: пустая реплика`)
    if (ids.has(id)) issues.push(`${key}: повтор ${id} «${s.t.slice(0, 30)}»`)
    ids.add(id)
  }
  return issues
}
