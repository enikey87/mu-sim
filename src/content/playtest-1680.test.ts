// Слепой рецензент плейтест-раунда 222 (#1680): «Март, брат» читалось как обращение по имени, которого
// в игре нет, — игрок безымянный. Долг в арке Гранта с марта (серия 1: «Ни одного идеального дня с
// марта, брат»), поэтому строка называет месяц предлогом «с» и остаётся тем же ответом на «оплачено»:
// долг выдержанный, как коньяк. Сторож держит новую форму дословно на её месте в серии, игра её
// произносит, а старой формы нет ни в одном файле `src/` (вернули обращение по имени → красный).
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { alikTexts, makeGame } from '../test/helpers'
import { ARCS, type ArcMsg } from './arcs'
import { valueOf } from './fact'

/** Серия «Грант оплатил» — ответ Алика на «оплачено»; статичная строка стоит третьей после двух гейтов. */
const SERIES = 3
const LINE = 'С марта, брат. Это древний долг. Долг выдержанный, как коньяк. Такой не пьют — таким гордятся.'
const OLD = 'Март, брат'
const SELF = relative('.', fileURLToPath(import.meta.url))

const lineAt = (i: number): string => {
  const msg: ArcMsg = valueOf(ARCS.grant.eps[SERIES].m[i])
  return typeof msg === 'string' ? msg : msg.t
}

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))

describe('обращение без имени игрока в арке Гранта (#1680)', () => {
  it(`строка на своём месте в серии ${SERIES}: месяц с предлогом, а не обращение`, () => {
    expect(lineAt(2), 'порядок серии сдвинулся').toBe(LINE)
    expect(lineAt(2).toLowerCase()).not.toMatch(/^март\b/)
  })

  it('старой формы нет ни в одном файле src/', () => {
    // сам сторож не считается: иначе он ловил бы собственный образец
    const files = walk('src').filter((f) => f !== SELF)
    const hits = files.filter((f) => readFileSync(f, 'utf8').includes(OLD))
    expect(hits, `обращение по имени вернулось: ${hits.join(', ')}`).toEqual([])
  })

  it('игра произносит новую строку в серии оплаты', async () => {
    const { game } = makeGame()
    const from = game.S.msgs.length
    await game.playEpisode(ARCS.grant.eps[SERIES], 'grant')
    const lines = alikTexts(game.S.msgs.slice(from))
    expect(lines, `серия не произнесла строку: ${lines.join(' | ')}`).toContain(LINE)
    expect(lines.some((t) => t.includes(OLD)), 'старая форма прозвучала в партии').toBe(false)
  })
})
