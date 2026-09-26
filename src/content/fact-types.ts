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
}

export type Entry<T> = T | Gated<T>
export type Line = string | LineSpec | Gated<string | LineSpec>
