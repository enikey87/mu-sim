// «Хватит клясться» ждёт, пока Алик поклянётся формой из D.OATH, а не любого обещания (#1183).
import { describe, expect, it } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import { spec, valueOf, type Entry, type LineSpec } from './fact'
import { D } from './excuses'
import { saidOath } from './memkeys'
import { OATH_FORMS } from './misc'
import type { Game } from '../engine/game'

const LINE = 'Хватит клясться!!! У тебя клятв больше, чем денег!!!'
const NEIGHBORS = ['Где мои деньги?!', 'ВЕРНИ ДЕНЬГИ!!!', 'Я запишу голосовое. Громкое!!!']
const OATHS = (D.OATH as readonly Entry<string>[]).map(valueOf).filter((s): s is string => typeof s === 'string')
const usedOath = (t: string) => OATHS.some((o) => t.includes(o))
const open = (game: Game) => game.open(D.P_RUDE_B)
const formOf = (mark: string): LineSpec => {
  const s = OATH_FORMS.map(spec).find((x) => x.t.includes(mark))
  if (!s) throw new Error(`нет формы «${mark}»`)
  return s
}

function forceForm(game: Game, s: LineSpec): void {
  const pick = game.linePicked.bind(game)
  game.linePicked = (key, pool, o) => {
    if (key !== 'OATH_FORMS') return pick(key, pool, o)
    return { text: s.t, spec: s, id: s.id ?? 'forced-oath-form' }
  }
}

describe('вариант «Хватит клясться» — после первой клятвы Алика (#1183)', () => {
  it('до клятвы строки нет, соседние строки пула есть', () => {
    expect(OATHS.length).toBeGreaterThan(10)
    const { game } = makeGame()
    game.S.stats.sent = 6
    expect(game.S.mem[saidOath]).toBeUndefined()
    expect(open(game), 'вариант клятв до первой клятвы').not.toContain(LINE)
    expect(open(game)).toEqual(expect.arrayContaining(NEIGHBORS))
  })

  it('снятый гейт возвращает вариант до клятвы', () => {
    const { game } = makeGame()
    game.S.stats.sent = 6
    const bare = (D.P_RUDE_B as Entry<string>[]).map((e) => (valueOf(e) === LINE ? LINE : e))
    expect(game.open(bare)).toContain(LINE)
  })

  it('форма {o} ставит факт; до шести сообщений строка ещё закрыта', async () => {
    const { game } = makeGame()
    forceForm(game, formOf('{o}'))
    const from = game.S.msgs.length
    await game.promiseLine()
    const said = alikTexts(game.S.msgs.slice(from)).join('\n')
    expect(usedOath(said), said).toBe(true)
    expect(game.S.mem[saidOath]).toBe(true)
    expect(open(game)).not.toContain(LINE)
    game.S.stats.sent = 6
    expect(open(game)).toContain(LINE)
    expect(open(game)).toEqual(expect.arrayContaining(NEIGHBORS))
  })

  it('«Слово Алика» и срок легенды без формы клятвы факта не ставят', async () => {
    const word = makeGame()
    word.game.S.stats.sent = 6
    forceForm(word.game, formOf('Слово Алика'))
    await word.game.promiseLine()
    const said = alikTexts(word.game.S.msgs).at(-1)!
    expect(said).toContain('Слово Алика')
    expect(usedOath(said), said).toBe(false)
    expect(word.game.S.mem[saidOath]).toBeUndefined()
    expect(open(word.game), 'вариант клятв до первой клятвы').not.toContain(LINE)
    expect(open(word.game)).toEqual(expect.arrayContaining(NEIGHBORS))

    const legend = makeGame()
    legend.game.S.stats.sent = 6
    legend.game.setLegend('safe_baby', 'nune')
    forceForm(legend.game, formOf('Слово Алика'))
    await legend.game.promiseLine(undefined, true)
    const vowed = alikTexts(legend.game.S.msgs).at(-1)!
    expect(vowed).toContain('Слово Алика')
    expect(vowed).toContain('как ключ выйдет')
    expect(legend.game.S.mem[saidOath]).toBeUndefined()
    expect(open(legend.game), 'вариант клятв до первой клятвы').not.toContain(LINE)
  })

  it('префикс обещания форму клятвы не произносит', async () => {
    const { game } = makeGame()
    game.S.stats.sent = 6
    await game.promiseLine('Ладно')
    expect(alikTexts(game.S.msgs).at(-1)).toMatch(/^Ладно/)
    expect(game.S.mem[saidOath]).toBeUndefined()
    expect(open(game), 'вариант клятв до первой клятвы').not.toContain(LINE)
  })

  it('живая promiseLine ставит факт ровно когда прозвучала клятва', async () => {
    let oath = false
    let plain = false
    for (let seed = 1; seed <= 40 && (!oath || !plain); seed++) {
      const { game } = makeGame({ seed })
      game.S.stats.sent = 6
      await game.promiseLine()
      const said = alikTexts(game.S.msgs).at(-1)!
      if (usedOath(said)) {
        expect(game.S.mem[saidOath], said).toBe(true)
        expect(open(game), said).toContain(LINE)
        oath = true
      } else {
        expect(game.S.mem[saidOath], said).toBeUndefined()
        expect(open(game), said).not.toContain(LINE)
        plain = true
      }
      expect(open(game), said).toEqual(expect.arrayContaining(NEIGHBORS))
    }
    expect(oath, 'форма клятвы не попалась').toBe(true)
    expect(plain, 'форма без клятвы не попалась').toBe(true)
  })
})
