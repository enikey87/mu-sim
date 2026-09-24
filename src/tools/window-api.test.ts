// scripts/playtest-tech.mjs играет через window.__alik и в CI не запускается: переименование в Game
// ломает его молча (#66 — die()/ui.dead; #50 — feel/feelId). Здесь каждый путь, который он трогает, сверяется с живым Game.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { makeGame } from '../test/helpers'

const SCRIPT = readFileSync('scripts/playtest-tech.mjs', 'utf8')

/** Пути от window.__alik: и прямые (window.__alik.x.y), и через псевдоним `const g = window.__alik` (g.x.y). */
const paths = (): string[] => {
  const out = new Set<string>()
  for (const m of SCRIPT.matchAll(/window\.__alik((?:\.[A-Za-z_]\w*)+)/g)) out.add(m[1].slice(1))
  for (const m of SCRIPT.matchAll(/\bg((?:\.[A-Za-z_]\w*)+)/g)) out.add(m[1].slice(1))
  return [...out]
}

describe('API window.__alik для scripts/playtest-tech.mjs', () => {
  it('скрипт вообще трогает Game — иначе проверять нечего', () => {
    expect(paths().length).toBeGreaterThan(5)
  })

  it('каждый путь, который трогает скрипт, есть у Game', () => {
    const { game } = makeGame()
    const missing = paths().filter((p) => {
      let o: unknown = game
      for (const seg of p.split('.')) {
        if (o === null || typeof o !== 'object' || !(seg in o)) return true
        o = (o as Record<string, unknown>)[seg]
      }
      return false
    })
    expect(missing).toEqual([])
  })
})
