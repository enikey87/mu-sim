// Типизированные конструкторы условий: ключ — FactKey из реестра (#258).
// Движок rules изолирован и принимает string; контент ходит только сюда (через ./fact).
import {
  eq as eqRaw, ne as neRaw, gt as gtRaw, gte as gteRaw, lt as ltRaw, lte as lteRaw,
  exists as existsRaw, missing as missingRaw, matches as matchesRaw, is as isRaw,
  set as setRaw, add as addRaw, mul as mulRaw, invert as invertRaw, during as duringRaw,
  between as betweenRaw, named as namedRaw, of as ofRaw,
  type Criterion, type Scope, type Value, type FactOp, type WriteScope,
} from '../engine/rules'
import type { AchId } from './ids'
import type { FactKey, SinceKey } from './factkeys'

export const eq = (key: FactKey, value: Value, scope?: Scope): Criterion => eqRaw(key, value, scope)
export const ne = (key: FactKey, value: Value, scope?: Scope): Criterion => neRaw(key, value, scope)
export const gt = (key: Exclude<FactKey, SinceKey>, value: number, scope?: Scope): Criterion => gtRaw(key, value, scope)
export const gte = (key: FactKey, value: number, scope?: Scope): Criterion => gteRaw(key, value, scope)
export const lt = (key: Exclude<FactKey, SinceKey>, value: number, scope?: Scope): Criterion => ltRaw(key, value, scope)
/** Верхняя граница since.* — только через sinceWithin (иначе «не было» читается как 0). */
export const lte = (key: Exclude<FactKey, SinceKey>, value: number, scope?: Scope): Criterion => lteRaw(key, value, scope)
export const between = (key: Exclude<FactKey, SinceKey>, min: number, max: number, scope?: Scope): Criterion[] =>
  betweenRaw(key, min, max, scope)
export const exists = (key: FactKey, scope?: Scope): Criterion => existsRaw(key, scope)
export const missing = (key: FactKey, scope?: Scope): Criterion => missingRaw(key, scope)
export const matches = (key: FactKey, re: RegExp, scope?: Scope): Criterion => matchesRaw(key, re, scope)
export const is = (key: FactKey, scope?: Scope): Criterion => isRaw(key, scope)

export const set = (key: FactKey, value: number | string | boolean, extra: Partial<FactOp> = {}): FactOp =>
  setRaw(key, value, extra)
export const add = (key: FactKey, value = 1, extra: Partial<FactOp> = {}): FactOp => addRaw(key, value, extra)
export const mul = (key: FactKey, value: number, extra: Partial<FactOp> = {}): FactOp => mulRaw(key, value, extra)
export const invert = (key: FactKey, extra: Partial<FactOp> = {}): FactOp => invertRaw(key, extra)
export const during = (key: FactKey, days: number, value: number | string | boolean = true, scope?: WriteScope): FactOp =>
  duringRaw(key, days, value, scope)

export const named = namedRaw
export const of = ofRaw

/**
 * «Не позже n дней после ачивки»: нижняя граница (событие было) + верхняя.
 * Обход списком невозможен — lte(since.*) снаружи не принимает SinceKey.
 */
export const sinceWithin = (ach: AchId, days: number): Criterion[] => [
  gte(`since.${ach}`, 1),
  lteRaw(`since.${ach}`, days),
]

/** «Событие было не сегодня» — past для MEMORY. */
export const sincePast = (ach: AchId): Criterion => gte(`since.${ach}`, 1)
