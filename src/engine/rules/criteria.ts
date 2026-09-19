// Условия правил: конструкторы, проверка, описание, именованные условия.
import type { Criterion, Facts, Scope, Value, FactOp, WriteScope } from './types'

export const eq = (key: string, value: Value, scope?: Scope): Criterion => ({ key, op: '==', value, scope })
export const ne = (key: string, value: Value, scope?: Scope): Criterion => ({ key, op: '!=', value, scope })
export const gt = (key: string, value: number, scope?: Scope): Criterion => ({ key, op: '>', value, scope })
export const gte = (key: string, value: number, scope?: Scope): Criterion => ({ key, op: '>=', value, scope })
export const lt = (key: string, value: number, scope?: Scope): Criterion => ({ key, op: '<', value, scope })
export const lte = (key: string, value: number, scope?: Scope): Criterion => ({ key, op: '<=', value, scope })
export const between = (key: string, min: number, max: number, scope?: Scope): Criterion[] => [gte(key, min, scope), lte(key, max, scope)]
export const exists = (key: string, scope?: Scope): Criterion => ({ key, op: 'exist', scope })
export const missing = (key: string, scope?: Scope): Criterion => ({ key, op: '!exist', scope })
export const matches = (key: string, re: RegExp, scope?: Scope): Criterion => ({ key, op: 'match', value: re, scope })
export const is = (key: string, scope?: Scope): Criterion => eq(key, true, scope)

/**
 * Именованное условие (criterion() в kawaii-doom): несколько проверок под одним именем.
 * Считается за одно условие при подсчёте специфичности — как в оригинале.
 */
export const named = (name: string, ...all: Criterion[]): Criterion => ({ key: name, op: 'all', all })

export const set = (key: string, value: number | string | boolean, extra: Partial<FactOp> = {}): FactOp => ({ key, op: '=', value, ...extra })
export const add = (key: string, value = 1, extra: Partial<FactOp> = {}): FactOp => ({ key, op: '+', value, ...extra })
export const mul = (key: string, value: number, extra: Partial<FactOp> = {}): FactOp => ({ key, op: '*', value, ...extra })
export const invert = (key: string, extra: Partial<FactOp> = {}): FactOp => ({ key, op: '!', ...extra })
/** Временное состояние: факт = value на N дней, потом прежнее значение. */
export const during = (key: string, days: number, value: number | string | boolean = true, scope?: WriteScope): FactOp =>
  ({ key, op: '=', value, forDays: days, scope })

export type Resolver = (key: string, scope?: Scope, actor?: string) => Value

/** Условие по доске персонажа: of('boris', is('sick')). */
export const of = (actor: string, c: Criterion): Criterion => ({ ...c, actor })

/** Проверить условие. facts — плоский объект фактов или функция поиска по доскам. */
export function test(c: Criterion, facts: Facts | Resolver): boolean {
  if (c.op === 'all') return (c.all ?? []).every((x) => test(x, facts))
  const v = typeof facts === 'function' ? facts(c.key, c.scope, c.actor) : facts[c.key]
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
    default: return n >= x // '>='
  }
}

const scoped = (c: Criterion) => (c.actor ? `${c.actor}.` : c.scope ? `${c.scope}.` : '')

export function describeCriterion(c: Criterion): string {
  switch (c.op) {
    case 'all': return c.key
    case 'exist': return scoped(c) + c.key
    case '!exist': return `!${scoped(c)}${c.key}`
    default: return `${scoped(c)}${c.key} ${c.op} ${c.value instanceof RegExp ? c.value.source : JSON.stringify(c.value)}`
  }
}
