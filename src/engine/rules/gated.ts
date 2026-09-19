// Элемент пула с требованиями — как `when` у реплики в Hades, но для любой колоды: выпадает, только когда условия выполнены.
import { test, type Resolver } from './criteria'
import type { Criterion, Facts } from './types'

export class Gated<T> {
  constructor(readonly when: readonly Criterion[], readonly v: T) {}
}
export type Entry<T> = T | Gated<T>

/** gate(условия)(элемент); требования вложенного gate складываются. */
export const gate = (...when: Criterion[]) => <T>(v: Entry<T>): Gated<T> =>
  v instanceof Gated ? new Gated([...when, ...v.when], v.v) : new Gated(when, v)

export const isOpen = <T>(e: Entry<T>, facts: Facts | Resolver): boolean => !(e instanceof Gated) || e.when.every((c) => test(c, facts))

export const valueOf = <T>(e: Entry<T>): T => (e instanceof Gated ? e.v : e)
