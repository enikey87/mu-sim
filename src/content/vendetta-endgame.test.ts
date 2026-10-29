// Терминальность «Вендетты» (#1556): после её экрана партия уходит в свой эпилог вражды,
// День выплаты для грубого пути не наступает ни до, ни после схода. Извинение в живом окне
// (пока сход не стал экраном) — полный выход: снимает и холодную войну, и вражду.
import { describe, expect, it } from 'vitest'
import { makeGame, flush } from '../test/helpers'
import { ENDGAME_GROUP, ENDGAME_VENDETTA_GROUP } from './endgame'
import { CHRONIC_RUDE_AFTER_VENDETTA, ENDING_MIN_DAY } from './finales'
import type { Game } from '../engine/game'

const messages = (game: Game, from = 0) =>
  game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))

/** Партия доехала до третьего акта со сходом: экран «Вендетты» сыгран и закрыт. */
async function toVendettaEpilogue(game: Game): Promise<void> {
  game.S.mem.vendetta = true
  game.S.day = ENDING_MIN_DAY
  await game.fire('CheckEnding')
  expect(game.S.ending, 'экран вендетты').toBe('vendetta')
  await game.closeEnding()
  await flush()
}

/** Партия созрела для Дня выплаты: все ворота запуска открыты, кроме проверяемого факта. */
function readyForPayday(game: Game): void {
  game.S.day = 500
  game.S.stats.sent = 400
  Object.assign(game.S.mem, { 'payday.signs': 2, 'payday.lead': 460 })
}

const paydayRulesFor = (game: Game): string[] =>
  game.rules.collect({ event: 'StoryBeat' }, game.facts()).map((r) => r.name).filter((n) => n.startsWith('Beat_Payday'))

describe('«Вендетта» — терминальный финал грубого пути (#1556)', () => {
  it('после экрана открывается свой эпилог вражды, а не группа Дня выплаты', async () => {
    const { game } = makeGame()
    const from = game.S.msgs.length

    await toVendettaEpilogue(game)

    const text = messages(game, from).join(' ')
    expect(game.S.mem['endgame.active'], 'мир заморожен').toBe(true)
    expect(game.S.mem['endgame.vendetta'], 'поток — вражда').toBe(true)
    expect(text).toContain(ENDGAME_VENDETTA_GROUP)
    expect(text).not.toContain(ENDGAME_GROUP)
    expect(text, 'День выплаты не наступил').not.toMatch(/День выплаты/)
    expect(game.S.mem['lend50.asked'], 'просьбы «займи 50» в эпилоге вражды нет').toBeUndefined()
    expect(game.choices.map((c) => c.act)).toEqual(['endgameMoney', 'endgameMute', 'endgameLeave'])
    expect(game.choices.map((c) => c.text)).toEqual(['Где извинения?', 'Отключить уведомления', 'Выйти из группы'])
  })

  it('«Где извинения?» отвечает враждой, а не деньгами: архива и пула выплаты в группе нет', async () => {
    const { game } = makeGame()
    await toVendettaEpilogue(game)
    const from = game.S.msgs.length

    await game.send(game.choices.find((c) => c.act === 'endgameMoney')!)

    const answer = messages(game, from).join(' ')
    expect(answer.length).toBeGreaterThan(0)
    expect(answer).not.toMatch(/выплат|денег|деньг|рубл/i)
  })

  it('День выплаты после терминальной вендетты недоступен: ни запуск, ни «Параллельная вселенная»', async () => {
    const { game } = makeGame()
    await toVendettaEpilogue(game)
    readyForPayday(game)

    expect(paydayRulesFor(game), 'ни одного входа в День выплаты').toEqual([])
    expect((await game.fire('StoryBeat'))?.name).toBe('Endgame_Formality')

    game.S.day = 900
    game.S.stats.sent = 400
    expect((await game.fire('CheckEnding'))?.name).toBe('Endgame_NoEnding')
    expect(game.S.ending, 'выхода из эпилога вражды нет').toBeNull()
  })

  it('объявленный сход закрывает День выплаты ещё до экрана; снятый сход возвращает его', async () => {
    const { game } = makeGame()
    readyForPayday(game)
    game.S.mem.vendetta = true
    expect(paydayRulesFor(game), 'грубому пути выплата не положена').toEqual([])

    // НК к самому гейту: без схода те же ворота снова открывают День выплаты
    game.S.mem.vendetta = false
    expect(paydayRulesFor(game), 'без вражды выплата доступна').toContain('Beat_Payday_Deadline')
  })

  it('извинение в живом окне — полный выход: снимает и холодную войну, и сход', async () => {
    const { game } = makeGame()
    Object.assign(game.S.mem, { vendetta: true, coldWar: true, 'rude.heat': 0 })

    await game.fire('PlayerSays', { intent: 'sorry', tone: 'polite' })

    expect(game.S.mem.vendetta, 'сход снят').toBe(false)
    expect(game.S.mem.coldWar, 'холодная война кончена').toBe(false)
  })

  it('ритуал примирения — тот же выход: мир снимает вражду, а не половину её', async () => {
    const { game } = makeGame()
    game.S.mem.vendetta = true
    await game.fire('PlayerSays', { intent: 'sorry', tone: 'polite' })
    game.S.mem.vendetta = true // сход вернули: проверяем именно ритуал
    game.S.mem['rude.heat'] = 4 // жар ссоры: текстом извинение не принимается
    await game.fire('PlayerSays', { intent: 'sorry', tone: 'polite' })
    expect(game.S.scene?.id, 'извинение после серии криков ведёт в ритуал').toBe('ritual')

    game.S.choices = null
    await game.send(game.choices.find((c) => c.go === 'moo')!)

    expect(game.S.mem.vendetta, 'ритуал снял вражду').toBe(false)
    expect(game.S.mem.coldWar, 'ритуал снял холодную войну').toBe(false)
  })

  it('хроника после снятого схода не растёт: ранний финал «Кровный враг» недостижим', async () => {
    const { game } = makeGame()
    game.S.mem.vendetta = true
    game.S.mem['count.rudeAfterVendetta'] = CHRONIC_RUDE_AFTER_VENDETTA - 1
    await game.fire('PlayerSays', { intent: 'sorry', tone: 'polite' })

    for (let i = 0; i < 3; i++) await game.send({ text: 'АЛИК!!! ТЫ ВРЁШЬ!!!', tone: 'rude' })

    expect(game.S.mem['count.rudeAfterVendetta']).toBe(CHRONIC_RUDE_AFTER_VENDETTA - 1)
    expect(game.S.ending, 'схода нет — раннего финала тоже').toBeNull()
  })
})
