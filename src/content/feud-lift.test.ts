// #1570: примирение слышно и стоит усилий. Вход в сход объявляют стикер и реплики (Rude_Vendetta),
// а выход раньше не объявлялся ничем: извинение молча чистило флаги, игрок не отличал «простили»
// от «отстали». Здесь держатся три вещи: маркер снятия (система + статус) на любом канале, рамка
// «это окно, а не приговор» у чекпоинта «Кровный враг», и цена выхода — первое прямое «прости»
// вражду только называет.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { ENDINGS, CHRONIC_RUDE_AFTER_VENDETTA } from './finales'
import { FEUD_LIFTED, FEUD_PRICE } from './rude'
import { valueOf } from './fact'
import { vendettaLifted, vendettaPrice } from './memkeys'

const sysTexts = (g: Game): string[] => g.S.msgs.flatMap((m) => (m.kind === 'sys' ? [m.text] : []))
const statuses = (g: Game): string[] => sysTexts(g).filter((t) => t.startsWith('Алик Воздухонесян изменил статус'))
const lifted = (g: Game): number => sysTexts(g).filter((t) => t === FEUD_LIFTED).length
const stickers = (g: Game): string[] => g.S.msgs.flatMap((m) => (m.kind === 'sticker' ? [m.e] : []))
const feud = (g: Game): void => { Object.assign(g.S.mem, { vendetta: true, coldWar: true }) }
/** Экран «Кровного врага» по его собственному условию: сход, хроника и ни одного извинения. */
const chronicle = (g: Game): void => { Object.assign(g.S.mem, { vendetta: true, 'count.rudeAfterVendetta': CHRONIC_RUDE_AFTER_VENDETTA }) }
const ending = (id: string) => ENDINGS.find((e) => e.id === id)!
const texts = (id: string): string => [ending(id).text, ...ending(id).m.map((m) => valueOf(m))].join('\n')

describe('снятие вражды слышно (#1570)', () => {
  it('второе прямое извинение: системная строка снятия, стикер перемирия и статус «Не враг. Пока»', async () => {
    const { game } = makeGame()
    feud(game)
    await game.send('Прости, Алик, я погорячился')
    expect(lifted(game), 'первое «прости» объявило снятие').toBe(0)

    await game.send('Прости, Алик, я погорячился')

    expect(game.S.mem.vendetta, 'сход не снят').toBe(false)
    expect(lifted(game), 'снятие не названо').toBe(1)
    expect(stickers(game), 'стикер перемирия не показан').toContain('🕊️')
    expect(statuses(game), 'статус не сменился').toEqual(['Алик Воздухонесян изменил статус: «Не враг. Пока»'])
  })

  it('маркер — тот же на посреднике: один и тот же текст, один раз', async () => {
    const { game } = makeGame()
    feud(game)
    game.S.mem['intro.karine'] = true

    await game.send({ text: 'Мир?', tone: 'polite', act: 'via', arg: 'karine' })

    expect(game.S.mem.vendetta).toBe(false)
    expect(lifted(game), 'посредник снял вражду молча').toBe(1)
    expect(stickers(game)).toContain('🕊️')
    expect(statuses(game).filter((s) => s.includes('Не враг')), 'статус не прозвучал').toHaveLength(1)
  })

  it('маркер — тот же на ритуале примирения: сцена чистит флаги, ход называет снятие', async () => {
    const { game } = makeGame()
    feud(game)
    await game.enterNode('ritual', 'ask')
    game.S.choices = null

    await game.send(game.choices.find((c) => c.go === 'moo')!)

    expect(game.S.mem.vendetta).toBe(false)
    expect(lifted(game), 'ритуал снял вражду молча').toBe(1)
  })

  it('статус звучит один раз за партию: следующие ходы его не повторяют', async () => {
    const { game } = makeGame()
    feud(game)
    await game.send('Прости, Алик, я погорячился')
    await game.send('Прости, Алик, я погорячился')
    const once = statuses(game).filter((s) => s.includes('Не враг'))
    expect(once).toHaveLength(1)
    for (let i = 0; i < 3; i++) await game.send('Доброе утро, Алик.')
    expect(statuses(game).filter((s) => s.includes('Не враг')), 'статус повторился').toHaveLength(1)
  })

  it('НК маркера: без снятия флага строки снятия нет — объявленная вражда молчит о мире', async () => {
    const { game } = makeGame()
    feud(game)
    await game.send('Доброе утро, Алик.')
    expect(game.S.mem.vendetta, 'вражда кончилась сама').toBe(true)
    expect(lifted(game), 'снятие прозвучало без снятия').toBe(0)
    expect(stickers(game)).not.toContain('🕊️')
    expect(statuses(game).some((s) => s.includes('Не враг'))).toBe(false)
  })
})

