// Опечатки и автозамена Алика: «батон обиделся» → «*бетон»
import { AUTO, FIX_FMT } from '../content/life'
import { cap } from '../content/excuses'
import { type Rng, rndInt, shuffle } from './rng'
import type { Decks } from './deck'

export interface Typo {
  text: string
  fix: string
}

const wordRe = (w: string, capture = false) =>
  new RegExp(capture ? `(^|[^а-яё])(${w})(?=[^а-яё]|$)` : `(^|[^а-яё])${w}([^а-яё]|$)`, 'i')

export function typo(text: string, rng: Rng, decks: Decks): Typo | null {
  const auto = shuffle(rng, AUTO.slice()).find(([w]) => wordRe(w).test(text))
  if (auto && rng.random() < 0.7) {
    const [w, bad] = auto
    let orig = w
    let badCased = bad
    const out = text.replace(wordRe(w, true), (_m, pre: string, word: string) => {
      // сохраняем заглавную букву: «Брат» → «Борат» → «*Брат»
      const upper = word[0] !== word[0].toLowerCase()
      orig = upper ? cap(w) : w
      badCased = upper ? cap(bad) : bad
      return pre + badCased
    })
    return { text: out, fix: decks.draw('FIX', FIX_FMT).replace('{w}', orig).replace('{b}', badCased) }
  }
  const words = text.match(/[а-яё]{6,}/gi)
  if (!words) return null
  const w = words[rndInt(rng, words.length)]
  const i = 1 + rndInt(rng, w.length - 3)
  const bad = w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2)
  if (bad === w) return null
  return { text: text.replace(w, bad), fix: decks.draw('FIX', FIX_FMT).replace('{w}', w).replace('{b}', bad) }
}
