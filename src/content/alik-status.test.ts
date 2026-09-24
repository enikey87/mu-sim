// Подпись профиля Алика (docs/design/alik-status.md): состояние мира одной системной строкой в конце хода.
import { describe, expect, it } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { valueOf, type LineSpec } from '../engine/rules'
import { ALIK_STATUS } from './misc'

const statuses = (g: Game) => g.S.msgs.flatMap((m) => (m.kind === 'sys' && m.text.startsWith('Алик Воздухонесян изменил статус') ? [m.text] : []))
const turn = async (g: Game) => { g.S.offlineDays = 0; await g.send({ text: 'Алик, как дела?', tone: 'polite' }) }
/** Серия за серией, пока настоящая серия не поставит состояние (или сериал не кончится). */
async function playUntil(g: Game, arc: string, holds: (g: Game) => boolean): Promise<void> {
  for (let i = 0; i < 20 && !holds(g); i++) {
    const before = statuses(g).length
    await g.playArc(arc)
    expect(statuses(g).length, `${arc}: статус до хода игрока`).toBe(before)
  }
  expect(holds(g), `${arc}: состояние не наступило`).toBe(true)
}
const nivaAway = (g: Game) => g.S.mem['niva.away'] === true

describe('статус Алика живёт миром', () => {
  it('«Нива» уехала: до серии статуса нет, после хода игрока — строка, один раз', async () => {
    const { game } = makeGame()
    await turn(game)
    expect(statuses(game)).toEqual([])
    await playUntil(game, 'niva', nivaAway)
    await turn(game)
    expect(statuses(game)).toEqual(['Алик Воздухонесян изменил статус: «Ищу «Ниву». Видели — звоните»'])
    for (let i = 0; i < 3; i++) await turn(game)
    expect(statuses(game)).toHaveLength(1)
  })
  it('Борис заболел и Размик на кране — свои строки; два открытых состояния — по одной строке за ход', async () => {
    const { game } = makeGame()
    await playUntil(game, 'boris', (g) => g.S.actors.boris?.sick === true)
    await playUntil(game, 'razmik', (g) => g.S.arcs.razmik !== undefined)
    await turn(game)
    expect(statuses(game)).toHaveLength(1)
    await turn(game)
    expect(statuses(game).sort()).toEqual([
      'Алик Воздухонесян изменил статус: «Сиделка барана. Звонить шёпотом»',
      'Алик Воздухонесян изменил статус: «Снимаю Размика с крана. Не отвлекать, высоко»',
    ].sort())
  })
  it('свадьба Самвела с тамадой — «Тамада»', async () => {
    const { game } = makeGame()
    Object.assign(game.S.mem, { 'intro.samvel': true, 'intro.tamada': true, 'wedding.samvel': true })
    await turn(game)
    expect(statuses(game)).toEqual(['Алик Воздухонесян изменил статус: «Тамада. До последнего тоста не беспокоить 🥂»'])
  })
  it('вежливость-убийца — голос колл-центра', async () => {
    const { game } = makeGame()
    game.S.mem.polite = true
    await turn(game)
    expect(statuses(game)).toEqual(['Алик Воздухонесян изменил статус: «Уважаемые клиенты! Ваше обращение очень важно для нас»'])
  })
  it('знакомство без состояния — строки нет: статус держит факт состояния, а не имя', async () => {
    const { game } = makeGame()
    Object.assign(game.S.mem, { 'intro.niva': true, 'intro.samvel': true, 'intro.tamada': true, 'finale.razmik': 'default' })
    Object.assign(game.S.arcs, { boris: { i: 1, last: 0 }, razmik: { i: 8, last: 0 } })
    for (let i = 0; i < 3; i++) await turn(game)
    expect(statuses(game)).toEqual([])
  })
  it('в блоке, при «смерти», с телефоном у Карине и в эндгейме — молчит', async () => {
    const quiet: Record<string, (g: Game) => void> = {
      блок: (g) => { g.S.mem.blocked = true },
      смерть: (g) => { g.S.mem.alik_dead = true },
      'телефон у Карине': (g) => { g.S.mem['phone.karine'] = true },
      эндгейм: (g) => { g.S.mem['endgame.active'] = true },
    }
    for (const [name, setup] of Object.entries(quiet)) {
      const { game } = makeGame()
      await playUntil(game, 'niva', nivaAway)
      setup(game)
      await turn(game)
      expect(statuses(game), name).toEqual([])
    }
  })
  it('статус не называет сроков и дат: такой текст — обещание без записи', () => {
    for (const l of ALIK_STATUS.map(valueOf)) expect((l as LineSpec).t).not.toMatch(/понедельник|вторник|сред|четверг|пятниц|суббот|воскрес|завтра|недел|месяц|\d/i)
  })
})
