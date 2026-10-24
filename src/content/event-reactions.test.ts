// Реакции на заметные системные события (#927): вариант в блоке в окне события (ход и 1–3 после), вне окна — нет.
import { describe, it, expect, vi } from 'vitest'
import { makeGame, setMoney, cards, respondCtx } from '../test/helpers'
import type { Game } from '../engine/game'
import { NOTIF, IDLE } from './life'
import { D } from './excuses'
import { sold } from './credit'
import { P_RAM_PHOTO, P_BORIS_SALE, P_VACANCY, P_AVITO_REVIEW, P_RUBIK_ASK, P_KETTLE, P_COLLECTORS_ASK, P_LAWYER, P_DEBUT_ARSEN, P_DEBUT_SAMVEL, P_DEBUT_NIVA, P_INTERN, P_HOLE, STRASBOURG_THREAT, P_GRANT_TILE, P_DEBUT_GRANT, P_MAMA_MARKET, P_TILE_AD, P_TAMADA_DONE, P_MAMA_VOICE, P_SAMVEL_DIVORCE, P_GRANT_HOUSE, P_TILE_SLIP, P_TILE_COURT, P_TILE_LAWYER, P_TILE_MONUMENT, P_NIVA_BACK, P_SOLD, P_BORIS_MEMORY, P_SERYOGA, P_GRANT_BATH, P_OFFENDED_ASK } from './rules/player-choice-pools'
import { BORIS_MEMORY_B, BORIS_SALE, RUBIK_ASK, KETTLE, COUNTERSUIT_B, GRANT_TILE_B, DEBUT_GRANT_B, GRANT_HOUSE_B, INTERN_B, HOLE_B, AVITO_REVIEW, MAMA_MARKET_B, TILE_AD_B, TAMADA_DONE_B, MAMA_VOICE_B, SAMVEL_DIVORCE_B, TILE_SLIP_B, TILE_COURT_B, TILE_LAWYER_B, TILE_MONUMENT_B, NIVA_BACK_B, SOLD_B, VACANCY, VACANCY_START_B, VACANCY_SOON_B, SERYOGA_B, GRANT_BATH_B, OFFENDED_ASK_B } from './world'
import { TOPICS } from './topics'
import { ARCS } from './arcs'
import { turnRules } from './rules/turn'
import { FINALES } from './finales'
import { COURT_LAWYER_AGAIN } from './quests'
import { RUDE_CALLS_VOICE, MAMA_VOICE_CRY } from './rude'
import { count, collectorsRecruited, court, crewPaid, crewPaidAt, HEAT, internAt, lawyerAt, debutWho, debutAt, arsenTrack, saidStrasburg, saidGrantEnvelope, grantTileAt, grantHouseAt, mamaMarketAt, tileAdAt, tamadaDoneAt, borisAskAt, mamaVoiceAt, mamaCalls, samvelDivorceAt, tileSlipAt, tileCourtAt, tileLawyerAt, tileMonumentAt, legendOf, nivaAway, nivaBack, nivaBackAt, saleAt, saleWhat, alikDead, paydayScene, seryogaAskAt, grantBathAt, offendedAskAt } from './memkeys'
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

  it('пул окна события не повторяет строку: четыре сборки окна — каждая строка один раз (#1283)', async () => {
    // партия 305117: событие фото-барана 31 октября, две строки пула показаны 1–2 ноября, и та же
    // строка вернулась 3 ноября — сырой `draw` рефиллил исчерпанную за окно колоду (строки 276 → 285)
    const { game } = makeGame()
    game.S.stats.sent = 24
    await game.send('привет')
    const at = Number(game.S.mem['ram.photoAt'])
    expect(at, 'фото-баран не сработал — проверка пустеет').toBe(game.S.stats.sent)
    const pool = P_RAM_PHOTO.map(valueOf)
    const offered: string[] = []
    // окно — ход события и три после: строки не выбираем, смотрим, что предлагает блок
    for (let turn = 0; turn <= 3; turn++) {
      game.S.stats.sent = at + turn
      game.S.choices = null
      const c = game.buildChoices().find((x) => x.act === 'ramPhoto')
      if (c) offered.push(c.text)
    }
    expect(offered, `повтор строки пула внутри окна: ${offered.join(' → ')}`).toEqual([...new Set(offered)])
    // каждая открытая строка окна показана один раз; исчерпанный в окне пул молчит до его конца
    expect(offered.length, 'пул показан не целиком — проверка пустеет').toBe(pool.length)
    expect([...offered].sort(), offered.join(' → ')).toEqual([...pool].sort())
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

  it('фото-баран: пул различает тебя и барана (#1113)', () => {
    expect(P_RAM_PHOTO.map(valueOf)).toEqual([
      'Алик, это ты на фото? Или баран?',
      'Барана — вместо перевода? Я оценил. Но лучше деньгами.',
    ])
  })

  it('пулы реакций и ответов не пусты (#927)', () => {
    expect(P_RAM_PHOTO.length).toBeGreaterThan(0)
    expect(P_BORIS_SALE.length).toBeGreaterThan(0)
    expect(P_VACANCY.length).toBeGreaterThan(0)
    expect(P_AVITO_REVIEW.length).toBeGreaterThan(0)
  })

  it('пул продажи Бориса не утверждает долг игрока от первого лица (#1110)', () => {
    const lines = P_BORIS_SALE.map(valueOf)
    expect(lines.some((t) => /я в долге/i.test(t)), 'строка делает игрока должником без опоры в фактах партии').toBe(false)
    expect(lines.some((t) => /ты в долге|твоего долга/i.test(t) && /зачт/i.test(t)), 'вариант про зачёт из долга Алика потерян').toBe(true)
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
    // пул реакции — четыре строки, три из них гейтнуты на фото барана: без него открыта одна строка,
    // и окно (#1287) молчит уже со второго хода. Проверка про длину окна, а не про гейты пула
    game.S.mem['intro.baran'] = true
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
    // первое письмо Нуне — вторая серия её линии (реальный путь: серия 0 ставит знакомство/legacy, серия 1 — дебют)
    ['nune', 'debutNune', 'Нуне', async (g) => { await g.playArc('nune'); await g.playArc('nune') }],
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

  it('окно дебюта Нивы не повторяет строку: показ по разу, дальше пул молчит (#1287)', async () => {
    // партия 311117: «Нива, передай Алику про бардачок» предлагалась трижды за окно дебюта
    // 26–30.12.2026 — двухстрочный пул исчерпывался, и сырой draw возвращал показанную строку дословно
    const { game } = makeGame()
    game.S.mem['heard.money_niva'] = true // вторая строка (бардачок) введена местом денег — открыты обе
    await game.playEpisode(ARCS.niva.eps[4], 'niva')
    const at = Number(game.S.mem[debutAt])
    expect(Number.isFinite(at), 'дебют не штампанул ход — проверка пустеет').toBe(true)
    const pool = game.open(P_DEBUT_NIVA)
    expect(pool.length, 'у дебюта Нивы меньше двух строк — проверка пустеет').toBe(2)
    const offered: string[] = []
    for (let turn = 0; turn <= 3; turn++) {
      game.S.stats.sent = at + turn
      game.S.choices = null
      const b = game.buildChoices().find((c) => c.act === 'debutNiva')
      if (b) offered.push(b.text)
    }
    expect(offered, `повтор строки пула внутри окна: ${offered.join(' → ')}`).toEqual([...new Set(offered)])
    expect([...offered].sort(), 'окно показало не весь пул').toEqual([...pool].sort())
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

describe('дебют Гранта хором легенды (#1179)', () => {
  const has = (game: Game, act: string) => { game.S.choices = null; return game.buildChoices().some((c) => c.act === act) }
  const lineOf = (e: Parameters<typeof valueOf>[0]): string => {
    const v = valueOf(e)
    if (typeof v === 'string') return v
    if (v && typeof v === 'object' && 't' in v && typeof v.t === 'string') return v.t
    return ''
  }
  /** Первое личное сообщение — хор при легенде beton_law. Знакомство уже есть (серия бумаг), писал он ещё нет. */
  const chorusDebut = async (game: Game) => {
    game.S.mem['intro.grant'] = true
    game.setLegend('beton_law')
    for (let i = 0; i < 80; i++) {
      await game.fire('Mentioned', {}, { target: 'grant' })
      if (game.S.msgs.some((m) => m.kind === 'text' && m.who === 'grant')) return
    }
    expect.fail('Грант не заговорил в хоре')
  }

  it.each([1, 2, 3])('сид %s: хор про конверт открывает пул, ответ гасит окно, повтор не открывает', async (seed) => {
    const { game } = makeGame({ seed })
    expect(has(game, 'debutGrant'), 'до дебюта кнопки нет').toBe(false)
    await chorusDebut(game)
    expect(game.S.mem[saidGrantEnvelope], 'хор не поставил факт конверта — проверка пустеет').toBe(true)
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.who === 'grant' && /конверт стал частью/.test(m.text)), 'первая реплика не про конверт').toBe(true)
    const btn = game.buildChoices().find((c) => c.act === 'debutGrant')
    expect(btn, 'окна дебюта нет').toBeTruthy()
    expect(P_DEBUT_GRANT.map(lineOf), 'кнопка не из пула').toContain(btn!.text)
    const from = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'debutGrant' })
    const said = game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.who === 'grant' ? [m.text] : []))
    expect(said.some((t) => DEBUT_GRANT_B.map(lineOf).includes(t)), `ответ не из пула: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[debutAt], 'ответ не потребил окно').toBeUndefined()
    expect(has(game, 'debutGrant'), 'после ответа окно живо').toBe(false)
    await game.say([{ w: 'grant', t: 'Молодой человек, это опять я.' }])
    expect(has(game, 'debutGrant'), 'повторное сообщение открыло окно').toBe(false)
  })

  it('первая реплика — «плитка — орудие»: виден только GrantTile, общий слот погашен', async () => {
    const { game } = makeGame()
    await game.playEpisode(ARCS.tile.eps[2], 'tile')
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.who === 'grant'), 'Грант не написал — проверка пустеет').toBe(true)
    expect(has(game, 'grantTile'), 'окна плитки нет').toBe(true)
    expect(has(game, 'debutGrant'), 'общий дебют задвоился с плиткой').toBe(false)
    expect(game.S.mem[debutAt], 'общий слот не погашен').toBeUndefined()
    expect(game.S.mem[grantTileAt], 'штамп плитки пропал').toBe(game.S.stats.sent)
  })
})

describe('пулы Арсена держат только утверждённое (#982)', () => {
  const frame = (game: Game) => { game.S.choices = null; return game.buildChoices() }
  const TRACK = [
    'Арсен, а трек «Плиточник» где послушать?',
    'Арсен, трек из моего крика? Я как соавтор — требую долю.',
    'Арсен, а бит из чего собран? Из крика?',
  ]

  it('юристский дебют не открывает вопросы про трек, крик и бит: пул ждёт своё событие', async () => {
    const { game } = makeGame()
    game.S.mem[court] = 1
    // законный путь дебюта: Арсен-юрист, трек/крик/бит в нём не звучат
    await game.fire('PlayerMessage', { tone: 'threat' })
    expect(game.S.mem[debutWho], 'дебют Арсена не состоялся — проверка пустеет').toBe('arsen')
    // окно не пустеет: до трека в нём строка-ёмкость (#753/#1309), и она не про трек
    const before = frame(game).find((c) => c.act === 'debutArsen')
    expect(before, 'окно дебюта до трека пустое').toBeTruthy()
    expect(TRACK, 'вопросы про трек раньше трека').not.toContain(before!.text)
    // событие случилось (крик записан, трек собран) — вопросы появляются, и они из пула дебюта
    game.S.mem[arsenTrack] = true
    const btn = frame(game).find((c) => c.act === 'debutArsen')
    expect(btn, 'после события кнопки нет').toBeTruthy()
    expect(TRACK, 'после события нет трек-вопроса').toContain(btn!.text)
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
    // пул окна теперь предлагает строку один раз за окно (#1287): выборку берём по ходам окна,
    // а не пересборками одного хода — пересборка в том же ходу обязана вернуть ту же строку (#826)
    const overWindow = (prepare: (g: Game) => void) => {
      const { game } = makeGame()
      game.S.mem['intro.arsen'] = true
      game.S.mem[lawyerAt] = game.S.stats.sent
      prepare(game)
      const at = Number(game.S.mem[lawyerAt])
      const seen = new Set<string>()
      for (let turn = 0; turn <= 3; turn++) {
        game.S.stats.sent = at + turn
        game.S.choices = null
        const c = game.buildChoices().find((x) => x.act === 'lawyerAsk')
        if (c) seen.add(c.text)
      }
      return seen
    }
    const before = overWindow(() => {})
    expect(before.size, 'окно Арсена ничего не предложило — проверка пустеет').toBeGreaterThan(0)
    expect([...before], 'Страсбург без оглашения игроком').not.toContain('Арсен, а Страсбург — это долго ждать?')
    const after = overWindow((g) => { g.S.mem[saidStrasburg] = true })
    expect([...after], 'после оглашения Страсбург не предлагается').toContain('Арсен, а Страсбург — это долго ждать?')
  })
})

describe('дебют Арсена: окно не пустеет вне трека (#1309)', () => {
  const SELF = 'Дядя сказал ответить вам «сам такой». Отвечаю: сам такой. Это не я, это дядя.'
  const CAP = 'Арсен, а вы на чьей стороне — Алика или правды?'
  const CAP_REPLY = 'На стороне Алика. Он попросил — я ответил. Кто прав, разберёмся по ходу.'
  const TRACK = [
    'Арсен, а трек «Плиточник» где послушать?',
    'Арсен, трек из моего крика? Я как соавтор — требую долю.',
    'Арсен, а бит из чего собран? Из крика?',
  ]
  const frame = (game: Game) => { game.S.choices = null; return game.buildChoices() }
  const debut = async (game: Game) => {
    // первое сообщение семьи, не трек-строка: факт arsenTrack не ставится
    await game.say([{ w: 'arsen', t: SELF }])
    expect(game.S.mem[debutWho], 'дебют Арсена не состоялся — проверка пустеет').toBe('arsen')
    expect(game.S.mem[arsenTrack], 'трек прозвучал в дебюте — проверка не про этот путь').toBeFalsy()
  }

  it('после первого сообщения семьи в блоке есть вариант об Арсене — про новое лицо, не про трек', async () => {
    const { game } = makeGame()
    await debut(game)
    const btn = frame(game).find((c) => c.act === 'debutArsen')
    expect(btn, 'окно дебюта пустое — варианта об Арсене нет').toBeTruthy()
    expect(btn!.text, 'строка-ёмкость не из пула дебюта').toBe(CAP)
    expect(TRACK, 'вопрос про трек раньше трека').not.toContain(btn!.text)
  })

  it('строка-ёмкость получает ответ Арсена, а не пустую колоду', async () => {
    const { game } = makeGame()
    await debut(game)
    const btn = frame(game).find((c) => c.act === 'debutArsen')!
    const from = game.S.msgs.length
    await game.send(btn)
    const said = game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.who === 'arsen' ? [m.text] : []))
    expect(said, 'ответ на строку-ёмкость').toContain(CAP_REPLY)
    expect(frame(game).find((c) => c.act === 'debutArsen'), 'ответ не закрыл окно').toBeUndefined()
  })

  it('после трек-строки окно отдаёт трек-вопросы, а строка-ёмкость молчит', async () => {
    const { game } = makeGame()
    await debut(game)
    game.S.mem[arsenTrack] = true
    // окно дебюта — ход и три после: собираем предложения по ходам, как у Самвела (#1287)
    const at = game.S.stats.sent
    const seen = new Set<string>()
    for (let turn = 0; turn <= 3; turn++) {
      game.S.stats.sent = at + turn
      game.S.choices = null
      const b = game.buildChoices().find((c) => c.act === 'debutArsen')
      if (b) seen.add(b.text)
    }
    expect(seen.size, 'окно с треком ничего не предложило — проверка пустеет').toBeGreaterThan(0)
    expect([...seen], 'вопрос про трек не открылся').toEqual(expect.arrayContaining(TRACK))
    expect([...seen], 'строка-ёмкость вернулась при треке').not.toContain(CAP)
  })
})

describe('дебют Самвела не предлагает свадьбу, пока её не ввела серия (#1166)', () => {
  const SIDE = 'Самвел, а вы-то тут с какой стороны?'
  const WEDDING = ['Самвел, а сколько у вас всего свадеб?', 'Самвел, а на этой свадьбе хозяин — вы или Алик?']
  const INTRO = 'Мальчик, я Самвел. На моего племянника кричу только я. Встань в очередь, она с 1987 года.'
  const frame = (game: Game) => { game.S.choices = null; return game.buildChoices() }
  const debutTexts = (game: Game) => {
    // пул окна предлагает строку один раз за окно (#1287): варианты собираем по ходам окна,
    // пересборки одного хода дают ту же строку — кнопка не меняется под пальцем (#826)
    const at = game.S.stats.sent
    const seen = new Set<string>()
    for (let turn = 0; turn <= 3; turn++) {
      game.S.stats.sent = at + turn
      const b = frame(game).find((c) => c.act === 'debutSamvel')
      if (b) seen.add(b.text)
    }
    game.S.stats.sent = at
    return [...seen]
  }
  const rudeDebut = async (game: Game) => {
    game.S.mem['intro.samvel'] = true
    game.S.mem[HEAT] = 1
    const n = game.S.msgs.length
    const r = await game.fire('PlayerMessage', { tone: 'rude' })
    expect(r?.name, 'rude-дебют Самвела не сработал — проверка пустеет').toBe('Rude_Family_samvel')
    const said = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.who === 'samvel' ? [m.text] : []))
    expect(said, 'дебют пришёл не строкой знакомства — проверка не про тот путь').toContain(INTRO)
    expect(game.S.mem[debutWho], 'дебют не штампанулся').toBe('samvel')
  }

  it('rude-дебют без серии: свадебные варианты молчат, окно не пустеет', async () => {
    const { game } = makeGame()
    await rudeDebut(game)
    expect(game.S.arcs.samvel, 'серия сама началась — проверка не про тот путь').toBeUndefined()
    expect(game.open(P_DEBUT_SAMVEL).map(valueOf), 'окно не пустеет').toContain(SIDE)
    const seen = debutTexts(game)
    expect(seen.length, 'окно дебюта ничего не предложило — проверка пустеет').toBeGreaterThan(0)
    expect(seen.some((t) => WEDDING.some((w) => t.includes(w.slice(0, 24)))), 'свадебные варианты до введения свадьбы').toBe(false)
    expect(seen.some((t) => t.includes('с какой стороны')), 'кнопка дебюта не из безгейтной строки').toBe(true)
  })

  it('после первой серии арки оба свадебных варианта доступны', async () => {
    const { game } = makeGame()
    await game.playArc('samvel')
    expect(game.S.msgs.some((m) => m.kind === 'text' && /У дяди Самвела свадьба/.test(m.text)), 'серия не назвала свадьбу — проверка пустеет').toBe(true)
    expect(game.S.arcs.samvel?.i, 'серия не засчитана').toBeGreaterThanOrEqual(1)
    await rudeDebut(game)
    const seen = debutTexts(game)
    expect(seen.length, 'после серии окно пусто — проверка пустеет').toBeGreaterThan(0)
    for (const w of WEDDING) expect(seen.some((t) => t.includes(w.slice(0, 24))), `после серии нет «${w.slice(0, 24)}»`).toBe(true)
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

describe('окно кражи плиточной рекламы (#1216)', () => {
  const text = (e: unknown): string => { const v = valueOf(e as never); return typeof v === 'string' ? v : (v as { t: string }).t }
  const low = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
  const button = (game: Game) => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'tileAd') }

  it('без рекламы (отказ «Лучше без рекламы») реакции нет — негативный контроль', async () => {
    const { game } = makeGame()
    expect(button(game), 'до квеста кнопки нет').toBeUndefined()
    await game.enterNode('q_photo', 'no')
    expect(game.S.mem[tileAdAt], 'отказ штампанул событие — окно открылось бы зря').toBeUndefined()
    expect(button(game), 'после отказа кнопка про рекламу').toBeUndefined()
  })

  it('финал send штампует ход, кнопка в блоке, окно три хода, ответ потребляет', async () => {
    const { game } = makeGame()
    expect(button(game), 'до события кнопки нет').toBeUndefined()
    await game.enterNode('q_photo', 'send') // настоящий путь: узел финала сцены
    expect(game.S.msgs.some((m) => m.kind === 'sys' && m.text.includes('Сам клал')), 'событие не прозвучало — проверка пустеет').toBe(true)
    const at = Number(game.S.mem[tileAdAt])
    expect(at, 'узел квеста не штампанул ход события').toBe(game.S.stats.sent)
    expect(button(game), 'на ходу события кнопки нет').toBeTruthy()
    // в ближайшем блоке вариант — из пула реакции на кражу, а не общая кнопка
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(game); if (b) texts.add(b.text) }
    const pool = P_TILE_AD.map(text)
    expect(texts.size, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(pool.some((p) => t.includes(p) || t.includes(low(p))), `кнопка не из пула: ${t}`).toBe(true)
    game.S.stats.sent = at + 3
    expect(button(game), 'третий ход после события — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(game), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'tileAd' })
    const said = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    const answers = TILE_AD_B.map(text)
    expect(said.some((t) => answers.some((p) => t.includes(p))), `ответ не из пула события: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[tileAdAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(game), 'после ответа окно закрыто').toBeUndefined()
  })
})

describe('окно финала квеста-тамады (#1222)', () => {
  const text = (e: unknown): string => { const v = valueOf(e as never); return typeof v === 'string' ? v : (v as { t: string }).t }
  const low = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
  const button = (game: Game) => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'tamadaDone') }

  it('до взятия микрофона, после «Я не умею тосты» и после «Сначала деньги» реакции нет — негативный контроль', async () => {
    for (const path of ['cant', 'no'] as const) {
      const { game } = makeGame()
      expect(button(game), `до квеста (${path}) кнопки нет`).toBeUndefined()
      await game.enterNode('q_tamada', path) // настоящие ветки отказа: застолья не было
      expect(game.S.mem[tamadaDoneAt], `${path}: отказ штампанул событие — окно открылось бы зря`).toBeUndefined()
      expect(button(game), `${path}: после отказа кнопка про застолье`).toBeUndefined()
    }
  })

  it('финал yes штампует ход, кнопка в блоке, окно три хода, ответ потребляет', async () => {
    const { game } = makeGame()
    expect(button(game), 'до события кнопки нет').toBeUndefined()
    await game.enterNode('q_tamada', 'yes') // настоящий путь: узел финала сцены
    expect(game.S.msgs.some((m) => m.kind === 'sys' && m.text.includes('Сервиз тёти Гоар')), 'событие не прозвучало — проверка пустеет').toBe(true)
    const at = Number(game.S.mem[tamadaDoneAt])
    expect(at, 'узел квеста не штампанул ход события').toBe(game.S.stats.sent)
    expect(button(game), 'на ходу события кнопки нет').toBeTruthy()
    // в ближайшем блоке вариант — из пула реакции на застолье, а не общая кнопка
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(game); if (b) texts.add(b.text) }
    const pool = P_TAMADA_DONE.map(text)
    expect(texts.size, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(pool.some((p) => t.includes(p) || t.includes(low(p))), `кнопка не из пула: ${t}`).toBe(true)
    game.S.stats.sent = at + 3
    expect(button(game), 'третий ход после события — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(game), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'tamadaDone' })
    const said = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    const answers = TAMADA_DONE_B.map(text)
    expect(said.some((t) => answers.some((p) => t.includes(p))), `ответ не из пула события: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[tamadaDoneAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(game), 'после ответа окно закрыто').toBeUndefined()
  })
})

describe('окно развода дяди Самвела на свадьбе (#1037)', () => {
  const text = (e: unknown): string => { const v = valueOf(e as never); return typeof v === 'string' ? v : (v as { t: string }).t }
  const low = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

  it('серия штампует ход развода, кнопка в блоке, окно три хода, ответ потребляет', async () => {
    const { game } = makeGame()
    const button = () => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'samvelDivorce') }
    expect(button(), 'до серии кнопки нет').toBeUndefined()
    // настоящий путь: серии арки до строки развода (eps[6])
    for (let i = 0; i < ARCS.samvel.eps.length && !game.S.mem[samvelDivorceAt]; i++) await game.playArc('samvel')
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.text.includes('развёлся')), 'серия не прозвучала — проверка пустеет').toBe(true)
    const at = Number(game.S.mem[samvelDivorceAt])
    expect(Number.isFinite(at), 'серия не штампанула ход события').toBe(true)
    expect(at, 'штамп не на ходу строки').toBe(game.S.stats.sent)
    expect(button(), 'на ходу события кнопки нет').toBeTruthy()
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(); if (b) texts.add(b.text) }
    const pool = P_SAMVEL_DIVORCE.map(text)
    expect(texts.size, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(pool.some((p) => t.includes(p) || t.includes(low(p))), `кнопка не из пула: ${t}`).toBe(true)
    game.S.stats.sent = at + 3
    expect(button(), 'третий ход после события — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'samvelDivorce' })
    const said = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    const answers = SAMVEL_DIVORCE_B.map(text)
    expect(said.some((t) => answers.some((p) => t.includes(p))), `ответ не из пула события: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[samvelDivorceAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(), 'после ответа окно закрыто').toBeUndefined()
  })
})

describe('окно второго дебюта Гранта — дом «с кладом» (#1041)', () => {
  const text = (e: unknown): string => { const v = valueOf(e as never); return typeof v === 'string' ? v : (v as { t: string }).t }
  const low = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

  it('реплика Гранта штампует ход, кнопка в блоке, окно три хода, ответ потребляет', async () => {
    const { game } = makeGame()
    const button = () => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'grantHouse') }
    expect(button(), 'до серии кнопки нет').toBeUndefined()
    await game.playEpisode(ARCS.beton.eps[4], 'beton')
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.who === 'grant'), 'Грант не написал — проверка пустеет').toBe(true)
    const at = Number(game.S.mem[grantHouseAt])
    expect(at, 'реплика не штампанула ход события').toBe(game.S.stats.sent)
    expect(button(), 'на ходу события кнопки нет').toBeTruthy()
    const texts = new Set<string>()
    for (let i = 0; i < 40; i++) { const b = button(); if (b) texts.add(b.text) }
    const pool = P_GRANT_HOUSE.map(text)
    expect(texts.size, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(pool.some((p) => t.includes(p) || t.includes(low(p))), `кнопка не из пула: ${t}`).toBe(true)
    game.S.stats.sent = at + 3
    expect(button(), 'третий ход после события — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'grantHouse' })
    const said = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.who === 'grant' ? [m.text] : []))
    expect(said.some((t) => GRANT_HOUSE_B.map(text).some((p) => t.includes(p))), `ответ не из пула события: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[grantHouseAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(), 'после ответа окно закрыто').toBeUndefined()
  })
})

describe('окно предложения стажировки (#1083)', () => {
  it('предложение штампует ход, кнопка в блоке события при конкурентах, окно три хода', async () => {
    // состояние хода из плейтеста 86 (seed 215117): за слоты блока с предложением конкурировали
    // звонок с объекта (специфичность 7) и вопрос про сериал (4) — кнопка уходила в следующий блок.
    // Фикс — bonus 5 у оффера (специфичность 6): кнопка берёт второй слот уже на ходу предложения;
    // НК — вернуть bonus 3 — слот у кнопки снова отбирает случайный из группы 4, тест краснеет
    for (let seed = 1; seed <= 20; seed++) {
      const { game } = makeGame({ seed })
      game.S.mem[count.rude] = 6
      game.S.mem[collectorsRecruited] = true
      game.S.mem[crewPaid] = true
      game.S.mem[crewPaidAt] = game.S.stats.sent
      game.S.arcs.collectors = { i: ARCS.collectors.eps.length - 1, last: game.S.day }
      const button = () => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'internOffer') }
      expect(button(), `seed ${seed}: до предложения кнопка есть`).toBeUndefined()
      await game.playArc('collectors')
      const at = Number(game.S.mem[internAt])
      expect(at, `seed ${seed}: предложение не штампануло ход`).toBe(game.S.stats.sent)
      expect(button(), `seed ${seed}: на ходу предложения кнопки нет в блоке`).toBeTruthy()
      game.S.stats.sent = at + 3
      expect(button(), `seed ${seed}: третий ход после предложения — ещё окно`).toBeTruthy()
      game.S.stats.sent = at + 4
      expect(button(), `seed ${seed}: вне окна — кнопки нет`).toBeUndefined()
    }
  })
})

describe('окно голосового-плача мамы (#1085)', () => {
  const text = (e: unknown): string => { const v = valueOf(e as never); return typeof v === 'string' ? v : (v as { t: string }).t }
  /** Оставить свежим только нужное голосовое: остальные строки серии уже показаны. */
  const onlyFresh = (game: Game, keep: (t: string) => boolean) => {
    for (const e of RUDE_CALLS_VOICE) {
      const [, said] = valueOf(e) as [string, string | { t: string }]
      const t = typeof said === 'string' ? said : said.t
      if (!keep(t)) game.seen.mark(t)
    }
  }

  it('голосовое-плач штампует ход, кнопка в блоке, окно три хода, ответ потребляет', async () => {
    const { game } = makeGame()
    onlyFresh(game, (t) => t === MAMA_VOICE_CRY)
    game.S.mem[HEAT] = 2
    await game.fire('PlayerMessage', { tone: 'rude' })
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.text === MAMA_VOICE_CRY), 'голосовое не прозвучало — проверка пустеет').toBe(true)
    const at = Number(game.S.mem[mamaVoiceAt])
    expect(at, 'голосовое не штампануло ход').toBe(game.S.stats.sent)
    const button = () => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'mamaVoice') }
    expect(button(), 'на ходу события кнопки нет').toBeTruthy()
    game.S.stats.sent = at + 3
    expect(button(), 'третий ход после события — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'mamaVoice' })
    const said = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    expect(said.some((t) => MAMA_VOICE_B.map(text).includes(t)), `ответ не из пула: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[mamaVoiceAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(), 'после ответа окно закрыто').toBeUndefined()
  })

  // #1091: счёт звонков в sys переменный («прошлое + 1 + rnd(4)») — строка пула его не повторяет
  it('счёт звонков называет sys, а кнопка окна числа не повторяет', async () => {
    const { game } = makeGame()
    onlyFresh(game, (t) => t === MAMA_VOICE_CRY)
    game.S.mem[HEAT] = 2
    game.S.mem[mamaCalls] = 8 // прошлое партии: серия скажет 9–12, а не 7 из транскрипта
    await game.fire('PlayerMessage', { tone: 'rude' })
    const sys = game.S.msgs.flatMap((m) => (m.kind === 'sys' && m.text.includes('Мама Алика') ? [m.text] : []))
    expect(sys, 'серия не назвала счёт — проверка пустеет').toHaveLength(1)
    const n = Number(/\d+/.exec(sys[0])![0])
    expect(n, 'счёт серии не растёт от прошлого').toBeGreaterThanOrEqual(9)
    expect(P_MAMA_VOICE.map(text).join(' '), 'строка пула называет счёт звонков').not.toMatch(/\d|семь|восем|девят|десят|одиннадцат|двенадцат/i)
    game.S.choices = null
    const buttons = game.buildChoices()
    expect(buttons.some((c) => c.act === 'mamaVoice'), 'кнопки окна нет — проверка пустеет').toBe(true)
    expect(buttons.map((c) => c.text).join(' '), 'кнопка блока называет число из одного транскрипта').not.toContain('семь')
  })

  it('чужое голосовое серии (Самвел) окна мамы не открывает', async () => {
    const { game } = makeGame()
    game.S.mem['intro.samvel'] = true
    onlyFresh(game, (t) => t.includes('Это Самвел'))
    game.S.mem[HEAT] = 2
    await game.fire('PlayerMessage', { tone: 'rude' })
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.text.includes('Это Самвел')), 'голосовое Самвела не прозвучало — проверка пустеет').toBe(true)
    expect(game.S.mem[mamaVoiceAt], 'чужое голосовое открыло окно мамы').toBeUndefined()
  })
})

