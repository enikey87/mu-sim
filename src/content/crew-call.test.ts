// Звонок с объекта (docs/design/crew-call.md, #576): Тарон входит в историю своим звонком,
// звонок звучит один раз в середине партии и пишет факт crew.paid.
import { describe, it, expect } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import type { Game } from '../engine/game'
import type { Choice } from '../engine/state'
import { alikDead, blocked, crewPaid, crewPaidAt, endgame } from './memkeys'
import { CREW_CALL, CREW_FRESH_TURNS, P_CREW_PAID, CREW_PAID } from './crew'
import { SPEAKS, WORLD } from './world'
import { CAST } from './arcs'
import { is, set, valueOf } from './fact'
import { sayFresh } from './rules/rude'

const taronMsgs = (game: ReturnType<typeof makeGame>['game']) =>
  game.S.msgs.filter((m) => m.kind === 'text' && m.who === 'taron')
const sysMsgs = (game: ReturnType<typeof makeGame>['game']) =>
  game.S.msgs.filter((m) => m.kind === 'sys').map((m) => m.text)

describe('звонок с объекта', () => {
  it('Тарон молчит, пока не позвонил: в SPEAKS — факт знакомства, не «умеет писать»', () => {
    const { game } = makeGame()
    expect(SPEAKS.taron, 'в SPEAKS — только факт знакомства').toEqual(WORLD.taron)
    expect(is('intro.taron').key).toBe('intro.taron')
    expect(game.canSpeak('taron'), 'на свежей партии Тарон не говорит').toBe(false)
  })

  it('упрёк по звонку не приписывает разговор: звонок был пропущен (#831)', () => {
    // игрок видит пропущенный звонок и сообщения Тарона — разговора не было, и упрёк не может его называть
    for (const e of P_CREW_PAID) {
      const t = valueOf(e)
      expect(t, `«${t}» приписывает пересказ звонка переспросу`).not.toMatch(/переспросил|переспрошу|сказал мне по телефону/i)
    }
  })

  it('одна подпись: системная строка звонка называет Тарона так же, как контакт (#821)', async () => {
    const { game } = makeGame()
    game.S.day = 210
    await game.fire('AlikIdle')
    const call = sysMsgs(game).find((t) => t.startsWith('Пропущенный звонок:'))
    expect(call, 'звонок объявлен').toBe(`Пропущенный звонок: ${CAST.taron.name}`)
    // подпись не загадка: расшифровка идёт его же словами
    expect(taronMsgs(game).map((m) => (m.kind === 'text' ? m.text : '')).join(' ')).toContain('чай носил')
  })
  it('звонок в середине партии: строка системы, реплика Тарона, факт crew.paid', async () => {
    const { game } = makeGame()
    game.S.day = 210
    await game.fire('AlikIdle')
    expect(sysMsgs(game), 'звонок объявляется пропущенным').toContain('Пропущенный звонок: Тарон (чайнос)')
    const said = taronMsgs(game)
    expect(said.length, 'Тарон пишет сам — этим и входит в историю').toBe(1)
    expect(game.S.mem['intro.taron'], 'знакомство писал движок, не разметка').toBe(true)
    expect(game.S.mem[crewPaid], 'факт звонка — на доске мира').toBe(true)
  })

  it('единственный звонок не говорит, что Тарон уже звонил', async () => {
    const pool = CREW_CALL.map((e) => valueOf(e)[1]).join('\n')
    expect(pool).not.toMatch(/Это снова Тарон/)
    const { game } = makeGame()
    game.S.day = 210
    await game.fire('AlikIdle')
    expect(taronMsgs(game).flatMap((m) => (m.kind === 'text' ? [m.text] : [])).join(' ')).not.toMatch(/снова/)
    expect(game.S.mem[crewPaid]).toBe(true)
    await game.fire('AlikIdle')
    expect(taronMsgs(game)).toHaveLength(1)
  })

  it('звонок один раз за партию: второй idle молчит', async () => {
    const { game } = makeGame()
    game.S.day = 210
    await game.fire('AlikIdle')
    await game.fire('AlikIdle')
    await game.fire('AlikIdle')
    expect(taronMsgs(game).length).toBe(1)
    expect(sysMsgs(game).filter((t) => t === 'Пропущенный звонок: Тарон (чайнос)').length).toBe(1)
  })

  it('на первой неделе звонка нет: середина партии — гейт, а не случайность', async () => {
    const { game } = makeGame()
    game.S.day = 190
    await game.fire('AlikIdle')
    expect(taronMsgs(game)).toHaveLength(0)
    expect(game.S.mem[crewPaid]).toBeUndefined()
  })

  it('в окне блокировки, смерти, эндгейма и сцены звонка нет', async () => {
    for (const [what, setup] of [
      ['блок', (g: ReturnType<typeof makeGame>['game']) => { g.rules.applyOps([{ key: blocked, op: '=', value: true }], {}) }],
      ['смерть Алика', (g: ReturnType<typeof makeGame>['game']) => { g.rules.applyOps([{ key: alikDead, op: '=', value: true }], {}) }],
      ['эндгейм', (g: ReturnType<typeof makeGame>['game']) => { g.rules.applyOps([{ key: endgame.active, op: '=', value: true }], {}) }],
      // сцена открыта: состояние parties задано вручную — проверяем поведение правила, не путь
      ['сцена', (g: ReturnType<typeof makeGame>['game']) => { g.S.scene = { id: 'meet', node: 'ask', vars: {} } }],
    ] as const) {
      const { game } = makeGame()
      game.S.day = 210
      setup(game)
      await game.fire('AlikIdle')
      expect(taronMsgs(game), `в окне «${what}» звонка нет`).toHaveLength(0)
      expect(game.S.mem[crewPaid], `в окне «${what}» факт звонка не пишется`).toBeUndefined()
    }
  })
})

