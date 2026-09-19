import { type Rng, shuffle } from './rng'

// Колода: элемент не выпадает повторно, пока не вышли все остальные.
// Состояние колод хранится в сохранении игры, поэтому «без повторов» работает между сессиями.
export interface Bag {
  n: number
  left: number[] | null
  last: number
}
export type Bags = Record<string, Bag>

export class Decks {
  constructor(
    private bags: Bags,
    private rng: Rng,
  ) {}

  /** Следующий элемент колоды `key`. noRefill — после исчерпания вернуть null вместо перетасовки. */
  draw<T>(key: string, arr: readonly T[], noRefill = false): T {
    return this.tryDraw(key, arr, noRefill) as T
  }

  tryDraw<T>(key: string, arr: readonly T[], noRefill = false): T | null {
    if (!arr.length) return null
    let b = this.bags[key]
    if (!b || b.n !== arr.length) b = this.bags[key] = { n: arr.length, left: null, last: -1 }
    if (!b.left || !b.left.length) {
      if (noRefill && b.left) return null
      const idx = shuffle(this.rng, arr.map((_, i) => i))
      // на стыке циклов не выдаём тот же элемент дважды подряд
      const end = idx.length - 1
      if (end > 0 && idx[end] === b.last) [idx[0], idx[end]] = [idx[end], idx[0]]
      b.left = idx
    }
    const i = b.left.pop()!
    b.last = i
    return arr[i]
  }
}
