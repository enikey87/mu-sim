// Узкая граница контента над generic-движком правил: лист условия/записи несёт только FactKey.
// Именованное условие (`op: all`) хранит произвольную метку, но его листья снова узкие.
import type {
  Criterion as EngineCriterion,
  FactOp as EngineFactOp,
  Gated,
  LineSpec as EngineLineSpec,
  Op,
  Rule as EngineRule,
} from '../engine/rules'
import type { FactKey } from './factkeys'
import type { ClaimKey } from './ids'

type CriterionFields = Omit<EngineCriterion, 'key' | 'op' | 'all'>
type LeafOp = Exclude<Op, 'all'>

export type Criterion =
  | (CriterionFields & { key: FactKey; op: LeafOp; all?: never })
  | (CriterionFields & { key: string; op: 'all'; all?: Criterion[] })

export type FactOp = Omit<EngineFactOp, 'key'> & { key: FactKey }

export type Rule<G, E extends string = string, O = unknown> =
  Omit<EngineRule<G, E, O>, 'when' | 'remember'> & {
    when: Criterion[]
    remember?: FactOp[]
  }

export type LineSpec = Omit<EngineLineSpec, 'when' | 'remember'> & {
  when?: Criterion[]
  remember?: FactOp[]
  /** Явная семантика реплики: журнал знаний публикует эти утверждения, показанный текст не разбирается. */
  claims?: ClaimKey[]
}

export type Entry<T> = T | Gated<T>
export type Line = string | LineSpec | Gated<string | LineSpec>

/** Реплика с явной семантикой: claims публикует журнал, строка остаётся для ленты. */
export interface Claimed { t: string; claims: ClaimKey[] }
export type Said = string | Claimed
export const saidText = (x: Said): string => (typeof x === 'string' ? x : x.t)
export const saidClaims = (x: Said): ClaimKey[] => (typeof x === 'string' ? [] : x.claims)
/** Склеить части реплики в одну: тексты подряд, семантика всех частей — вместе. */
export const saidJoin = (...parts: Said[]): Said => {
  const claims = parts.flatMap(saidClaims)
  const t = parts.map(saidText).join('')
  return claims.length ? { t, claims } : t
}
/** Преобразовать текст реплки, сохранив семантику: cap/low и прочие украшения. */
export const saidMap = (x: Said, f: (s: string) => string): Said => (typeof x === 'string' ? f(x) : { ...x, t: f(x.t) })