describe('окно первой серии плиточной арки (#1059)', () => {
  const text = (e: unknown): string => { const v = valueOf(e as never); return typeof v === 'string' ? v : (v as { t: string }).t }
  const low = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

  it('серия штампует ход падения, кнопка в блоке, окно три хода, ответ потребляет', async () => {
    const { game } = makeGame()
    const button = () => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'tileSlip') }
    expect(button(), 'до серии кнопки нет').toBeUndefined()
    await game.playEpisode(ARCS.tile.eps[0], 'tile')
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.text.includes('поскользнулся')), 'серия не прозвучала — проверка пустеет').toBe(true)
    const at = Number(game.S.mem[tileSlipAt])
    expect(Number.isFinite(at), 'серия не штампанула ход события').toBe(true)
    expect(at, 'штамп не на ходу строки').toBe(game.S.stats.sent)
    expect(button(), 'на ходу события кнопки нет').toBeTruthy()
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(); if (b) texts.add(b.text) }
    const pool = P_TILE_SLIP.map(text)
    expect(texts.size, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(pool.some((p) => t.includes(p) || t.includes(low(p))), `кнопка не из пула: ${t}`).toBe(true)
    game.S.stats.sent = at + 3
    expect(button(), 'третий ход после серии — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'tileSlip' })
    const said = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    const answers = TILE_SLIP_B.map(text)
    expect(said.some((t) => answers.some((p) => t.includes(p))), `ответ не из пула события: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[tileSlipAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(), 'после ответа окно закрыто').toBeUndefined()
  })
})

describe('окно эпизода «я твой адвокат» плиточной арки (#1303)', () => {
  const text = (e: unknown): string => { const v = valueOf(e as never); return typeof v === 'string' ? v : (v as { t: string }).t }
  const low = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

  it('эпизод штампует ход вычета, кнопка в блоке, окно три хода, ответ потребляет', async () => {
    const { game } = makeGame()
    const button = () => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'tileLawyer') }
    expect(button(), 'до эпизода кнопки нет').toBeUndefined()
    const debt = game.S.debt
    await game.playEpisode(ARCS.tile.eps[3], 'tile')
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.text.includes('я твой адвокат')), 'эпизод не прозвучал — проверка пустеет').toBe(true)
    // событие — вычет из долга Алика, а не платёж игрока: сумма та же, что назвал эпизод
    expect(debt - game.S.debt, 'вычета не было — окно пустое').toBe(10000)
    const at = Number(game.S.mem[tileLawyerAt])
    expect(Number.isFinite(at), 'эпизод не штампанул ход события').toBe(true)
    expect(at, 'штамп не на ходу строки').toBe(game.S.stats.sent)
    expect(button(), 'на ходу события кнопки нет').toBeTruthy()
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(); if (b) texts.add(b.text) }
    const pool = P_TILE_LAWYER.map(text)
    expect(texts.size, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(pool.some((p) => t.includes(p) || t.includes(low(p))), `кнопка не из пула: ${t}`).toBe(true)
    game.S.stats.sent = at + 3
    expect(button(), 'третий ход после эпизода — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'tileLawyer' })
    const said = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    const answers = TILE_LAWYER_B.map(text)
    expect(said.some((t) => answers.some((p) => t.includes(p))), `ответ не из пула события: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[tileLawyerAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(), 'после ответа окно закрыто').toBeUndefined()
  })

  // штамп ставит строка, а не эпизод: без вычета (`ctx.debtMoved` не выставлен) строки нет — окна тоже
  it('эпизод без вычета не штампует: кнопки нет', async () => {
    const { game } = makeGame()
    game.S.mem[paydayScene] = true // долг запечатан: adjustDebt откажет — ctx.debtMoved не встанет
    await game.playEpisode(ARCS.tile.eps[3], 'tile')
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.text.includes('я твой адвокат')), 'строка прозвучала без вычета — проверка пустеет').toBe(false)
    expect(game.S.mem[tileLawyerAt], 'окно открылось без события').toBeUndefined()
    game.S.choices = null
    expect(game.buildChoices().find((c) => c.act === 'tileLawyer'), 'кнопка окна без события').toBeUndefined()
  })
})

