// Рубик спит в ванной только после своей серии (#590): серия пишет факт, легенда и его реплика молчат до неё.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { LEGENDS } from './legends'
import { CHORUS } from './world'
import { rubikBath } from './memkeys'
import { ARCS } from './arcs'
import type { FactOp, LineSpec } from './fact'
import { set } from './fact'

const text = (x: string | LineSpec): string => (typeof x === 'string' ? x : x.t)

/** Всё, что звучит про ванную: строки легенды `inspect` (включая talk) и хор Рубика. */
const bathLines = (g: ReturnType<typeof makeGame>['game']): string[] => [
  ...g.open(LEGENDS.inspect.lines).map(text),
  ...g.open(LEGENDS.inspect.talk ?? []).flatMap(([q, a]) => [q, typeof a === 'string' ? a : a.t]),
  ...g.open(CHORUS.rubik).map(text),
].filter((t) => /ванн/i.test(t))

describe('Рубик и ванная', () => {
  it('серия, которая селит Рубика в ванную, пишет факт', () => {
    const ep = ARCS.rubik.eps.find((e) => e.m.some((m) => typeof m === 'string' && /Спит в ванной/.test(m)))!
    expect(ep, 'серия про ванную найдена').toBeDefined()
    const ops = (ep.remember ?? []) as FactOp[]
    expect(ops.some((o) => o.key === rubikBath && o.op === '=' && o.value === true), 'серия ставит факт ванной').toBe(true)
  })

  it('до серии про ванную не говорит ни легенда, ни сам Рубик', () => {
    const { game } = makeGame()
    game.setLegend('inspect', 'rubik')
    expect(bathLines(game)).toEqual([])
    // серия на подходе, но ещё не сыграна: прогресс сериала без факта ванной
    game.S.arcs.rubik = { i: 4, last: 0 }
    expect(bathLines(game)).toEqual([])
  })

  it('после серии фразы про ванную допустимы (путь игрока: сериал доведён до серии)', async () => {
    const { game } = makeGame()
    game.setLegend('inspect', 'rubik')
    for (let i = 0; i < 5; i++) await game.playArc('rubik')
    expect(game.S.mem[rubikBath], 'факт ванной поставлен серией').toBe(true)
    expect(bathLines(game).length, 'после серии фразы про ванную в пуле').toBeGreaterThan(0)
  })

  it('гейт строки легенды держит именно факт ванной', () => {
    const { game } = makeGame()
    game.setLegend('inspect', 'rubik')
    const line = 'Без акта Грант не платит, без Гранта — я. А акт у Рубика. А Рубик у меня в ванной.'
    expect(game.open(LEGENDS.inspect.lines).includes(line as never), 'без факта ванной строки нет').toBe(false)
    // открываем остальные её условия — серия Гранта идёт, акта нет — и факт ванной: строка в пуле
    game.S.mem['intro.grant'] = true
    expect(game.open(LEGENDS.inspect.lines).includes(line as never), 'без факта ванной строки всё ещё нет').toBe(false)
    game.rules.applyOps([set(rubikBath, true)], {})
    expect(game.open(LEGENDS.inspect.lines).includes(line as never), 'с фактом ванной строка в пуле').toBe(true)
  })
})
