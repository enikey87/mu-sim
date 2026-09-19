// Колоды без повторов — частный случай групп ответов системы правил (режим shuffle).
// Состояние хранится в сохранении игры, поэтому «без повторов» работает между сессиями.
import { Groups } from './rules/groups'
import type { GroupState } from './rules/types'

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
}