describe('окно эпизода «заказчик подаёт в суд» плиточной арки (#1317)', () => {
  const text = (e: unknown): string => { const v = valueOf(e as never); return typeof v === 'string' ? v : (v as { t: string }).t }
  const low = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

  it('эпизод штампует ход иска, кнопка в блоке рядом с вопросом арки и денежным вопросом, окно три хода, ответ потребляет', async () => {
    const { game } = makeGame()
    // как после playArc: линия открыта, ctx несёт арку; серия ставит легенду суда — кадр тот же, что в партии
    game.S.arcs.tile = { i: 1, last: 0 }
    game.S.ctx = { arc: 'tile' }
    const button = () => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'tileCourt') }
    expect(button(), 'до эпизода кнопки нет').toBeUndefined()
    await game.playEpisode(ARCS.tile.eps[1], 'tile')
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.text.includes('Подаёт в суд')), 'эпизод не прозвучал — проверка пустеет').toBe(true)
    expect(game.S.ctx?.legend, 'легенда суда не поставлена — кадр не тот').toBe('court_tile')
    const at = Number(game.S.mem[tileCourtAt])
    expect(Number.isFinite(at), 'эпизод не штампанул ход события').toBe(true)
    expect(at, 'штамп не на ходу строки').toBe(game.S.stats.sent)
    // конкуренты этого кадра: вопрос арки (bonus 2) и денежный вопрос (bonus 3) — два слота блока.
    // При bonus 1 у окна специфичность 2: оба конкурента (4) забирают слоты, и суда в блоке нет
    const open = game.rules.collect({ event: 'BuildChoices' }, game.facts()).map((r) => r.name)
    expect(open, 'вопрос арки не открыт — проверка пустеет').toContain('Opt_Arc')
    expect(open, 'денежный вопрос не открыт — проверка пустеет').toContain('Opt_Money')
    expect(button(), 'в кадре с вопросами арки и денег варианта про суд нет').toBeTruthy()
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(); if (b) texts.add(b.text) }
    const pool = P_TILE_COURT.map(text)
    expect(texts.size, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(pool.some((p) => t.includes(p) || t.includes(low(p))), `кнопка не из пула: ${t}`).toBe(true)
    game.S.stats.sent = at + 3
    expect(button(), 'третий ход после эпизода — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'tileCourt' })
    const said = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    const answers = TILE_COURT_B.map(text)
    expect(said.some((t) => answers.some((p) => t.includes(p))), `ответ не из пула события: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[tileCourtAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(), 'после ответа окно закрыто').toBeUndefined()
  })
})

describe('окно реестра памятников плиточной арки (#1317)', () => {
  const text = (e: unknown): string => { const v = valueOf(e as never); return typeof v === 'string' ? v : (v as { t: string }).t }
  const low = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

  it('эпизод штампует смену статуса плитки, кнопка в блоке рядом с вопросом арки и денежным вопросом, ответ потребляет', async () => {
    const { game } = makeGame()
    game.S.arcs.tile = { i: 4, last: 0 }
    game.S.ctx = { arc: 'tile' }
    // легенда суда жива с eps[1] (30 дней или до новой легенды): на этом ходу партии серия её возвращает,
    // а с ней открыт денежный вопрос — тот же кадр, что в игре
    game.S.mem[legendOf('tile')] = 'court_tile'
    const button = () => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'tileMonument') }
    expect(button(), 'до эпизода кнопки нет').toBeUndefined()
    await game.playEpisode(ARCS.tile.eps[4], 'tile')
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.text.includes('реестр памятников')), 'эпизод не прозвучал — проверка пустеет').toBe(true)
    const at = Number(game.S.mem[tileMonumentAt])
    expect(Number.isFinite(at), 'эпизод не штампанул ход события').toBe(true)
    expect(at, 'штамп не на ходу строки').toBe(game.S.stats.sent)
    // конкуренты кадра: вопрос арки (4) и денежный вопрос (4). Их собственный текст — лотерея (месту денег
    // нужна легенда с местом, вопросу арки — незаезженная формулировка), поэтому «кнопка в блоке» само по
    // себе зеленело бы и при bonus 1; гарантию даёт первый слот кадра, а его держит специфичность события
    const open = game.rules.collect({ event: 'BuildChoices' }, game.facts()).map((r) => r.name)
    expect(open[0], 'реакция на событие обязана стоять первой в кадре').toBe('Opt_TileMonument')
    expect(open, 'вопрос арки не открыт — проверка пустеет').toContain('Opt_Arc')
    expect(open, 'денежный вопрос не открыт — проверка пустеет').toContain('Opt_Money')
    expect(button(), 'в кадре с вопросами арки и денег варианта про памятник нет').toBeTruthy()
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(); if (b) texts.add(b.text) }
    const pool = P_TILE_MONUMENT.map(text)
    expect(texts.size, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(pool.some((p) => t.includes(p) || t.includes(low(p))), `кнопка не из пула: ${t}`).toBe(true)
    game.S.stats.sent = at + 3
    expect(button(), 'третий ход после эпизода — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'tileMonument' })
    const said = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    const answers = TILE_MONUMENT_B.map(text)
    expect(said.some((t) => answers.some((p) => t.includes(p))), `ответ не из пула события: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[tileMonumentAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(), 'после ответа окно закрыто').toBeUndefined()
  })
})

