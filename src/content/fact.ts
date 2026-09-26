// Баррель контента: runtime-инфра из engine/rules + узкие типы/конструкторы FactKey (#258/#264).
import { gate as gateRaw, spec as specRaw, type Line as EngineLine } from '../engine/rules'
import type { Criterion, Entry, Line, LineSpec } from './fact-types'

export {
  Gated, test, describeCriterion, watchFactKeys, valueOf, mapEntry, isOpen,
  Lines, lineId, lintLines,
  type Facts, type Scope, type Value, type Resolver, type WriteScope, type SaidState,
} from '../engine/rules'
export type { Criterion, Entry, Line, LineSpec, FactOp, Rule } from './fact-types'
export {
  eq, ne, gt, gte, lt, lte, between, exists, missing, matches, is,
  set, add, mul, invert, during, named, of, sinceWithin, sincePast,
} from './typed-criteria'
export type { FactKey, SinceKey } from './factkeys'

/** gate контента не принимает сырой string-ключ; вложенные gate сохраняют те же требования. */
export const gate = (...when: Criterion[]) => <T>(value: Entry<T>) => gateRaw(...when)(value)
export const spec = (line: Line): LineSpec => specRaw(line as EngineLine) as LineSpec
