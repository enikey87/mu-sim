// Баррель контента: типы/инфра из engine/rules + типизированные конструкторы фактов (#258).
export {
  gate, Gated, test, describeCriterion, watchFactKeys, valueOf, mapEntry, isOpen,
  Lines, lineId, lintLines, spec,
  type Criterion, type Entry, type Line, type LineSpec, type Facts, type FactOp,
  type Rule, type Scope, type Value, type Resolver, type WriteScope, type SaidState,
} from '../engine/rules'
export {
  eq, ne, gt, gte, lt, lte, between, exists, missing, matches, is,
  set, add, mul, invert, during, named, of, sinceWithin, sincePast,
} from './typed-criteria'
export type { FactKey, SinceKey } from './factkeys'
