// Блоки эволюционируют по счёту (#1423): второй — мама, третий — канцелярия, четвёртый и дальше — тишина.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../../test/helpers'
import type { Game } from '../../engine/game'
import type { Msg } from '../../engine/state'
import * as T from '../rude'
import { HEAT, blocked, count } from '../memkeys'
import { valueOf, isOpen, type Entry } from '../fact'

const texts = (game: Game, from: number) => game.S.msgs.slice(from).map((m) => (m.kind === 'text' || m.kind === 'sys' ? m.text : m.kind === 'sticker' ? m.e : ''))
const whos = (game: Game, from: number) => game.S.msgs.slice(from).filter((m): m is Extract<Msg, { kind: 'text' }> => m.kind === 'text').map((m) => m.who ?? 'alik')
const all = (pool: readonly Entry<T.Said>[]) => pool.map(valueOf).map(([, t]) => t)
const said = (pool: readonly Entry<T.Said>[]) => pool.map(valueOf)

/** Следующий блок настоящей лестницей: блок снят, перерыв Rude_Block прошёл, ссора снова горячая. */
async function blockOnce(game: Game): Promise<number> {
  game.S.mem[blocked] = false
  game.nextDay(11)
  await game.afterTurn()
  game.S.mem[HEAT] = 3
  const from = game.S.msgs.length
  expect((await game.fire('PlayerMessage', { tone: 'rude' }))?.name, 'блок не наступил — проверка пустеет').toBe('Rude_Block')
  return from
}

describe('блоки эволюционируют по счёту', () => {
  it('счёт блока растёт с каждым Rude_Block', async () => {
    const { game } = makeGame()
    for (const n of [1, 2, 3, 4]) {
      await blockOnce(game)
      expect(game.S.mem[count.block], `счёт после ${n}-го блока`).toBe(n)
    }
  })
  it('второй блок — мама-дипломатия: пишет мама, Бориса-домофона нет', async () => {
    const { game } = makeGame()
    await blockOnce(game)
    const from = await blockOnce(game)
    expect(whos(game, from), 'второй блок ответил не мамой').toEqual(['mama'])
    expect(all(T.BLOCK_MAMA)).toContain(texts(game, from).at(-1))
    expect(texts(game, from).filter((t) => all(T.RUDE_ALT).includes(t)), 'вернулись чужие каналы первого блока').toEqual([])
    expect(T.RUDE_BLOCK_SYS.map(valueOf), 'блок перестал объявлять недоставку').toContain(texts(game, from)[0])
  })
  it('во втором блоке мама пишет и на недоставленный крик, а Алик молчит', async () => {
    const { game } = makeGame()
    await blockOnce(game)
    await blockOnce(game)
    const from = game.S.msgs.length
    expect((await game.fire('PlayerMessage', { tone: 'rude' }))?.name).toBe('Rude_WhileBlocked')
    expect(texts(game, from)[0], 'крик в блоке перестал быть недоставленным').toBe(T.NOT_DELIVERED)
    expect(whos(game, from)).toEqual(['mama'])
    expect(all(T.BLOCK_MAMA)).toContain(texts(game, from).at(-1))
  })
  it('третий блок — канцелярия: отвечает регламентом, а не чужим телефоном', async () => {
    const { game } = makeGame()
    await blockOnce(game)
    await blockOnce(game)
    const from = await blockOnce(game)
    const reply = texts(game, from).at(-1)!
    expect(all(T.BLOCK_OFFICE), 'третий блок ответил не канцелярией').toContain(reply)
    expect(texts(game, from).filter((t) => all(T.RUDE_ALT).includes(t))).toEqual([])
    expect(whos(game, from), 'канцелярия заговорила чужим голосом').toContain('alik')
  })
  it('строки Арсена в канцелярии закрыты, пока он не появился', () => {
    const { game } = makeGame()
    const open = () => T.BLOCK_OFFICE.filter((e) => isOpen(e, game.lineFacts())).map(valueOf).map(([, t]) => t)
    const arsenal = said(T.BLOCK_OFFICE).filter(([who]) => who === 'arsen').map(([, t]) => t)
    expect(arsenal.length, 'в пуле нет строк Арсена — проверка пустеет').toBeGreaterThan(0)
    for (const t of arsenal) expect(open(), 'Арсен говорит до знакомства').not.toContain(t)
    game.S.mem['intro.arsen'] = true
    for (const t of arsenal) expect(open()).toContain(t)
  })
  it('четвёртый блок — полная тишина: недоставка без ответов и без каналов', async () => {
    const { game } = makeGame()
    await blockOnce(game)
    await blockOnce(game)
    await blockOnce(game)
    const from = await blockOnce(game)
    expect(game.S.msgs.slice(from), 'четвёртый блок пустил альтернативный канал').toHaveLength(1)
    expect(whos(game, from), 'четвёртый блок кому-то ответил').toEqual([])
    expect(T.RUDE_BLOCK_SYS.map(valueOf)).toContain(texts(game, from)[0])
    const cry = game.S.msgs.length
    expect((await game.fire('PlayerMessage', { tone: 'rude' }))?.name).toBe('Rude_WhileBlocked')
    expect(texts(game, cry), 'в четвёртом блоке крик получил ответ').toEqual([T.NOT_DELIVERED])
    const turn = game.S.msgs.length
    expect((await game.fire('AlikTurn'))?.name).toBe('Turn_Blocked')
    expect(texts(game, turn), 'обычный ход Алика пробил полную тишину').toEqual([])
  })
  it('исчерпанная мама не отдаёт слово Алику: канал молчит, а не отмазывается', async () => {
    const { game } = makeGame()
    await blockOnce(game)
    await blockOnce(game)
    for (let i = 0; i < T.BLOCK_MAMA.length + 2; i++) await game.fire('AlikTurn')
    expect(game.S.ctx?.offended, 'молчание канала потеряло контекст обиды').toBe(true)
    const from = game.S.msgs.length
    expect((await game.fire('AlikTurn'))?.name).toBe('Turn_Blocked')
    expect(texts(game, from), 'пул мамы кончился — Алик заговорил сам').toEqual([])
  })
  it('первый блок остаётся прежним: чужие каналы и «не доставлено» на крик', async () => {
    const { game } = makeGame()
    game.S.arcs.boris = { i: 4, last: 0 } // Борис уже пишет — каналов больше одного, проверка не на исчерпании пула
    const from = await blockOnce(game)
    expect(['boris', 'niva', 'intercom']).toContain(whos(game, from)[0])
    const cry = game.S.msgs.length
    expect((await game.fire('PlayerMessage', { tone: 'rude' }))?.name).toBe('Rude_WhileBlocked')
    expect(texts(game, cry)[0]).toBe(T.NOT_DELIVERED)
    expect(['boris', 'niva', 'intercom']).toContain(whos(game, cry)[0])
  })
})
