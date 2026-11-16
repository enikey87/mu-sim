// Эпилог оконченной партии (#1704): телеграм-воркер не будит дошедшего до конца игрока, а мир в игре
// молчит без хода игрока — простой, пачка, суточная реплика и хор. Путь везде игрока: сцена Дня выплаты →
// экран концовки закрыт → просьба «займи 50» отвечена. «До эпилога» доказывает, что канал живой: иначе
// проверка после экрана проверяла бы пустой пул, а не тишину.
import { describe, expect, it } from 'vitest'
import { makeGame, flush } from '../test/helpers'
import type { Game } from '../engine/game'
import { allRules } from './rules'
import { EVENT_SOURCE, type GameEvent } from './rules/events'

const alikTexts = (game: Game) => game.S.msgs.filter((m) => m.kind === 'text' && m.from === 'alik')

/** День выплаты пройден путём игрока: сцена, исход, закрытый экран концовки и отвеченная просьба. */
async function toEpilogue(game: Game): Promise<void> {
  game.S.day = 340
  Object.assign(game.S.mem, { 'finale.nune': 'default', 'finale.niva': 'chose', 'finale.boris': 'brigadir', 'met.samvel': true, 'met.karine': true, 'met.boris': true })
  Object.assign(game.S.arcs, { nune: { i: 6, last: 0 }, niva: { i: 7, last: 0 }, boris: { i: 10, last: 0 } })
  Object.assign(game.S.ach, { q_goat: 1, court: 1, q_hash: 1 })
  const choose = async (go: string) => { game.S.choices = null; const c = game.choices.find((x) => x.go === go); expect(c, go).toBeDefined(); await game.send(c!) }
  await game.enterNode('payday', 'announce')
  await choose('witness')
  await choose('share')
  delete game.S.mem['finale.niva']
  await choose('catch')
  await game.fire('CheckEnding')
  expect(game.S.ending, 'экран Дня выплаты').toBe('payday_coins')
  await game.closeEnding()
  await flush()
  expect(game.S.mem['endgame.active'], 'эпилог').toBe(true)
  const ask = game.choices.find((c) => c.act === 'lend50Serious')
  expect(ask, 'просьба «займи 50» ждёт ответа').toBeDefined()
  await game.send(ask!)
  expect(game.choices.map((c) => c.act)).toEqual(['endgameMoney', 'endgameMute', 'endgameLeave'])
}

/** Живой канал до экрана: пока пул не заговорил, проверка тишины после экрана ничего не доказывает. */
async function spokeBefore(game: Game, event: GameEvent, target?: string): Promise<boolean> {
  const from = alikTexts(game).length
  for (let i = 0; i < 60; i++) {
    game.S.stats.sent += 13
    await game.fire(event, {}, target ? { target } : {})
    if (event === 'PeriodLine' ? alikTexts(game).length > from : game.S.msgs.some((m) => m.kind === 'text' && m.who === target)) return true
  }
  return false
}

