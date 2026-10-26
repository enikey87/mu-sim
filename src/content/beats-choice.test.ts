// Уникальный вариант в ход бита (#920): предложение Рубика и коза — окно реплики,
// доля дома — пока легенда фундамента жива.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Choice } from '../engine/state'

const find = (chs: Choice[]) => (text: string): Choice | undefined => chs.find((c) => c.text === text)
const untilOffered = (game: ReturnType<typeof makeGame>['game'], text: string): Choice | undefined => {
  for (let k = 0; k < 20; k++) {
    const c = find(game.buildChoices())(text)
    if (c) return c
  }
  return undefined
}

const PROPOSAL = 'Брат, ты же не хочешь, чтобы из-за твоих денег распалась семья? Скажи, что подождёшь.'
const DECIDE = 'Карине, решай сама. Акт — сразу.'
const GOAT = 'Коза тёти Гоар до сих пор тебя вспоминает. Говорит, только ты её понимаешь.'
const GOAT_Q = 'Передайте козе: следующий раз — без меня.'
const SHARE = 'Раз мои деньги заложены в фундамент, дом отчасти мой. Я попросил бы комнату. Угловую.'

describe('уникальные варианты битов (#920)', () => {
  it('предложение Рубика: кнопка в окне реплики, без неё — нет', async () => {
    const { game } = makeGame({ seed: 13 })
    game.S.mem['intro.karine'] = true
    game.S.arcs.rubik = { i: 7, last: game.S.day }
    game.setCtx({ arc: 'rubik' })
    for (let k = 0; k < 5; k++) expect(find(game.buildChoices())(DECIDE)).toBeUndefined()
    await game.say([PROPOSAL])
    game.setCtx({ arc: 'rubik' })
    const c = untilOffered(game, DECIDE)
    expect(c, 'в окне предложения есть свой вариант').toBeDefined()
    await game.send(c!)
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.from === 'alik' && m.text === 'Решай. Я женой не торгую. Я просто акт жду.')).toBe(true)
    expect(game.S.arcs.rubik!.i, 'вариант не двигает серию').toBe(7)
  })

  it('коза: кнопка после реплики, на другом воспоминании — нет', async () => {
    const { game } = makeGame({ seed: 13 })
    game.S.mem['intro.goar'] = true
    await game.say(['Брат, помнишь хаш? Ты тогда полторы тысячи съел.'])
    game.setCtx({ memory: true })
    for (let k = 0; k < 5; k++) expect(find(game.buildChoices())(GOAT_Q)).toBeUndefined()
    await game.say([GOAT])
    game.setCtx({ memory: true })
    expect(untilOffered(game, GOAT_Q), 'после козы есть шутка').toBeDefined()
  })

  it('доля дома предлагается, пока легенда фундамента жива, и нет на другой', () => {
    const { game } = makeGame({ seed: 3 })
    const seen = () => {
      const texts = new Set<string>()
      for (let i = 0; i < 40; i++) {
        game.S.choices = null
        for (const c of game.buildChoices()) texts.add(c.text)
      }
      return texts
    }
    game.setLegend('beton_money', 'beton')
    expect(seen().has(SHARE), 'живая линия бетона').toBe(true)
    game.setLegend('crypto', 'crypto')
    expect(seen().has(SHARE), 'не фундамент').toBe(false)
  })
})
