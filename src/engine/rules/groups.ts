// Группы ответов (EventResponseGroup): по умолчанию — «колода» без повторов до исчерпания;
// sequential — по порядку; random — чистый случай; noRepeat — после исчерпания группа молчит.
import { type Rng, shuffle, rndInt } from '../rng'
import type { GroupState } from './types'

export interface GroupOpts {
  mode?: 'shuffle' | 'sequential' | 'random'
  noRepeat?: boolean
}

export class Groups {
  constructor(
    protected state: Record<string, GroupState>,
    protected rng: Rng,
  ) {}

  next<T>(name: string, items: readonly T[], opts: GroupOpts = {}): T | null {
    if (!items.length) return null
    const mode = opts.mode ?? 'shuffle'
    if (mode === 'random') return items[rndInt(this.rng, items.length)]
    let st = this.state[name]
    if (!st || st.n !== items.length) st = this.state[name] = { n: items.length, left: null, last: -1 }

    if (mode === 'sequential') {
      const i = st.seq ?? 0
      if (i >= items.length) {
        if (opts.noRepeat) return null
        st.seq = 1
        return items[0]
      }
      st.seq = i + 1
      return items[i]
    }

    if (!st.left || !st.left.length) {
      if (opts.noRepeat && st.left) return null
      const idx = shuffle(this.rng, items.map((_, i) => i))
      // на стыке циклов не выдаём тот же элемент дважды подряд
      const end = idx.length - 1
      if (end > 0 && idx[end] === st.last) [idx[0], idx[end]] = [idx[end], idx[0]]
      st.left = idx
    }
    const i = st.left.pop()!
    st.last = i
    return items[i]
  }

  /** Сколько ещё осталось до повторения (для shuffle) или до конца (sequential). */
  remaining(name: string, total: number, mode: GroupOpts['mode'] = 'shuffle'): number {
    const st = this.state[name]
    if (!st || st.n !== total) return total
    if (mode === 'sequential') return total - (st.seq ?? 0)
    return st.left ? st.left.length : total
  }
}
