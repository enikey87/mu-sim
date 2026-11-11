// Первый возврат из пропажи — санаторий «Солнышко» и карточка пансионата (#1701): акция одна за партию,
// реплика и карточка неразделимы, следующие возвраты идут прежним пулом BACK_A/BACK_B.
// В смерти, блоке и эндгейме акции нет: там Алик молчит или говорит своей линией.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { alikDead, blocked, endgame, phoneKarine, sanatoriumAt } from './memkeys'
import { D, SANATORIUM_CARD, SANATORIUM_LINK } from './excuses'
import { valueOf, type Entry } from './fact'

const cards = (g: Game) => g.S.msgs.filter((m) => m.kind === 'sanatorium')
/** Реплики Алика за ход: системные строки и карточки в счёт не идут. */
const said = (g: Game, from: number) => g.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
const aboutSanatorium = (t: string) => t.includes('Солнышк')
const fromBackPool = (t: string) => (D.BACK_A as Entry<string>[]).map(valueOf).some((a) => t.includes(a))
/** Обида путём игрока: первый крик уводит Алика в пропажу (rude.ts, S0). */
const offend = (g: Game) => g.send({ text: 'Алик, ты вор!', tone: 'rude' })
/** Нейтральное сообщение возвращает Алика; ход отсчитывается с этой отметки. */
const back = async (g: Game) => { const from = g.S.msgs.length; await g.send({ text: 'Алик, ну ты где?', tone: 'neutral' }); return from }

describe('первый возврат из пропажи: санаторий «Солнышко» (#1701)', () => {
  it('обида → возврат: реплика про «Солнышко» и карточка пансионата одним ходом', async () => {
    const { game } = makeGame()
    await offend(game)
    expect(game.S.offlineDays, 'обида не увела в пропажу — проверка пустеет').toBeGreaterThan(0)
    const from = await back(game)
    expect(said(game, from).some(aboutSanatorium), 'возврат не назвал «Солнышко»').toBe(true)
    expect(said(game, from).some((t) => t.includes('240')), 'реплика не назвала настоящий долг').toBe(true)
    const shown = cards(game)
    expect(shown, 'карточки пансионата нет или она не одна').toHaveLength(1)
    expect(shown[0].kind === 'sanatorium' && shown[0].text, 'текст карточки не тот').toBe(SANATORIUM_CARD)
    expect(shown[0].kind === 'sanatorium' && shown[0].link, 'ссылка карточки не та').toBe(SANATORIUM_LINK)
    expect(Number(game.S.mem[sanatoriumAt]), 'разовость не записана ходом события').toBe(game.S.stats.sent)
    expect(game.S.offlineDays).toBe(0)
  })

  it('второй возврат — обычный пул BACK без «Солнышка» и без второй карточки', async () => {
    const { game } = makeGame()
    await offend(game)
    await back(game)
    game.goOffline(2)
    const from = await back(game)
    expect(cards(game), 'акция повторилась').toHaveLength(1)
    const lines = said(game, from)
    expect(lines.some(aboutSanatorium), 'второй возврат снова назвал «Солнышко»').toBe(false)
    expect(lines.some(fromBackPool), 'обычный возврат не прозвучал').toBe(true)
  })

  it('возврат из арки смерти — без акции: «умер и вернулся» говорит своя линия', async () => {
    const { game } = makeGame()
    game.S.mem[alikDead] = true
    game.goOffline(20)
    const from = await back(game)
    expect(cards(game)).toHaveLength(0)
    expect(said(game, from).some(aboutSanatorium), 'акция прозвучала в смерти').toBe(false)
    expect(game.S.mem[sanatoriumAt], 'выключенная акция всё равно записала факт').toBeUndefined()
  })

  it('возврат в блоке, у Карине и в эндгейме — без акции', async () => {
    for (const state of [{ [blocked]: true }, { [phoneKarine]: true }, { [endgame.active]: true }]) {
      const { game } = makeGame()
      Object.assign(game.S.mem, state)
      game.goOffline(1)
      const from = await back(game)
      expect(cards(game), `карточка в состоянии ${Object.keys(state)[0]}`).toHaveLength(0)
      expect(said(game, from).some(aboutSanatorium), `акция в состоянии ${Object.keys(state)[0]}`).toBe(false)
    }
  })
})
