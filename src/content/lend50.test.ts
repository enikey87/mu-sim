// «Займи 50» в эндгейме (docs/design/lend-50.md): просьба после вступления, три кнопки, честная ссылка.
// Деньги и долг не двигаются — это проверяет каждая ветка.
import { describe, it, expect } from 'vitest'
import { flush, makeGame, memStorage } from '../test/helpers'
import type { Game } from '../engine/game'
import { uiOf, viewOf } from '../ui/view'
import {
  LEND50_LINK, LEND50_LOCKED, LEND50_NO, LEND50_NUNE, LEND50_RENAME, LEND50_SERIOUS, LEND50_SYS, LEND50_YES,
} from './endgame'

const texts = (g: Game, from = 0) => g.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))

/** День выплаты закрыт — как игрок: экран итогов закрывает эндгейм. */
const enter = async (g: Game, outcome = 'default'): Promise<number> => {
  g.S.mem.payday = outcome
  g.S.ending = `payday_${outcome}`
  g.S.endings[`payday_${outcome}`] = g.S.day
  const from = g.S.msgs.length
  await g.closeEnding()
  await flush() // просьба идёт после паузы — цепочка дожидается
  return from
}
const pick = async (g: Game, act: string) => {
  const c = g.choices.find((x) => x.act === act)
  expect(c, act).toBeDefined()
  g.S.choices = null
  await g.send(c!)
}
const descOf = (g: Game, id: string) => viewOf(uiOf(g)).ach.find((a) => a.id === id)!.desc

describe('«Займи 50»', () => {
  it('просьба идёт за вступлением, подводка — три реплики, «Верну» последняя, системное сразу за ней', async () => {
    const { game } = makeGame()
    const from = await enter(game)
    const t = texts(game, from)
    const intro = t.findIndex((x) => /Остаток выплачен|Французский оригинал|Деньги настоящие|Не хватает одной монеты/.test(x))
    const ask = t.indexOf('Брат. Слушай сюда. Только не смейся.')
    expect(ask).toBeGreaterThan(intro)
    expect(t.slice(ask, ask + 3)).toEqual(['Брат. Слушай сюда. Только не смейся.', 'Займи 50 ₽.', 'Верну. Ты меня знаешь.'])
    expect(game.S.mem['lend50.asked']).toBe(true)
    expect(t.slice(-2)).toEqual([LEND50_SYS, LEND50_LINK])
    expect(game.choices.map((c) => c.act)).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
  })
  it('вступление и формальности не перебиты: группа и первая реплика вступления — до просьбы', async () => {
    const { game } = makeGame()
    const from = await enter(game)
    const t = texts(game, from)
    expect(t[0]).toMatch(/создал группу «ВЫПЛАТА ЗАКРЫТА/)
    expect(t[1]).toBe('Алик добавил вас')
    const ask = t.indexOf('Брат. Слушай сюда. Только не смейся.')
    expect(ask).toBeGreaterThan(t.indexOf('Алик добавил вас'))
    expect(ask).toBeGreaterThan(t.findIndex((x) => /Остаток выплачен|Французский оригинал|Деньги настоящие|Не хватает одной монеты/.test(x)))
  })
  it('«Перевёл»: ответ, переименование группы, ачивка с описанием про портфель', async () => {
    const { game } = makeGame()
    await enter(game)
    const money = game.S.money
    const debt = game.S.debt
    const from = game.S.msgs.length
    await pick(game, 'lend50Yes')
    const t = texts(game, from)
    expect(t).toContain(LEND50_YES)
    expect(t).toContain(`Алик изменил название группы на «${LEND50_RENAME}»`)
    expect(game.S.mem['endgame.renames']).toBe(1)
    expect(game.S.mem['lend50.answer']).toBe('yes')
    expect(game.S.ach.lend50).toBeDefined()
    expect(descOf(game, 'lend50')).toMatch(/Одолжил Алику 50 ₽/)
    expect(t.join(' ')).not.toMatch(/Вам перевод|Возврат/) // перевод настоящий, и он не игровой
    expect([game.S.money, game.S.debt]).toEqual([money, debt])
  })
  it('«Не дам»: ответ, ачивка про первого человека, ни денег, ни переименования', async () => {
    const { game } = makeGame()
    await enter(game)
    const money = game.S.money
    const debt = game.S.debt
    const from = game.S.msgs.length
    await pick(game, 'lend50No')
    const t = texts(game, from)
    expect(t.some((x) => LEND50_NO.includes(x))).toBe(true)
    expect(t.join(' ')).not.toMatch(/изменил название группы/)
    expect(game.S.mem['endgame.renames']).toBe(0)
    expect(game.S.mem['lend50.answer']).toBe('no')
    expect(descOf(game, 'lend50')).toMatch(/Первый человек, у которого это получилось/)
    expect(t.join(' ')).not.toMatch(/Вам перевод|Возврат/)
    expect([game.S.money, game.S.debt]).toEqual([money, debt])
  })
  it('«Ты серьёзно?»: ответ и своё описание ачивки', async () => {
    const { game } = makeGame()
    await enter(game)
    const from = game.S.msgs.length
    await pick(game, 'lend50Serious')
    expect(texts(game, from)).toContain(LEND50_SERIOUS)
    expect(game.S.mem['lend50.answer']).toBe('serious')
    expect(descOf(game, 'lend50')).toMatch(/Спросил Алика, серьёзно ли он/)
  })
  it('до ответа описание нейтральное: ачивка ещё не получена', async () => {
    const { game } = makeGame()
    await enter(game)
    expect(game.S.ach.lend50).toBeUndefined()
    expect(descOf(game, 'lend50')).toBe(LEND50_LOCKED)
  })
  it('Нуне отвечает только знакомая: незнакомая — молчит, знакомая — по ведомости займ', async () => {
    const { game } = makeGame()
    await enter(game)
    const from = game.S.msgs.length
    await pick(game, 'lend50Yes')
    expect(texts(game, from)).not.toContain(LEND50_NUNE)
    const { game: g2 } = makeGame()
    Object.assign(g2.S.mem, { 'intro.nune': true, 'met.nune': true })
    await enter(g2)
    const f2 = g2.S.msgs.length
    await pick(g2, 'lend50Yes')
    expect(texts(g2, f2)).toContain(LEND50_NUNE)
  })
  it('вторая партия на том же устройстве просит другим текстом', async () => {
    const storage = memStorage()
    const { game } = makeGame({ storage })
    await enter(game)
    expect(texts(game)).toContain('Брат. Слушай сюда. Только не смейся.')
    game.reset() // «Начать заново»: сохранение партии стёрто, отметка устройства — нет
    const { game: g2 } = makeGame({ storage })
    await enter(g2)
    const t = texts(g2)
    expect(t).toContain('Опять я. Опять 50. Это уже традиция, брат.')
    expect(t).not.toContain('Брат. Слушай сюда. Только не смейся.')
  })
  it('воспоминание требует фактов: без ответа молчит, после ответа звучит один раз', async () => {
    const { game } = makeGame()
    const mem = () => game.S.msgs.filter((m) => m.kind === 'text' && /50 давал/.test(m.text)).length
    await enter(game)
    await game.endgameFormality()
    expect(mem()).toBe(0)
    await pick(game, 'lend50No')
    await game.endgameFormality()
    expect(mem()).toBe(1)
    for (let i = 0; i < 3; i++) await game.endgameFormality()
    expect(mem()).toBe(1)
  })
})
