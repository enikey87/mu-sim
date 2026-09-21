// Группы ответов (EventResponseGroup): по умолчанию — «колода» без повторов до исчерпания;
// sequential — по порядку; random — чистый случай; noRepeat — после исчерпания группа молчит.
import { type Rng, shuffle, rndInt } from '../rng'
import type { GroupState } from './types'

export interface GroupOpts<T = unknown> {
  mode?: 'shuffle' | 'sequential' | 'random'
  noRepeat?: boolean
  /** Кто может выпасть сейчас. Остальные не выпадают, но и не теряют место в цикле — дождутся, когда станут уместны. */
  eligible?: (item: T) => boolean
}

export class Groups {
  constructor(
    protected state: Record<string, GroupState>,
    protected rng: Rng,
  ) {}

  next<T>(name: string, items: readonly T[], opts: GroupOpts<T> = {}): T | null {
    const ok = (i: number) => !opts.eligible || opts.eligible(items[i])
    const any = items.map((_, i) => i).filter(ok)
    if (!any.length) return null
    const mode = opts.mode ?? 'shuffle'
    if (mode === 'random') return items[any[rndInt(this.rng, any.length)]]
    let st = this.state[name]
    if (!st || st.n !== items.length) st = this.state[name] = { n: items.length, left: null, last: -1 }

    if (mode === 'sequential') {
      // неуместные сейчас пропускаются в этом проходе
      let i = st.seq ?? 0
      while (i < items.length && !ok(i)) i++
      if (i >= items.length) {
        if (opts.noRepeat) return null
        i = any[0]
      }
      st.seq = i + 1
      return items[i]
    }

    let at = st.left ? st.left.findLastIndex(ok) : -1
    if (at < 0) {
      if (opts.noRepeat && st.left) return null
      const idx = shuffle(this.rng, items.map((_, i) => i))
      // на стыке циклов не выдаём тот же элемент дважды подряд
      const end = idx.length - 1
      if (end > 0 && idx[end] === st.last) [idx[0], idx[end]] = [idx[end], idx[0]]
      st.left = idx
      at = idx.findLastIndex(ok)
    }
    const [i] = st.left!.splice(at, 1)
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