describe('эпилог молчит без хода игрока (#1704)', () => {
  it('простой и пачка не пишут, календарь стоит', async () => {
    // до экрана те же каналы говорят: простой — болтовнёй Алика, пачка — сообщениями «пока не было»
    const { game: live } = makeGame({ seed: 6 })
    live.S.stats.sent = 6
    const idleFrom = live.S.msgs.length
    await live.onIdle()
    expect(live.S.msgs.length, 'простой молчит и до экрана — проверка после пустеет').toBeGreaterThan(idleFrom)
    const awayFrom = live.S.msgs.length
    await live.awayBurst(3, 2)
    expect(live.S.msgs.length, 'пачка молчит и до экрана — проверка после пустеет').toBeGreaterThan(awayFrom)

    const { game } = makeGame({ seed: 6 })
    await toEpilogue(game)
    game.S.stats.sent = 40
    const before = game.S.msgs.length
    const day = game.S.day
    const forms = game.S.mem['endgame.forms']
    await game.onIdle()
    expect(game.S.msgs.slice(before), 'простой в эпилоге не говорит').toEqual([])
    await game.awayBurst(3, 2, 'пока не было')
    expect(game.S.msgs.slice(before), 'пачки «пока не было» в эпилоге нет').toEqual([])
    expect(game.S.day, 'календарь эпилога двигает ход игрока, а не отсутствие').toBe(day)
    expect(game.S.mem['endgame.forms'], 'простой не закрывает акты').toBe(forms)
  })

  it('суточная реплика и хор молчат, хотя пулы живые', async () => {
    const { game: live } = makeGame({ seed: 11 })
    expect(await spokeBefore(live, 'PeriodLine'), 'PeriodLine не звучит и до экрана — проверка после пустеет').toBe(true)
    live.S.mem['intro.samvel'] = true
    expect(await spokeBefore(live, 'Mentioned', 'samvel'), 'хор не звучит и до экрана — проверка после пустеет').toBe(true)

    const { game } = makeGame({ seed: 11 })
    await toEpilogue(game)
    game.S.mem['intro.samvel'] = true
    const before = game.S.msgs.length
    expect((await game.fire('PeriodLine'))?.name ?? null, 'суточную реплику гасит мир эпилога').toBeNull()
    expect(game.S.msgs.slice(before), 'PeriodLine в эпилоге не пишет').toEqual([])
    expect((await game.fire('Mentioned', {}, { target: 'samvel' }))?.name ?? null, 'хор гасит мир эпилога').toBeNull()
    expect(game.S.msgs.slice(before), 'хор в эпилоге не пишет').toEqual([])
  })

  it('корпус событий мира в эпилоге не пишет', async () => {
    const { game } = makeGame({ seed: 7 })
    await toEpilogue(game)
    const world = (Object.keys(EVENT_SOURCE) as GameEvent[]).filter((event) => EVENT_SOURCE[event] === 'world')
    // перечень целиком: таймеры, расписание и фон — все инициативы мира, а не только четыре канала
    expect(world.sort()).toEqual([
      'AlikAway', 'AlikIdle', 'ArcFinale', 'BillDue', 'BillWarn', 'CreditDue', 'Mentioned',
      'PaydayButton', 'PaydayOutcome', 'PeriodLine', 'PickQuest', 'PickScene', 'PromiseConditionMet',
      'PromiseDue', 'RudeCool',
    ])
    for (const event of world) {
      const before = game.S.msgs.length
      const facts = event === 'PromiseDue' || event === 'PromiseConditionMet' ? { promise: 0 } : {}
      const r = await game.fire(event, facts, { target: 'samvel' })
      expect(r === null || r.quiet === true, `${event}: в эпилоге не выбирается говорящее правило (${r?.name})`).toBe(true)
      expect(game.S.msgs.slice(before), `${event} в эпилоге не пишет`).toEqual([])
    }
  })

  it('ход игрока по-прежнему отвечает: кнопки эпилога и формальности', async () => {
    const { game } = makeGame({ seed: 5 })
    await toEpilogue(game)
    const before = game.S.msgs.length
    await game.send(game.choices.find((c) => c.act === 'endgameMoney')!)
    expect(game.S.msgs.slice(before).length, 'кнопка эпилога отвечает').toBeGreaterThan(0)
    expect(game.choices.map((c) => c.act), 'три кнопки на месте').toEqual(['endgameMoney', 'endgameMute', 'endgameLeave'])
    // сюжетный ход идёт в конце хода игрока и отдаёт колоду эпилога, а не заводит линию
    expect((await game.fire('StoryBeat'))?.name).toBe('Endgame_Formality')
  })

  it('каждое событие корпуса отнесено к игроку или миру', () => {
    for (const r of allRules) expect(EVENT_SOURCE[r.event as GameEvent], r.name).toBeTypeOf('string')
    // тишина эпилога стоит на этих четырёх: они умеют говорить, но не по ходу игрока
    for (const event of ['AlikIdle', 'AlikAway', 'PeriodLine', 'Mentioned'] as GameEvent[]) expect(EVENT_SOURCE[event], event).toBe('world')
    // а это — сам ход игрока: эпилог на него отвечает
    for (const event of ['PlayerSays', 'PlayerMessage', 'AlikTurn', 'StoryBeat', 'CheckEnding'] as GameEvent[]) expect(EVENT_SOURCE[event], event).toBe('player')
  })
})

describe('телеграм-признак оконченной партии (#1704)', () => {
  it('экран концовки закрыт — партия окончена, воркер напоминать не должен', async () => {
    const { game } = makeGame({ seed: 3 })
    expect(game.epilogueReached(), 'свежая партия живая').toBe(false)

    game.S.day = 340
    Object.assign(game.S.mem, { 'finale.nune': 'default', 'finale.niva': 'chose', 'finale.boris': 'brigadir', 'met.samvel': true, 'met.karine': true, 'met.boris': true })
    Object.assign(game.S.arcs, { nune: { i: 6, last: 0 }, niva: { i: 7, last: 0 }, boris: { i: 10, last: 0 } })
    Object.assign(game.S.ach, { q_goat: 1, court: 1, q_hash: 1 })
    const choose = async (go: string) => { game.S.choices = null; const c = game.choices.find((x) => x.go === go); expect(c, go).toBeDefined(); await game.send(c!) }
    await game.enterNode('payday', 'announce')
    await choose('witness')
    await choose('share')
    delete game.S.mem['finale.niva']
    await choose('catch')
    await game.fire('CheckEnding')
    expect(game.S.ending, 'экран открыт').toBe('payday_coins')
    expect(game.epilogueReached(), 'экран концовки — уже конец партии').toBe(true)

    await game.closeEnding()
    await flush()
    // живая дыра #1704: closeEnding стирает S.ending, и старый признак `S.ending != null` врал «партия жива»
    expect(game.S.ending, 'экран закрыт — S.ending стёрт').toBeNull()
    expect(game.S.mem['endgame.active'], 'эпилог идёт').toBe(true)
    expect(game.epilogueReached(), 'эпилог достигнут — партия окончена').toBe(true)
  })
})