describe('упрёк по звонку с объекта', () => {
  /** Партия, в которой звонок уже состоялся: факт crew.paid, Тарон в истории. */
  const afterCall = async () => {
    const { game } = makeGame()
    game.S.day = 210
    await game.fire('AlikIdle')
    return game
  }
  const optCrewPaid = (g: Game) => g.rules.collect({ event: 'BuildChoices' }, g.facts()).filter((r) => r.name === 'Opt_CrewPaid')

  it('до звонка упрёка нет: оффер живёт под фактом crew.paid', async () => {
    const { game } = makeGame()
    game.S.day = 190
    await game.fire('AlikIdle')
    expect(game.S.mem[crewPaid]).toBeUndefined()
    expect(optCrewPaid(game)).toHaveLength(0)
  })

  it('после звонка кнопка упрёка собирается, и Алик отвечает из своего пула', async () => {
    const game = await afterCall()
    const rules = optCrewPaid(game)
    expect(rules).toHaveLength(1)
    const c = rules[0].offer!(game.rules.ctx(game, rules[0], { event: 'BuildChoices' }, game.facts()))
    expect(c?.act).toBe('crewPaid')
    expect(c?.text, 'кнопка — из пула упрёка').toBeTruthy()
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'crewPaid' })
    const answer = alikTexts(game.S.msgs.slice(n)).join(' ')
    expect(CREW_PAID.some((l) => answer.includes(valueOf(l))), `ответ не из пула: ${answer}`).toBe(true)
  })

  it('упрёк повторяем: второй отвечает другой строкой, звонок не объявляется снова', async () => {
    const game = await afterCall()
    const answers: string[] = []
    for (let i = 0; i < 2; i++) {
      const n = game.S.msgs.length
      await game.fire('PlayerSays', { intent: 'crewPaid' })
      answers.push(alikTexts(game.S.msgs.slice(n)).join(' '))
    }
    for (const a of answers) expect(CREW_PAID.some((l) => a.includes(valueOf(l))), a).toBe(true)
    expect(answers[0], 'колода не зациклена на одной строке').not.toBe(answers[1])
    expect(sysMsgs(game).filter((t) => t === 'Пропущенный звонок: Тарон (чайнос)').length, 'звонок — один раз').toBe(1)
  })

  // замер #592: оффер занимал слот в 94% кадров выбора после звонка — одна и та же кнопка десятки
  // ходов подряд. Перерыв считается от показа: первое окно игрока за звонком — кнопка есть,
  // дальше — не чаще раза в 10 ходов, потом снова.
  it('перерыв: упрёк виден сразу за звонком и не чаще раза в 10 ходов (#789)', async () => {
    const game = await afterCall()
    const offered = () => game.rules.collect({ event: 'BuildChoices' }, game.facts()).some((r) => r.name === 'Opt_CrewPaid')
    const inFrame = () => game.choices.some((c) => c.act === 'crewPaid')
    await game.send({ text: 'Алик, что с деньгами?', tone: 'neutral' }) // первый ход игрока за звонком
    expect(inFrame(), 'первое окно за звонком: кнопка в кадре игрока').toBe(true)
    for (let turn = 2; turn <= 10; turn++) {
      await game.send({ text: 'Алик, что с деньгами?', tone: 'neutral' })
      expect(offered(), `ход ${turn} партии: оффер на перерыве`).toBe(false)
      expect(inFrame(), `ход ${turn} партии: в кадре игрока её нет`).toBe(false)
      expect(game.choices.length, 'перерыв не оставляет игрока без вариантов').toBeGreaterThan(0)
    }
    // перерыв прошёл: упрёк снова доступен и возвращается в кадр игрока
    let turns = 0
    while (turns++ < 20 && !inFrame()) await game.send({ text: 'Алик, что с деньгами?', tone: 'neutral' })
    expect(inFrame(), 'перерыв прошёл — упрёк снова в кадре').toBe(true)
  })

  // ревью раунда 45 (#703): упрёк и ответ ссылались на «пострадавших», которых звонок мог не назвать
  it('звонок без имён (вариант «плиточнику — в следующий раз») не открывает упрёков про штукатура, водителя, электрика, козла', async () => {
    const { game } = makeGame()
    game.S.day = 210
    // звонок вариантом 3 — тем же путём, что и правило Beat_CrewCall: один элемент пула + факт звонка
    expect(await sayFresh(game, 'CREW_CALL', [CREW_CALL[2]])).toBe(true)
    game.rules.applyOps([set(crewPaid, true)], {})
    const offered = game.open(P_CREW_PAID)
    expect(offered.length, 'упрёк предлагается').toBeGreaterThan(0)
    expect(offered.join('\n')).not.toMatch(/штукатур|водител|электрик|козл|Тарон получ/i)
    // выборщик не заглядывает дальше открытого: кнопка — тоже из этих строк
    const rules = optCrewPaid(game)
    const c = rules[0].offer!(game.rules.ctx(game, rules[0], { event: 'BuildChoices' }, game.facts()))
    expect(offered).toContain(c!.text)
  })

  // плейтест-раунд 46 / аудит раунда 38 (#731): префикс декора ронял первую букву имени — «Алик, тарон звонил»
  it('упрёк с Тароном звучит с заглавной при любом префиксе — и в кнопке, и в отправленной реплике', async () => {
    const game = await afterCall()
    const rules = optCrewPaid(game)
    expect(rules).toHaveLength(1)
    const offer = () => rules[0].offer!(game.rules.ctx(game, rules[0], { event: 'BuildChoices' }, game.facts()))
    // первый показ строки — как есть; префикс клеится на повтор уже сказанного (pickFresh в playerLine)
    const raw = new Map<string, Choice>()
    for (let i = 0; i < 100 && raw.size < P_CREW_PAID.length; i++) {
      const c = offer()
      if (c) raw.set(c.text, c)
    }
    expect(raw.size, 'все строки пула показаны как есть').toBe(P_CREW_PAID.length)
    for (const c of raw.values()) await game.send(c)

    const decorated = new Map<string, Choice>()
    for (let i = 0; i < 120; i++) {
      const c = offer()
      if (c) decorated.set(c.text, c)
    }
    const taron = [...decorated.entries()].filter(([t]) => /арон/i.test(t))
    expect(taron.length, 'вариант с Тароном попадался').toBeGreaterThan(0)
    for (const [t] of taron) expect(t, t).toMatch(/Тарон/)
    // проверка не на одном случае: среди повторов есть префикс с запятой — именно там low понижал букву
    expect(taron.filter(([t]) => /^(Алик, |Слушайте, |Так, |Алик-джан, )/.test(t)).length, 'вариант с префиксом-обращением').toBeGreaterThan(0)

    const c = taron.find(([t]) => t.startsWith('Алик, '))?.[1] ?? taron[0]![1]
    const n = game.S.msgs.length
    await game.send(c)
    const mine = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.from === 'me' ? [m.text] : []))
    expect(mine[0], 'отправленная реплика — с заглавной').toMatch(/Тарон/)
  })

  it('ответы Алика субъектно-агностичны: ответ не отвечает на субъект, которого упрёк не называл', async () => {
    const { game } = makeGame()
    game.S.day = 210
    await sayFresh(game, 'CREW_CALL', [CREW_CALL[2]])
    game.rules.applyOps([set(crewPaid, true)], {})
    for (const l of CREW_PAID) expect(valueOf(l), valueOf(l)).not.toMatch(/штукатур|водител|электрик|козл/i)
    // мутация «субъектный ответ на чужой упрёк» невозможна: субъектных ответов в пуле нет
    for (let i = 0; i < 5; i++) {
      const n = game.S.msgs.length
      await game.fire('PlayerSays', { intent: 'crewPaid' })
      const answer = alikTexts(game.S.msgs.slice(n)).join(' ')
      expect(CREW_PAID.some((l) => answer.includes(valueOf(l))), answer).toBe(true)
      expect(answer).not.toMatch(/штукатур|водител|электрик|козл/i)
    }
  })

  it('«кто звонил» и «спроси у него» звучат только несколько ходов после звонка (#928)', async () => {
    const caller = 'Спроси у того, кто звонил. Он всё видел и всё перепутал. Перепутал — значит, и не видел.'
    const tea = 'Я чаем рассчитался. Он согласился, он чайный человек. Спроси у него — он подтвердит.'
    const game = await afterCall()
    expect(game.S.mem[crewPaidAt], 'звонок пишет свой ход').toBe(game.S.stats.sent)
    const heard = new Set<string>()
    for (let i = 0; i < CREW_PAID.length * 2 && !(heard.has(caller) && heard.has(tea)); i++) heard.add(game.draw('CREW_PAID', CREW_PAID))
    expect(heard.has(caller), 'в окне строка про звонившего звучит').toBe(true)
    expect(heard.has(tea), 'в окне «спроси у него» звучит').toBe(true)
    game.S.stats.sent += CREW_FRESH_TURNS + 1
    const late = game.open(CREW_PAID)
    expect(late, 'вне окна звонивший без имени молчит').not.toContain(caller)
    expect(late, 'вне окна «спроси у него» молчит').not.toContain(tea)
    expect(late.length, 'остальной пул жив').toBeGreaterThan(0)
    expect(late).toContain('У каждого своя очередь: кто кладёт, кто возит, кто носит чай. Твоя просто длинная.')
  })

  it('в окне блокировки и смерти упрёка нет', async () => {
    for (const [what, setup] of [
      ['блок', (g: Game) => { g.rules.applyOps([{ key: blocked, op: '=', value: true }], {}) }],
      ['смерть Алика', (g: Game) => { g.rules.applyOps([{ key: alikDead, op: '=', value: true }], {}) }],
    ] as const) {
      const game = await afterCall()
      setup(game)
      expect(optCrewPaid(game), `в окне «${what}» оффера нет`).toHaveLength(0)
    }
  })
})