describe('окно возврата «Нивы» (#1306)', () => {
  const text = (e: unknown): string => { const v = valueOf(e as never); return typeof v === 'string' ? v : (v as { t: string }).t }
  const low = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
  /** Строка грубого пула темы: «найду» уместно, только пока машина в розыске. */
  const NIVA_LINE = 'Я сам найду эту «Ниву» и сдам в металлолом!!!'

  it('эпизод возврата штампует ход, кнопка в блоке, окно три хода, ответ потребляет', async () => {
    const { game } = makeGame()
    const button = () => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'nivaBack') }
    expect(button(), 'до эпизода кнопки нет').toBeUndefined()
    await game.playEpisode(ARCS.niva.eps[5], 'niva')
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.text.includes('вернулась')), 'эпизод не прозвучал — проверка пустеет').toBe(true)
    // событие — возврат машины: розыск снят, факт возврата поставлен; денег в бардачке нет
    expect(game.S.mem[nivaAway], 'событие не сняло розыск — окно пустое').toBe(false)
    expect(game.S.mem[nivaBack], 'событие не поставило факт возврата — окно пустое').toBe(true)
    const at = Number(game.S.mem[nivaBackAt])
    expect(Number.isFinite(at), 'эпизод не штампанул ход события').toBe(true)
    expect(at, 'штамп не на ходу строки').toBe(game.S.stats.sent)
    expect(button(), 'на ходу события кнопки нет').toBeTruthy()
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(); if (b) texts.add(b.text) }
    const pool = P_NIVA_BACK.map(text)
    expect(texts.size, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(pool.some((p) => t.includes(p) || t.includes(low(p))), `кнопка не из пула: ${t}`).toBe(true)
    game.S.stats.sent = at + 3
    expect(button(), 'третий ход после эпизода — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'nivaBack' })
    const said = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    const answers = NIVA_BACK_B.map(text)
    expect(said.some((t) => answers.some((p) => t.includes(p))), `ответ не из пула события: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[nivaBackAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(), 'после ответа окно закрыто').toBeUndefined()
  })

  // гейт строки грубого пула: «найду» — только пока машина в розыске; после возврата предложить её нечем
  it('«Я сам найду эту «Ниву»…» предлагается при уехавшей машине и не предлагается после возврата', async () => {
    const { game } = makeGame()
    game.S.mem['intro.niva'] = true
    game.S.mem[nivaAway] = true
    expect(game.open(TOPICS.niva.r), 'при уехавшей машине строки нет — проверка пустеет').toContain(NIVA_LINE)
    await game.playEpisode(ARCS.niva.eps[5], 'niva')
    expect(game.S.mem[nivaAway], 'событие не сняло розыск — проверка пустеет').toBe(false)
    expect(game.open(TOPICS.niva.r), '«найду» после возврата').not.toContain(NIVA_LINE)
    // машина ушла снова (следующая серия) — строка возвращается: гейт держит состояние, а не запрет навсегда
    game.S.mem[nivaAway] = true
    expect(game.open(TOPICS.niva.r), '«найду» не вернулось с новой пропажей').toContain(NIVA_LINE)
  })
})

describe('окно продажи имущества (#1084)', () => {
  const text = (e: unknown): string => { const v = valueOf(e as never); return typeof v === 'string' ? v : (v as { t: string }).t }
  const low = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
  /** Дно и карточка банка с предложением продать: отвечаем «Продать», кредит не берём. */
  const bottom = () => {
    const { game } = makeGame()
    setMoney(game, 100)
    game.chargeBill('rent') // не прошло → на дне отказ и предложение одной карточкой
    return { game, card: cards(game, 'Банк').at(-1)! }
  }
  const openCard = (game: Game) => cards(game, 'Банк').filter((c) => c.offer && !c.answered).at(-1)!
  const button = (game: Game) => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'soldQ') }

  it('продажа штампует ход и вещь, кнопка в блоке, окно три хода, ответ потребляет', async () => {
    const { game, card } = bottom()
    expect(button(game), 'до продажи кнопки нет').toBeUndefined()
    game.answerCard(card.id, 'sell')
    expect(game.S.mem[sold('microwave')], 'продажи не было — проверка пустеет').toBe(true)
    const at = Number(game.S.mem[saleAt])
    expect(Number.isFinite(at), 'продажа не штампанула ход события').toBe(true)
    expect(at, 'штамп не на ходу продажи').toBe(game.S.stats.sent)
    expect(game.S.mem[saleWhat], 'штамп не назвал проданную вещь').toBe('microwave')
    expect(button(game), 'на ходу продажи кнопки нет').toBeTruthy()
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(game); if (b) texts.add(b.text) }
    const pool = P_SOLD.map(text)
    expect(texts.size, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(pool.some((p) => t.includes(p) || t.includes(low(p))), `кнопка не из пула: ${t}`).toBe(true)
    // якорь окна — проданная вещь: строк о другой вещи в блоке нет
    for (const t of texts) expect(t.includes('плитку'), `строка о чужой продаже в окне микроволновки: ${t}`).toBe(false)
    game.S.stats.sent = at + 3
    expect(button(game), 'третий ход после продажи — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(game), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'soldQ' })
    const said = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    const answers = SOLD_B.map(text)
    expect(said.some((t) => answers.some((p) => t.includes(p))), `ответ не из пула события: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[saleAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(game), 'после ответа окно закрыто').toBeUndefined()
  })

  it('следующая продажа переякоривает окно: строки прошлой вещи молчат', () => {
    const { game } = bottom()
    game.answerCard(openCard(game).id, 'sell') // микроволновка
    expect(game.S.mem[saleWhat]).toBe('microwave')
    game.answerCard(openCard(game).id, 'sell') // гитара: причина «Продано, а остаток всё ещё критический»
    expect(game.S.mem[sold('guitar')], 'второй продажи не было — проверка пустеет').toBe(true)
    expect(game.S.mem[saleWhat], 'штамп не переехал на новую вещь').toBe('guitar')
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(game); if (b) texts.add(b.text) }
    expect(texts.size, 'окно новой продажи пусто — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(t.includes('Микроволновку'), `строка прошлой продажи в блоке: ${t}`).toBe(false)
  })

  it('окно держится только свежим штампом: без штампа продажа кнопки не даёт', () => {
    const { game } = bottom()
    game.answerCard(openCard(game).id, 'sell')
    expect(button(game), 'продажа не открыла окно').toBeTruthy()
    game.clearFact(saleAt) // окно потреблено (ответом или протухшим)
    expect(button(game), 'без штампа хода кнопки нет').toBeUndefined()
    expect(game.S.mem[sold('microwave')], 'факт продажи вещи остаётся').toBe(true)
  })

  it('пул окна продажи не повторяет строку: четыре хода окна — каждая строка один раз (#1287)', () => {
    // партии 309117/311117: две строки пула на вещь, окно — ход и три после; сырой draw рефиллил колоду
    // и возвращал показанную строку дословно («Микроволновку забрали…» 542 → 552). Инвариант #1283
    // распространён на все оконные офферы: строка предлагается один раз, исчерпанный пул молчит.
    const { game } = bottom()
    game.answerCard(openCard(game).id, 'sell')
    const at = Number(game.S.mem[saleAt])
    expect(Number.isFinite(at), 'продажа не штампанула ход — проверка пустеет').toBe(true)
    const pool = game.open(P_SOLD)
    expect(pool.length, 'у проданной вещи меньше двух строк — проверка пустеет').toBe(2)
    const offered: string[] = []
    for (let turn = 0; turn <= 3; turn++) {
      game.S.stats.sent = at + turn
      game.S.choices = null
      const b = game.buildChoices().find((c) => c.act === 'soldQ')
      if (b) offered.push(b.text)
    }
    expect(offered, `повтор строки пула внутри окна: ${offered.join(' → ')}`).toEqual([...new Set(offered)])
    expect([...offered].sort(), 'окно показало не весь пул').toEqual([...pool].sort())
  })
})

