// Колоды без повторов — частный случай групп ответов системы правил (режим shuffle).
// Состояние хранится в сохранении игры, поэтому «без повторов» работает между сессиями.
import { Groups, type GroupOpts } from './rules/groups'
import { type Entry, isOpen, valueOf } from './rules/gated'
import type { Resolver } from './rules/criteria'
import type { Facts, GroupState } from './rules/types'

export type Bag = GroupState
export type Bags = Record<string, GroupState>

export class Decks extends Groups {
  /** Следующий элемент колоды `key`. noRefill — после исчерпания вернуть null вместо перетасовки. */
  draw<T>(key: string, arr: readonly T[], noRefill = false): T {
    return this.next(key, arr, { noRepeat: noRefill }) as T
  }

  tryDraw<T>(key: string, arr: readonly T[], noRefill = false): T | null {
    return this.next(key, arr, { noRepeat: noRefill })
  }

  /** Следующий уместный элемент колоды; null — уместных нет (или колода исчерпана при noRepeat). */
  pick<T>(key: string, arr: readonly Entry<T>[], facts: Facts | Resolver, opts: GroupOpts<Entry<T>> = {}): T | null {
    const e = this.next(key, arr, { ...opts, eligible: (x) => isOpen(x, facts) && (opts.eligible?.(x) ?? true) })
    return e === null ? null : valueOf(e)
  }
}
