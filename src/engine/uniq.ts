// Реплики без повторов: хеши всех показанных текстов хранятся в сохранении.
export type Keyed = string | { texts?: string[]; text?: string; t?: string }

export const hash = (s: string): number => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h
}

export const keyOf = (t: Keyed): string =>
  typeof t === 'string' ? t : t.texts ? t.texts.join('|') : (t.text ?? t.t ?? JSON.stringify(t))

export class Seen {
  private set: Set<number>

  constructor(private list: number[]) {
    this.set = new Set(list)
  }

  has(t: Keyed): boolean {
    return this.set.has(hash(keyOf(t)))
  }

  mark(t: Keyed): void {
    const h = hash(keyOf(t))
    if (!this.set.has(h)) {
      this.set.add(h)
      this.list.push(h)
    }
  }

  /** Сгенерировать ещё не виденное; если варианты кончились — перефразировать через decorate. */
  pickFresh<T extends Keyed>(gen: () => T, decorate: (t: T) => T): T {
    let t = gen()
    for (let i = 0; i < 40; i++) {
      if (!this.has(t)) return t
      t = gen()
    }
    for (let i = 0; i < 40; i++) {
      const d = decorate(t)
      if (!this.has(d)) return d
    }
    return t
  }
}