describe('окно вопроса о баране по памяти партии (#1252)', () => {
  const text = (e: unknown): string => { const v = valueOf(e as never); return typeof v === 'string' ? v : (v as { t: string }).t }
  const low = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
  const button = (game: Game) => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'borisMemory') }
  /** Само правило памяти, а не розыгрыш хода: Turn_Memory — редкий гость (вес в розыгрыше), цикл AlikTurn держал бы тест на удаче сида (#327). */
  const ask = async (game: Game, item: string) => {
    game.S.items.push(item)
    game.S.stats.sent = 20
    const rule = turnRules.find((r) => r.name === 'Turn_Memory')!
    await rule.respond!(respondCtx(rule, game, { event: 'AlikTurn' }, game.facts()))
  }

  it('другое воспоминание окна не открывает — негативный контроль', async () => {
    const { game } = makeGame()
    await ask(game, 'Место на кране (40 м)')
    expect(game.S.msgs.some((m) => m.kind === 'text' && /отдал тебе/.test(m.text)), 'вопрос не прозвучал — проверка пустеет').toBe(true)
    expect(game.S.mem[borisAskAt], 'чужое воспоминание штампануло окно барана').toBeUndefined()
    expect(button(game), 'кнопка про барана без вопроса о нём').toBeUndefined()
  })

  it('после «смерти» Алика ответ на его вопрос в пуле не висит (#1293)', async () => {
    const { game } = makeGame()
    await ask(game, 'баран Борис')
    expect(button(game), 'до смерти кнопка есть — проверка пустеет').toBeTruthy()
    game.S.mem[alikDead] = true
    expect(button(game), 'отвечают на вопрос мёртвого собеседника').toBeUndefined()
    game.S.mem[alikDead] = false
    expect(button(game), 'вернулся — окно снова доступно').toBeTruthy()
  })
  it('вопрос штампует ход, кнопка в блоке, окно три хода, ответ потребляет', async () => {
    const { game } = makeGame()
    expect(button(game), 'до вопроса кнопки нет').toBeUndefined()
    await ask(game, 'баран Борис')
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.text.includes('Всё ещё у тебя?')), 'вопрос не прозвучал — проверка пустеет').toBe(true)
    const at = Number(game.S.mem[borisAskAt])
    expect(at, 'строка памяти не штампанула ход вопроса').toBe(game.S.stats.sent)
    expect(button(game), 'на ходу вопроса кнопки нет').toBeTruthy()
    // в ближайшем блоке вариант — из пула реакции на вопрос, а не общая кнопка
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(game); if (b) texts.add(b.text) }
    const pool = P_BORIS_MEMORY.map(text)
    expect(texts.size, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(pool.some((p) => t.includes(p) || t.includes(low(p))), `кнопка не из пула: ${t}`).toBe(true)
    game.S.stats.sent = at + 3
    expect(button(game), 'третий ход после вопроса — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(game), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'borisMemory' })
    const said = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    const answers = BORIS_MEMORY_B.map(text)
    expect(said.some((t) => answers.some((p) => t.includes(p))), `ответ не из пула события: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[borisAskAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(game), 'после ответа окно закрыто').toBeUndefined()
  })
})

// Глубокие раунды 119–121 (#1292): четыре события, у которых не было окна отклика.
// Каждое — штамп на событие + гейтнутая строка в пуле окна; вакансия: принятие получает ответ-нить.
describe('окна отклика глубоких раундов (#1292)', () => {
  const text = (e: unknown): string => { const v = valueOf(e as never); return typeof v === 'string' ? v : (v as { t: string }).t }
  const low = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
  const button = (game: Game, act: string) => { game.S.choices = null; return game.buildChoices().find((c) => c.act === act) }
  const alikSaid = (game: Game, from: number): string[] =>
    game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
  const SERYOGA_CARD = 'Ну что, заплатил твой Алик?'

  it('карточка Серёги штампует ход, кнопка в блоке, окно три хода, ответ потребляет', async () => {
    const { game } = makeGame()
    expect(button(game, 'seryoga'), 'до карточки кнопки нет').toBeUndefined()
    showCard(game, SERYOGA_CARD)
    const at = Number(game.S.mem[seryogaAskAt])
    expect(at, 'карточка не штампанула ход события').toBe(game.S.stats.sent)
    expect(button(game, 'seryoga'), 'на ходу карточки кнопки нет').toBeTruthy()
    // в ближайшем блоке вариант — из пула окна, а не общая кнопка
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(game, 'seryoga'); if (b) texts.add(b.text) }
    const pool = P_SERYOGA.map(text)
    expect(texts.size, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(pool.some((p) => t.includes(p) || t.includes(low(p))), `кнопка не из пула: ${t}`).toBe(true)
    game.S.stats.sent = at + 3
    expect(button(game, 'seryoga'), 'третий ход после карточки — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(game, 'seryoga'), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'seryoga' })
    const said = alikSaid(game, n)
    const answers = SERYOGA_B.map(text)
    expect(said.some((t) => answers.some((p) => t.includes(p))), `ответ не из пула события: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[seryogaAskAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(game, 'seryoga'), 'после ответа окно закрыто').toBeUndefined()
  })

  it('строка Гранта «Ой. Не тот чат.» штампует ход, окно три хода, отвечает Грант', async () => {
    const { game } = makeGame()
    expect(button(game, 'grantBath'), 'до серии кнопки нет').toBeUndefined()
    // настоящий путь: серии арки до строки «не тот чат» (eps[1])
    for (let i = 0; i < ARCS.grant.eps.length && !game.S.mem[grantBathAt]; i++) await game.playArc('grant')
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.text.includes('Не тот чат')), 'строка не прозвучала — проверка пустеет').toBe(true)
    const at = Number(game.S.mem[grantBathAt])
    expect(Number.isFinite(at), 'строка серии не штампанула ход события').toBe(true)
    expect(at, 'штамп не на ходу строки').toBe(game.S.stats.sent)
    expect(button(game, 'grantBath'), 'на ходу события кнопки нет').toBeTruthy()
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(game, 'grantBath'); if (b) texts.add(b.text) }
    const pool = P_GRANT_BATH.map(text)
    expect(texts.size, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(pool.some((p) => t.includes(p) || t.includes(low(p))), `кнопка не из пула: ${t}`).toBe(true)
    game.S.stats.sent = at + 3
    expect(button(game, 'grantBath'), 'третий ход после строки — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(game, 'grantBath'), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'grantBath' })
    const said = alikSaid(game, n)
    const answers = GRANT_BATH_B.map(text)
    expect(said.some((t) => answers.some((p) => t.includes(p))), `ответ не из пула события: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[grantBathAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(game, 'grantBath'), 'после ответа окно закрыто').toBeUndefined()
  })

  it('вопрос «ты обиделся?» штампует ход, кнопка в блоке, окно три хода, ответ потребляет', async () => {
    const { game } = makeGame()
    expect(button(game, 'offendedAsk'), 'до вопроса кнопки нет').toBeUndefined()
    game.awayMsg('offended') // настоящий путь: пачка после тишины
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.text.endsWith('ты обиделся?')), 'вопрос не прозвучал — проверка пустеет').toBe(true)
    const at = Number(game.S.mem[offendedAskAt])
    expect(at, 'вопрос не штампанул ход события').toBe(game.S.stats.sent)
    expect(button(game, 'offendedAsk'), 'на ходу вопроса кнопки нет').toBeTruthy()
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(game, 'offendedAsk'); if (b) texts.add(b.text) }
    const pool = P_OFFENDED_ASK.map(text)
    expect(texts.size, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(pool.some((p) => t.includes(p) || t.includes(low(p))), `кнопка не из пула: ${t}`).toBe(true)
    game.S.stats.sent = at + 3
    expect(button(game, 'offendedAsk'), 'третий ход после вопроса — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(game, 'offendedAsk'), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'offendedAsk' })
    const said = alikSaid(game, n)
    const answers = OFFENDED_ASK_B.map(text)
    expect(said.some((t) => answers.some((p) => t.includes(p))), `ответ не из пула события: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[offendedAskAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(game, 'offendedAsk'), 'после ответа окно закрыто').toBeUndefined()
  })

  it('обычная болтовня после тишины окна не открывает — негативный контроль', () => {
    // вопрос живёт в своём пуле: строка в общем IDLE ставила бы окно мимо производителя события
    expect(IDLE.map((e) => valueOf(e as never)).some((x) => String(x) === 'ты обиделся?'), 'строка осталась в общем пуле').toBe(false)
    const { game } = makeGame()
    game.awayMsg('text')
    expect(game.S.mem[offendedAskAt], 'рядовая болтовня штампанула окно').toBeUndefined()
    expect(button(game, 'offendedAsk'), 'кнопка про обиду без вопроса').toBeUndefined()
  })

  it('принятие вакансии получает ответ-нить о сроке выхода — вопрос не висит', async () => {
    const { game } = makeGame()
    showCard(game, 'Новая вакансия: плиточник, оплата сразу! Работодатель: Алик В.')
    const at = Number(game.S.mem['vacancy.at'])
    expect(at, 'карточка не штампанула ход события').toBe(game.S.stats.sent)
    // кнопка-согласие — вторая строка пула: её номер уезжает с arg, по нему ответ и выбирается.
    // Окно показывает строку один раз за окно (#1283) — согласие приходит следующим блоком того же окна
    const first = button(game, 'vacancy')
    expect(first?.text, 'первая строка окна — вопрос об оплате').toMatch(/Оплата сразу/)
    expect(first?.arg, 'номер строки вопроса уехал неверно').toBe('0')
    game.S.stats.sent = at + 1
    const accept = button(game, 'vacancy')
    expect(accept?.text.includes('Беру'), `в блоке нет строки согласия: ${accept?.text}`).toBe(true)
    expect(accept?.arg, 'согласие уехало без номера строки').toBe('1')
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'vacancy', arg: '1' })
    const said = alikSaid(game, n)
    // нить: срок выхода называется прямо, «сразу» получает определение — вопрос игрока не остаётся висеть
    expect(said.length, `ответ-нить не прозвучала: ${said.join(' | ')}`).toBe(2)
    const start = VACANCY_START_B.map(text)
    const soon = VACANCY_SOON_B.map(text)
    expect(start.some((p) => said[0].includes(p) || said[0].includes(low(p))), `первое сообщение не о сроке: ${said[0]}`).toBe(true)
    expect(soon.some((p) => said[1].includes(p) || said[1].includes(low(p))), `второе сообщение не о «сразу»: ${said[1]}`).toBe(true)
    expect(said[0], 'срок выхода не назван').toMatch(/завтра/)
    expect(game.S.mem['vacancy.at'], 'ответ не потребил окно').toBeUndefined()
  })

  it('вопрос «оплата сразу — это как?» — не согласие: общий пул, не нить — негативный контроль', async () => {
    const { game } = makeGame()
    showCard(game, 'Новая вакансия: плиточник, оплата сразу! Работодатель: Алик В.')
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'vacancy', arg: '0' })
    const said = alikSaid(game, n)
    expect(said.length, `на вопрос ответили нитью о сроке: ${said.join(' | ')}`).toBe(1)
    const generic = VACANCY.map(text)
    expect(generic.some((p) => said[0].includes(p)), `ответ не из общего пула: ${said[0]}`).toBe(true)
  })
})
