// Реакции на заметные системные события (#927): вариант в блоке в окне события (ход и 1–3 после), вне окна — нет.
import { describe, it, expect, vi } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { NOTIF } from './life'
import { P_RAM_PHOTO, P_BORIS_SALE, P_VACANCY, P_AVITO_REVIEW, P_RUBIK_ASK, P_KETTLE, P_COLLECTORS_ASK } from './rules/player-choice-pools'
import { BORIS_SALE, RUBIK_ASK, KETTLE, COUNTERSUIT_B } from './world'
import { ARCS } from './arcs'
import { FINALES } from './finales'
import { court, HEAT } from './memkeys'
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

  it('ответ на реакцию потребляет событие: вариант больше не предлагается, строка пула не повторяется (#918)', async () => {
    const has = (game: Game, act: string) => game.buildChoices().some((c) => c.act === act)
    // фото-баран — настоящим событием хода
    const { game } = makeGame()
    game.S.stats.sent = 24
    await game.send('привет')
    expect(game.S.ram, 'фото-баран не сработал — проверка пустеет').toBe(true)
    expect(has(game, 'ramPhoto'), 'вариант на ход события есть').toBe(true)
    await game.fire('PlayerSays', { intent: 'ramPhoto' })
    expect(has(game, 'ramPhoto'), 'после ответа окно закрыто: второй реплики из того же пула нет').toBe(false)
    // объявление Бориса, вакансия и отзыв Авито
    for (const [card, act, prep] of [
      [AD, 'borisSale', (g: Game) => { g.S.mem['intro.baran'] = true; g.S.arcs.boris = { i: 4, last: 0 } }],
      [VACANCY_CARD, 'vacancy', () => {}],
      [REVIEW_CARD, 'avitoReview', () => {}],
    ] as Array<[string, string, (g: Game) => void]>) {
      const g = makeGame().game
      prep(g)
      showCard(g, card)
      expect(has(g, act), `${act}: вариант на ход события есть`).toBe(true)
      await g.fire('PlayerSays', { intent: act })
      expect(has(g, act), `${act}: после ответа окно закрыто`).toBe(false)
    }
  })
})

describe('прямые вопросы и первые сообщения (#958): окно отклика', () => {
  const has = (game: Game, act: string) => { game.S.choices = null; return game.buildChoices().some((c) => c.act === act) }
  const answered = async (game: Game, act: string) => {
    expect(has(game, act), `${act}: варианта нет на ходу события`).toBe(true)
    await game.fire('PlayerSays', { intent: act })
    expect(has(game, act), `${act}: после ответа окно не закрылось`).toBe(false)
  }

  it('первое сообщение Тарона: отклик в окне звонка, после ответа закрыт', async () => {
    const { game } = makeGame()
    expect(has(game, 'crewCall'), 'без звонка варианта нет').toBe(false)
    game.S.day = 210
    await game.fire('AlikIdle')
    await answered(game, 'crewCall')
  })

  it('первое сообщение Арсена-юриста: отклик про суд, после ответа закрыт', async () => {
    const { game } = makeGame()
    expect(has(game, 'lawyerAsk'), 'без угрозы судом варианта нет').toBe(false)
    game.S.mem[court] = 1
    await game.fire('PlayerMessage', { tone: 'threat' })
    expect(game.S.mem['intro.arsen'], 'Арсен вошёл в историю своим сообщением').toBe(true)
    await answered(game, 'lawyerAsk')
  })

  it('вопрос Алика «тебе коллекторы пишут?»: отклик есть, после ответа окно закрыто', async () => {
    const { game } = makeGame()
    expect(has(game, 'collectorsAsk'), 'без вопроса варианта нет').toBe(false)
    await game.playEpisode(ARCS.collectors.eps[1], 'collectors')
    await answered(game, 'collectorsAsk')
  })

  it('предложение стажировки «Деньги-Ара»: принять/отклонить, после ответа окно закрыто', async () => {
    const { game } = makeGame()
    expect(has(game, 'internOffer'), 'без предложения варианта нет').toBe(false)
    await game.playFinale('collectors', FINALES.collectors.find((f) => f.id === 'intern')!)
    await answered(game, 'internOffer')
  })

  it('вопрос «дырку заделаешь?»: отклик в окне, после ответа закрыт', async () => {
    const { game } = makeGame()
    expect(has(game, 'rubikHole'), 'без вопроса варианта нет').toBe(false)
    await game.playEpisode(ARCS.rubik.eps[3], 'rubik')
    await answered(game, 'rubikHole')
  })

  it('ответ про коллекторов держит только то, что они писали до вопроса (#970)', async () => {
    const pool = P_COLLECTORS_ASK.map(valueOf).join(' ')
    // приглашение и стажировка — только финал арки: в окне вопроса их быть не должно
    expect(pool, 'приглашение/стажировка в окне вопроса').not.toMatch(/стажировк|зовут к себе|три чая/i)
    expect(pool).toMatch(/где он|поручител|должны/i)
    // настоящий прогон: дебют коллекторов звучит до вопроса Алика — вопрос и кнопки держатся
    const { game } = makeGame()
    await game.playEpisode(ARCS.collectors.eps[0], 'collectors')
    await game.playEpisode(ARCS.collectors.eps[1], 'collectors')
    expect(game.open(P_COLLECTORS_ASK).length, 'пул окна пуст — проверка пустеет').toBeGreaterThan(0)
    expect(has(game, 'collectorsAsk'), 'окно вопроса открыто').toBe(true)
  })
})

