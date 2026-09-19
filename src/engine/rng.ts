// Источник случайности. В игре — Math.random, в тестах — детерминированный seeded.
export interface Rng {
  random(): number
}

export const mathRng: Rng = { random: () => Math.random() }

// mulberry32 — маленький быстрый seeded-генератор для воспроизводимых тестов
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return {
    random() {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

export const rndInt = (rng: Rng, n: number): number => Math.floor(rng.random() * n)

export function shuffle<T>(rng: Rng, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rndInt(rng, i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const chance = (rng: Rng, p: number): boolean => rng.random() < p
