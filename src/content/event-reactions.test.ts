// Реакции на заметные системные события (#927): вариант в блоке в окне события (ход и 1–3 после), вне окна — нет.
import { describe, it, expect, vi } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { NOTIF } from './life'
import { D } from './excuses'
import { P_RAM_PHOTO, P_BORIS_SALE, P_VACANCY, P_AVITO_REVIEW, P_RUBIK_ASK, P_KETTLE, P_COLLECTORS_ASK, P_LAWYER, P_DEBUT_ARSEN, P_INTERN, P_HOLE, STRASBOURG_THREAT, P_GRANT_TILE, P_MAMA_MARKET } from './rules/player-choice-pools'
import { BORIS_SALE, RUBIK_ASK, KETTLE, COUNTERSUIT_B, GRANT_TILE_B, INTERN_B, HOLE_B, AVITO_REVIEW, MAMA_MARKET_B } from './world'
import { ARCS } from './arcs'
import { FINALES } from './finales'
import { COURT_LAWYER_AGAIN } from './quests'
import { court, HEAT, lawyerAt, debutWho, arsenTrack, saidStrasburg, grantTileAt, mamaMarketAt } from './memkeys'
import { valueOf, type Line } from './fact'
import type { Choice } from '../engine/state'

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

  it('отзыв Авито: коньячная строка в пуле и выбирается (#1025)', async () => {
    const line = 'Отзыв выдержанный, как коньяк. Пять звёзд — это букет. Основная сумма — сама выдержка.'
    expect(AVITO_REVIEW.map(valueOf), 'коньячной строки нет в пуле').toContain(line)
    const { game } = makeGame()
    const seen = new Set<string>()
    // колода без повторов: несколько ответов подряд соберут весь пул
    for (let i = 0; i < AVITO_REVIEW.length + 2 && !seen.has(line); i++) {
      const from = game.S.msgs.length
      await game.fire('PlayerSays', { intent: 'avitoReview' })
      for (const t of game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' ? [m.text] : []))) seen.add(t)
    }
    expect([...seen], 'коньячная строка не выбирается').toContain(line)
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

  it('Арсен уже знаком: Court_Lawyer_Again открывает то же окно, чужой ход его закрывает, ответ потребляет (#971)', async () => {
    const lawyerChoice = (game: Game) => game.choices.find((c) => c.act === 'lawyerAsk')
    const offered = (game: Game) => game.rules.collect({ event: 'BuildChoices' }, game.facts()).some((r) => r.name === 'Opt_LawyerFirst')
    const known = async () => {
      const { game } = makeGame()
      // Арсен уже писал сам (#1017): письмо ставит и знакомство, и «писал» — иначе сработает Court_Lawyer
      game.S.mem['intro.arsen'] = true
      game.S.mem['wrote.arsen'] = true
      game.S.choices = null
      expect(game.S.mem['wrote.arsen'], 'Арсен уже писал — иначе сработает Court_Lawyer').toBe(true)
      game.S.mem[court] = 1
      game.S.offlineDays = 0
      return game
    }
    const threat = async (game: Game) => {
      const from = game.S.msgs.length
      await game.send('Подам на тебя в суд')
      const said = game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' ? [m.text] : []))
      expect(said.join(' '), 'угроза ушла в ветку «это снова Арсен»').toContain(COURT_LAWYER_AGAIN[1][1])
      expect(game.S.mem[lawyerAt], 'ветка Again штампует ход сообщения юриста').toBe(game.S.stats.sent)
      return said
    }

    const game = await known()
    expect(offered(game), 'до угрозы окна нет').toBe(false)
    await threat(game)
    const btn = lawyerChoice(game)
    expect(btn, 'ближайший блок — кнопка из P_LAWYER').toBeTruthy()
    expect(P_LAWYER.some((t) => btn!.text.toLowerCase().includes(valueOf(t).slice(0, 12).toLowerCase())), btn!.text).toBe(true)
    expect(offered(game), 'окно на ходу сообщения').toBe(true)
    for (let i = 1; i <= 3; i++) {
      await game.send('Алик, привет')
      expect(offered(game), `ход +${i}: окно ещё открыто`).toBe(true)
    }
    await game.send('Алик, привет')
    expect(game.S.stats.sent - Number(game.S.mem[lawyerAt]), 'четвёртый чужой ход — за окном').toBeGreaterThan(3)
    expect(offered(game), 'окно >3 — кнопки нет').toBe(false)
    expect(lawyerChoice(game), 'окно >3 — в блоке кнопки нет').toBeUndefined()

    const answered = await known()
    await threat(answered)
    const pick = lawyerChoice(answered)
    expect(pick, 'до ответа кнопка в блоке').toBeTruthy()
    await answered.send(pick!)
    expect(answered.S.mem[lawyerAt], 'ответ потребил штамп').toBeUndefined()
    expect(offered(answered), 'после ответа окно закрыто').toBe(false)
    expect(lawyerChoice(answered), 'повторного блока нет').toBeUndefined()
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

  // ответ окна — по выбранной строке, а не колодой (#1017): согласие/отказ и стиль ремонта
  const poolIndex = (text: string, pool: readonly string[]): number =>
    pool.findIndex((p) => text.toLowerCase().includes(p.toLowerCase()))
  const saidFrom = (game: Game, from: number): string =>
    game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' ? [m.text] : [])).join(' ')
  const textOf = (x: unknown): string => (typeof x === 'string' ? x : String((x as { t?: unknown }).t ?? ''))

  it('ответ стажировке — по выбранной строке игрока, каждая из трёх (#1017)', async () => {
    const seen = new Map<number, string>()
    for (let seed = 1; seed <= 60 && seen.size < 3; seed++) {
      const { game } = makeGame({ seed })
      await game.playFinale('collectors', FINALES.collectors.find((f) => f.id === 'intern')!)
      game.S.choices = null
      const c = game.buildChoices().find((x) => x.act === 'internOffer')
      expect(c, 'окна стажировки нет — проверка пустеет').toBeTruthy()
      const i = poolIndex(c!.text, P_INTERN)
      expect(i, `строка не из пула: «${c!.text}»`).toBeGreaterThanOrEqual(0)
      const from = game.S.msgs.length
      await game.send(c!)
      const said = saidFrom(game, from)
      const want = valueOf(INTERN_B[i])
      expect(said, `выбрано «${P_INTERN[i]}» — ответ не по строке`).toContain(textOf(want))
      if (i === 1) expect(said, 'отказу досталось «добро пожаловать»').not.toMatch(/Добро пожаловать/)
      else expect(said, 'согласию достался «отказ принят»').not.toMatch(/Отказ принят/)
      seen.set(i, said)
    }
    expect([...seen.keys()].sort(), 'не все три варианта пула получили свой ответ').toEqual([0, 1, 2])
  })

  it('ответ про дырку — по выбранной строке игрока, каждая из трёх (#1017)', async () => {
    const seen = new Map<number, string>()
    for (let seed = 1; seed <= 60 && seen.size < 3; seed++) {
      const { game } = makeGame({ seed })
      await game.playEpisode(ARCS.rubik.eps[3], 'rubik')
      game.S.choices = null
      const c = game.buildChoices().find((x) => x.act === 'rubikHole')
      expect(c, 'окна «дырка» нет — проверка пустеет').toBeTruthy()
      const i = poolIndex(c!.text, P_HOLE)
      expect(i, `строка не из пула: «${c!.text}»`).toBeGreaterThanOrEqual(0)
      const from = game.S.msgs.length
      await game.send(c!)
      const said = saidFrom(game, from)
      const want = valueOf(HOLE_B[i])
      expect(said, `выбрано «${P_HOLE[i]}» — ответ не по строке`).toContain(textOf(want))
      seen.set(i, said)
    }
    expect([...seen.keys()].sort(), 'не все три варианта пула получили свой ответ').toEqual([0, 1, 2])
  })

  it('фото «платёжки»: окно отклика с хода события, ответ потребляет, новое фото открывает заново (#1017)', async () => {
    const { game } = makeGame()
    const button = () => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'photo') }
    const lowFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
    expect(button(), 'без фото варианта нет').toBeUndefined()
    await game.photo()
    const at = Number(game.S.mem['photo.photoAt'])
    expect(at, 'фото не штампануло ход').toBe(game.S.stats.sent)
    const first = button()
    expect(first, 'на ходу фото варианта нет').toBeDefined()
    expect((D.P_PHOTO as readonly Line[]).map((x) => valueOf(x) as string).some((p) => first!.text.includes(p) || first!.text.includes(lowFirst(p))), `не из пула P_PHOTO: «${first!.text}»`).toBe(true)
    game.S.stats.sent = at + 3
    expect(button(), 'третий ход после фото — ещё окно').toBeDefined()
    game.S.stats.sent = at + 4
    expect(button(), 'вне окна — варианта нет').toBeUndefined()
    game.S.stats.sent = at
    await game.send(button()!)
    expect(game.S.mem['photo.photoAt'], 'ответ не потребил окно').toBeUndefined()
    expect(button(), 'после ответа окно не закрылось').toBeUndefined()
    await game.photo()
    expect(button(), 'новое фото окно не открыло').toBeDefined()
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

describe('дебюты участников через rude/хор (#973)', () => {
  const has = (game: Game, act: string) => { game.S.choices = null; return game.buildChoices().some((c) => c.act === act) }
  /** Первое сообщение персонажа настоящим путём: rude-семья (Арсен), хор (Самвел, Борис) или серия («Нива», #983). */
  const debutCases: Array<[string, string, string, (g: Game) => Promise<void>]> = [
    ['arsen', 'debutArsen', 'Арсен', async (g) => {
      g.S.mem['intro.arsen'] = true
      g.S.mem[HEAT] = 1
      // содержимое пула дебюта — предмет #982: вопросы про трек молчат без события, окно проверяем с фактом
      g.S.mem['arsen.track'] = true
      await g.fire('PlayerMessage', { tone: 'rude' })
    }],
    ['samvel', 'debutSamvel', 'Самвел', async (g) => {
      g.S.mem['intro.samvel'] = true
      for (let i = 0; i < 60; i++) { await g.fire('Mentioned', {}, { target: 'samvel' }); if (g.S.msgs.some((m) => m.kind === 'text' && m.who === 'samvel')) return }
      expect.fail('Самвел не заговорил в хоре')
    }],
    ['boris', 'debutBoris', 'Борис', async (g) => {
      g.S.arcs.boris = { i: 4, last: 0 }
      for (let i = 0; i < 60; i++) { await g.fire('Mentioned', {}, { target: 'boris' }); if (g.S.msgs.some((m) => m.kind === 'text' && m.who === 'boris')) return }
      expect.fail('Борис не заговорил в хоре')
    }],
    ['niva', 'debutNiva', 'Нива', async (g) => { await g.playEpisode(ARCS.niva.eps[4], 'niva') }],
  ]

  it.each(debutCases)('первое сообщение %s: окно на дебюте, чужой ход закрыт, ответ потребляет, повтор не открывает', async (who, act, name, debut) => {
    const { game } = makeGame()
    expect(has(game, act), `${name}: до дебюта окна нет`).toBe(false)
    await debut(game)
    expect(has(game, act), `${name}: окно на ходу первого сообщения`).toBe(true)
    game.S.stats.sent += 4
    expect(has(game, act), `${name}: окно чужого хода (>3)`).toBe(false)
    game.S.stats.sent -= 4
    expect(has(game, act), `${name}: свежесть вернулась`).toBe(true)
    await game.fire('PlayerSays', { intent: act })
    expect(has(game, act), `${name}: после ответа окно закрыто`).toBe(false)
    // повторное сообщение персонажа окно не открывает
    await game.say([{ w: who, t: `${name}: второе сообщение` }])
    expect(has(game, act), `${name}: повторное сообщение окна не открыло`).toBe(false)
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

describe('первое сообщение заказчика Гранта (#983)', () => {
  const has = (game: Game) => { game.S.choices = null; return game.buildChoices().some((c) => c.act === 'grantTile') }
  const lineOf = (e: Parameters<typeof valueOf>[0]): string => {
    const v = valueOf(e)
    if (typeof v === 'string') return v
    if (v && typeof v === 'object' && 't' in v && typeof v.t === 'string') return v.t
    return ''
  }

  it('окно на «плитка — орудие», не на другом сообщении Гранта; чужой ход закрывает, ответ потребляет', async () => {
    const { game } = makeGame()
    expect(has(game), 'до реплики кнопки нет').toBe(false)
    await game.playEpisode(ARCS.grant.eps[1], 'grant')
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.who === 'grant'), 'Грант написал — проверка пустеет').toBe(true)
    expect(has(game), 'баня — не эта реплика, окна нет').toBe(false)
    expect(game.S.mem[grantTileAt]).toBeUndefined()

    await game.playEpisode(ARCS.tile.eps[2], 'tile')
    const at = Number(game.S.mem[grantTileAt])
    expect(at, 'реплика не штампанула ход').toBe(game.S.stats.sent)
    expect(has(game), 'ход дебюта — кнопка есть').toBe(true)
    const text = game.buildChoices().find((c) => c.act === 'grantTile')!.text.toLowerCase()
    expect(P_GRANT_TILE.map(lineOf).some((t) => text.includes(t.slice(0, 12).toLowerCase())), text).toBe(true)
    game.S.stats.sent = at + 3
    expect(has(game), 'третий ход после реплики — ещё окно').toBe(true)
    game.S.stats.sent = at + 4
    expect(has(game), 'чужой ход за окном — кнопки нет').toBe(false)
    game.S.stats.sent = at
    const from = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'grantTile' })
    const said = game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.who === 'grant' ? [m.text] : []))
    expect(said.some((t) => GRANT_TILE_B.map(lineOf).includes(t)), `ответ не из пула: ${said.join(' | ')}`).toBe(true)
    expect(has(game), 'после ответа окно закрыто').toBe(false)
  })
})

describe('пулы Арсена держат только утверждённое (#982)', () => {
  const frame = (game: Game) => { game.S.choices = null; return game.buildChoices() }
  const has = (game: Game, act: string) => frame(game).some((c) => c.act === act)

  it('юристский дебют не открывает вопросы про трек, крик и бит: пул ждёт своё событие', async () => {
    const { game } = makeGame()
    game.S.mem[court] = 1
    // законный путь дебюта: Арсен-юрист, трек/крик/бит в нём не звучат
    await game.fire('PlayerMessage', { tone: 'threat' })
    expect(game.S.mem[debutWho], 'дебют Арсена не состоялся — проверка пустеет').toBe('arsen')
    expect(has(game, 'debutArsen'), 'вопросы про трек раньше трека').toBe(false)
    // событие случилось (крик записан, трек собран) — вопросы появляются, и они из пула дебюта
    game.S.mem[arsenTrack] = true
    const btn = frame(game).find((c) => c.act === 'debutArsen')
    expect(btn, 'после события кнопки нет').toBeTruthy()
    expect(P_DEBUT_ARSEN.map(valueOf), 'кнопка не из пула дебюта').toContain(btn!.text)
  })

  it('источник: строка rude-семьи о «Плиточнике» сама ставит факт', async () => {
    const { game } = makeGame()
    game.S.mem['intro.arsen'] = true
    let heard = false
    for (let i = 0; i < 20 && !heard; i++) {
      game.S.day += 5 // перерыв семьи — 4 дня
      game.S.mem[HEAT] = 1
      await game.fire('PlayerMessage', { tone: 'rude' })
      heard = game.S.msgs.some((m) => m.kind === 'text' && m.text.includes('Плиточник'))
    }
    expect(heard, 'строка трека не прозвучала — проверка пустеет').toBe(true)
    expect(game.S.mem[arsenTrack], 'факт ставит прозвучавшая строка').toBe(true)
  })

  it('выбранная реплика «до Страсбурга» ставит факт оглашения', async () => {
    const { game } = makeGame()
    game.S.mem['intro.arsen'] = true
    game.S.mem[court] = 2
    let plan: Choice | undefined
    for (let i = 0; i < 200 && !plan; i++) plan = frame(game).find((c) => c.text === STRASBOURG_THREAT)
    expect(plan, 'строка «до Страсбурга» не предложена — проверка пустеет').toBeDefined()
    await game.send(plan!)
    expect(game.S.mem[saidStrasburg], 'выбранная реплика не поставила факт').toBe(true)
  })

  it('отклик Арсена про Страсбург — только после оглашения', async () => {
    const { game } = makeGame()
    game.S.mem['intro.arsen'] = true
    game.S.mem[lawyerAt] = game.S.stats.sent
    const offered = () => { const c = frame(game).find((x) => x.act === 'lawyerAsk'); return c ? [c.text] : [] }
    const before = new Set<string>()
    for (let i = 0; i < 40; i++) for (const t of offered()) before.add(t)
    expect(before.size, 'окно Арсена ничего не предложило — проверка пустеет').toBeGreaterThan(0)
    expect([...before], 'Страсбург без оглашения игроком').not.toContain('Арсен, а Страсбург — это долго ждать?')
    game.S.mem[saidStrasburg] = true
    let saw = false
    for (let i = 0; i < 80 && !saw; i++) saw = offered().includes('Арсен, а Страсбург — это долго ждать?')
    expect(saw, 'после оглашения Страсбург не предлагается').toBe(true)
  })
})

describe('окно конца квеста «мама на рынке» (#1030)', () => {
  const text = (e: unknown): string => { const v = valueOf(e as never); return typeof v === 'string' ? v : (v as { t: string }).t }
  const low = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

  it('событие штампует ход, кнопка в блоке, окно три хода, ответ потребляет', async () => {
    const { game } = makeGame()
    const button = () => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'mamaMarket') }
    expect(button(), 'до квеста кнопки нет').toBeUndefined()
    await game.enterNode('q_mama', 'drive')
    expect(game.S.msgs.some((m) => m.kind === 'sys' && m.text.includes('четыре часа')), 'событие не прозвучало — проверка пустеет').toBe(true)
    const at = Number(game.S.mem[mamaMarketAt])
    expect(at, 'узел квеста не штампанул ход события').toBe(game.S.stats.sent)
    expect(button(), 'на ходу события кнопки нет').toBeTruthy()
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(); if (b) texts.add(b.text) }
    const pool = P_MAMA_MARKET.map(text)
    expect(texts.size, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(pool.some((p) => t.includes(p) || t.includes(low(p))), `кнопка не из пула: ${t}`).toBe(true)
    game.S.stats.sent = at + 3
    expect(button(), 'третий ход после события — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'mamaMarket' })
    const said = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    const answers = MAMA_MARKET_B.map(text)
    expect(said.some((t) => answers.some((p) => t.includes(p))), `ответ не из пула события: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[mamaMarketAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(), 'после ответа окно закрыто').toBeUndefined()
  })
})