describe('цена выхода: одно «прости» вражду не снимает (#1570)', () => {
  it('первое прямое извинение называет цену, флаги целы, извинение не засчитано', async () => {
    const { game } = makeGame()
    feud(game)

    await game.send('Прости, Алик, я погорячился')

    expect(game.S.mem.vendetta, 'одно «прости» сняло сход').toBe(true)
    expect(game.S.mem.coldWar, 'одно «прости» кончило холодную войну').toBe(true)
    expect(game.S.mem['count.sorry'] ?? 0, 'отклонённое извинение засчитано').toBe(0)
    expect(game.S.mem[vendettaPrice], 'цену не назвали').toBe(true)
    const said = game.S.msgs.filter((m) => m.kind === 'text' && m.from === 'alik').at(-1)
    expect(FEUD_PRICE.map(valueOf)).toContain(said && said.kind === 'text' ? said.text : '')
  })

  it('кнопка «Sorry» остаётся в кадре: отказ держит контекст обиды', async () => {
    const { game } = makeGame()
    feud(game)
    await game.send('Прости, Алик, я погорячился')
    game.S.choices = null
    expect(game.choices.some((c) => c.act === 'sorry'), 'извиниться второй раз нечем').toBe(true)
  })

  it('извинение через посредника цену не платит — оно и есть настоящий выход', async () => {
    const { game } = makeGame()
    feud(game)
    await game.send({ text: 'Мир?', tone: 'polite', act: 'via', arg: 'mama' })
    expect(game.S.mem.vendetta).toBe(false)
  })

  it('после отказа хроника «Кровного врага» по-прежнему достижима: ни одного засчитанного извинения', async () => {
    const { game } = makeGame()
    feud(game)
    await game.send('Прости, Алик, я погорячился')
    Object.assign(game.S.mem, { 'count.rudeAfterVendetta': CHRONIC_RUDE_AFTER_VENDETTA })
    await game.fire('CheckEnding')
    expect(game.S.ending, 'отклонённое извинение закрыло чекпоинт').toBe('bloodfeud')
  })
})

describe('чекпоинт «Кровный враг» — окно, а не приговор (#1570)', () => {
  it('финальная строка называет окно выхода', () => {
    expect(texts('bloodfeud')).toContain('если извинишься — разговор другой')
  })

  it('текст чекпоинта не объявляет конец пути', () => {
    expect(texts('bloodfeud')).not.toMatch(/конец пути|Дня выплаты не будет/)
    expect(texts('bloodfeud')).toMatch(/не финал/)
  })

  it('НК: терминальная «Вендетта» рамки окна не получает — она и есть навсегда', () => {
    expect(texts('vendetta')).not.toContain('если извинишься — разговор другой')
    expect(texts('vendetta')).not.toMatch(/не финал/)
  })

  it('экран «Кровного врага» встаёт по-прежнему, а снятый сход его снимает', async () => {
    const { game } = makeGame()
    chronicle(game)
    await game.fire('CheckEnding')
    expect(game.S.ending).toBe('bloodfeud')
    expect(game.S.mem[vendettaLifted], 'метка снятия появилась без снятия').toBeUndefined()
  })
})
