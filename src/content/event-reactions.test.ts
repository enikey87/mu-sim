// Реакции на заметные системные события (#927): вариант в блоке в окне события (ход и 1–3 после), вне окна — нет.
import { describe, it, expect, vi } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { NOTIF } from './life'
import { P_RAM_PHOTO, P_BORIS_SALE, P_VACANCY, P_AVITO_REVIEW } from './rules/player-choice-pools'
import { BORIS_SALE } from './world'
import { valueOf } from './fact'

const AD = 'Новое объявление рядом: «Продаю барана Бориса, торг, умеет писать».'
const VACANCY_CARD = 'Новая вакансия: плиточник, оплата сразу! Работодатель: Алик В.'
const REVIEW_CARD = 'Алик Воздухонесян оставил вам отзыв: «Хороший парень, терпеливый» ⭐⭐⭐⭐⭐'

/** Показать конкретную карточку настоящим производителем (randomNotif), а не присваиванием факта. */
const showCard = (game: Game, text: string) => {
  const entry = NOTIF.find((n) => n.t === text)!
  const pick = game.lines.pick.bind(game.lines)
  const stub = vi.spyOn(game.lines, 'pick').mockImplementation((key, pool, facts, opts) =>
    pick(key, key === 'NOTIF' ? [entry] : pool, facts, opts))
  try { game.randomNotif() } finally { stub.mockRestore() }
}

describe('реакции на системные события (#927)', () => {
  it('фото-баран: вариант в блоке сразу после события и уходит после окна', async () => {
    const { game } = makeGame()
    game.S.stats.sent = 24
    await game.send('привет')
    // событие случилось настоящим ходом: фото на 25-м сообщении
    expect(game.S.ram, 'фото-баран не сработал — проверка пустеет').toBe(true)
    const at = Number(game.S.mem['ram.photoAt'])
    expect(at).toBe(game.S.stats.sent)
    const has = () => game.buildChoices().some((c) => c.act === 'ramPhoto')
    expect(has(), 'ход события — вариант есть').toBe(true)
    game.S.stats.sent = at + 3
    expect(has(), 'третий ход после события — ещё окно').toBe(true)
    game.S.stats.sent = at + 4
    expect(has(), 'вне окна — варианта нет').toBe(false)
  })

  it('объявление о продаже Бориса: вариант в блоке в окне и ответ из пула события', async () => {
    const { game } = makeGame()
    game.S.mem['intro.baran'] = true
    game.S.arcs.boris = { i: 4, last: 0 }
    showCard(game, AD)
    const at = Number(game.S.mem['boris.saleAt'])
    expect(at).toBe(game.S.stats.sent)
    const has = () => game.buildChoices().some((c) => c.act === 'borisSale')
    expect(has(), 'ход события — вариант есть').toBe(true)
    game.S.stats.sent = at + 4
    expect(has(), 'вне окна — варианта нет').toBe(false)
    // ответ Алика — из пула события, а не общая отмазка
    game.S.stats.sent = at
    const from = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'borisSale' })
    const said = game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    expect(said.some((t) => BORIS_SALE.map(valueOf).includes(t)), 'ответ не из пула').toBe(true)
  })

  it('вакансия «оплата сразу»: вариант в блоке в окне и уходит после', () => {
    const { game } = makeGame()
    showCard(game, VACANCY_CARD)
    const at = Number(game.S.mem['vacancy.at'])
    expect(at).toBe(game.S.stats.sent)
    const has = () => game.buildChoices().some((c) => c.act === 'vacancy')
    expect(has(), 'ход события — вариант есть').toBe(true)
    game.S.stats.sent = at + 3
    expect(has(), 'третий ход после события — ещё окно').toBe(true)
    game.S.stats.sent = at + 4
    expect(has(), 'вне окна — варианта нет').toBe(false)
  })

  it('отзыв Авито «терпеливый»: вариант в блоке в окне и уходит после', () => {
    const { game } = makeGame()
    showCard(game, REVIEW_CARD)
    const at = Number(game.S.mem['avito.reviewAt'])
    expect(at).toBe(game.S.stats.sent)
    const has = () => game.buildChoices().some((c) => c.act === 'avitoReview')
    expect(has(), 'ход события — вариант есть').toBe(true)
    game.S.stats.sent = at + 3
    expect(has(), 'третий ход после события — ещё окно').toBe(true)
    game.S.stats.sent = at + 4
    expect(has(), 'вне окна — варианта нет').toBe(false)
  })

  it('пулы реакций и ответов не пусты (#927)', () => {
    expect(P_RAM_PHOTO.length).toBeGreaterThan(0)
    expect(P_BORIS_SALE.length).toBeGreaterThan(0)
    expect(P_VACANCY.length).toBeGreaterThan(0)
    expect(P_AVITO_REVIEW.length).toBeGreaterThan(0)
  })
})