describe('встречный иск (#964): окно отклика', () => {
  it('после встречного иска кнопки в окне, ответ закрывает окно', async () => {
    const { game } = makeGame()
    const has = () => { game.S.choices = null; return game.buildChoices().some((c) => c.act === 'countersuitAsk') }
    expect(has(), 'без иска кнопки нет').toBe(false)
    game.S.mem[HEAT] = 2
    const fired = await game.fire('PlayerMessage', { tone: 'threat' })
    expect(fired?.name, 'встречный иск не сработал — проверка пустеет').toBe('Tone_Threat_Hot')
    const at = Number(game.S.mem['countersuit.at'])
    expect(at, 'последовательность не штампанула ход').toBe(game.S.stats.sent)
    expect(has(), 'ход события — кнопка есть').toBe(true)
    game.S.stats.sent = at + 3
    expect(has(), 'третий ход после события — ещё окно').toBe(true)
    game.S.stats.sent = at + 4
    expect(has(), 'вне окна — кнопки нет').toBe(false)
    game.S.stats.sent = at
    const from = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'countersuitAsk' })
    const said = game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    expect(said.some((t) => COUNTERSUIT_B.map(valueOf).includes(t)), 'ответ не из пула').toBe(true)
    expect(has(), 'после ответа окно закрыто').toBe(false)
  })
})

describe('реакции: вопрос Рубика и чайник (#953)', () => {
  const has = (game: Game, act: string) => game.buildChoices().some((c) => c.act === act)

  it('прямой вопрос Рубика: кнопки в окне, после ответа окно закрыто', async () => {
    const { game } = makeGame()
    expect(has(game, 'rubikAsk'), 'до вопроса кнопки нет').toBe(false)
    await game.playEpisode(ARCS.rubik.eps[2], 'rubik')
    const at = Number(game.S.mem['rubik.askAt'])
    expect(at, 'реплика не штампанула ход').toBe(game.S.stats.sent)
    expect(has(game, 'rubikAsk'), 'ход события — кнопка есть').toBe(true)
    const rubikText = game.buildChoices().find((c) => c.act === 'rubikAsk')!.text.toLowerCase()
    expect(P_RUBIK_ASK.some((t) => rubikText.includes(t.slice(0, 12).toLowerCase())), rubikText).toBe(true)
    game.S.stats.sent = at + 3
    expect(has(game, 'rubikAsk'), 'третий ход после события — ещё окно').toBe(true)
    game.S.stats.sent = at + 4
    expect(has(game, 'rubikAsk'), 'вне окна — кнопки нет').toBe(false)
    game.S.stats.sent = at
    const from = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'rubikAsk' })
    const said = game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    expect(said.some((t) => RUBIK_ASK.map(valueOf).includes(t)), 'ответ не из пула').toBe(true)
    expect(has(game, 'rubikAsk'), 'после ответа окно закрыто').toBe(false)
  })

  it('выигрыш чайника: кнопки в окне, после ответа окно закрыто', async () => {
    const { game } = makeGame()
    expect(has(game, 'kettle'), 'до выигрыша кнопки нет').toBe(false)
    await game.enterNode('q_lottery', 'draw')
    const at = Number(game.S.mem['lottery.kettleAt'])
    expect(at, 'реплика кума не штампанула ход').toBe(game.S.stats.sent)
    expect(has(game, 'kettle'), 'ход события — кнопка есть').toBe(true)
    const kettleText = game.buildChoices().find((c) => c.act === 'kettle')!.text.toLowerCase()
    expect(P_KETTLE.some((t) => kettleText.includes(t.slice(0, 12).toLowerCase())), kettleText).toBe(true)
    game.S.stats.sent = at + 3
    expect(has(game, 'kettle'), 'третий ход после события — ещё окно').toBe(true)
    game.S.stats.sent = at + 4
    expect(has(game, 'kettle'), 'вне окна — кнопки нет').toBe(false)
    game.S.stats.sent = at
    const from = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'kettle' })
    const said = game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    expect(said.some((t) => KETTLE.map(valueOf).includes(t)), 'ответ не из пула').toBe(true)
    expect(has(game, 'kettle'), 'после ответа окно закрыто').toBe(false)
  })
})
