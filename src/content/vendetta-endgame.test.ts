// Терминальность «Вендетты» (#1556): после её экрана партия уходит в свой эпилог вражды,
// День выплаты для грубого пути не наступает ни до, ни после схода. Извинение в живом окне
// (пока сход не стал экраном) — полный выход: снимает и холодную войну, и вражду.
// Содержимое эпилога (#1557): акт обид в вступлении, просьба «займи 50» через посредника, тёплых
// строк Дня выплаты в группе вражды нет.
import { describe, expect, it } from 'vitest'
import { makeGame, flush, memStorage } from '../test/helpers'
import {
  ENDGAME_GROUP, ENDGAME_VENDETTA_ACT, ENDGAME_VENDETTA_FOREVER, ENDGAME_VENDETTA_GROUP,
  LEND50_VENDETTA_ASK, LEND50_VENDETTA_ASK_KNOWN,
} from './endgame'
import { CHRONIC_RUDE_AFTER_VENDETTA, ENDING_MIN_DAY } from './finales'
import type { Game } from '../engine/game'

const messages = (game: Game, from = 0) =>
  game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))

/**
 * Партия доехала до третьего акта со сходом: экран «Вендетты» сыгран и закрыт.
 * Просьбу вражды (#1557) закрываем ответом «Не дам»: кнопки группы появляются только после ответа.
 */
async function toVendettaEpilogue(game: Game, ask: 'no' | 'keep' = 'no'): Promise<void> {
  game.S.mem.vendetta = true
  game.S.day = ENDING_MIN_DAY
  await game.fire('CheckEnding')
  expect(game.S.ending, 'экран вендетты').toBe('vendetta')
  await game.closeEnding()
  await flush()
  if (ask === 'no') await game.send(game.choices.find((c) => c.act === 'lend50No')!)
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
  it('после экрана открывается свой эпилог вражды: группа, акт обид и просьба через посредника (#1557)', async () => {
    const { game } = makeGame()
    const from = game.S.msgs.length

    await toVendettaEpilogue(game, 'keep')

    const text = messages(game, from).join(' ')
    expect(game.S.mem['endgame.active'], 'мир заморожен').toBe(true)
    expect(game.S.mem['endgame.vendetta'], 'поток — вражда').toBe(true)
    expect(text).toContain(ENDGAME_VENDETTA_GROUP)
    expect(text).not.toContain(ENDGAME_GROUP)
    expect(text, 'День выплаты не наступил').not.toMatch(/День выплаты/)
    // акт обид — закрывающая формальность вступления, финальная реплика идёт за подписью
    for (const line of [...ENDGAME_VENDETTA_ACT, ENDGAME_VENDETTA_FOREVER]) expect(text).toContain(line)
    // просьба вражды: её передаёт посредник, карточка и ответы — механика Дня выплаты
    for (const line of LEND50_VENDETTA_ASK) expect(text).toContain(line)
    expect(game.S.mem['lend50.asked'], 'просьба прозвучала').toBe(true)
    expect(game.S.msgs.slice(from).some((m) => m.kind === 'lend50'), 'карточка просьбы в ленте').toBe(true)
    // кнопки группы не появляются раньше ответа на просьбу (#358): на экране — три ответа
    expect(game.choices.map((c) => c.act)).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
  })

  it('ответ на просьбу возвращает кнопки группы вражды: просьба эпилог не запирает', async () => {
    const { game } = makeGame()
    await toVendettaEpilogue(game)

    expect(game.S.mem['lend50.answer'], 'ответ записан').toBe('no')
    expect(game.choices.map((c) => c.act)).toEqual(['endgameMoney', 'endgameMute', 'endgameLeave'])
    expect(game.choices.map((c) => c.text)).toEqual(['Где извинения?', 'Отключить уведомления', 'Выйти из группы'])
  })

  it('посредник знакомится сам, если игрок его не встречал: известному — «опять»', async () => {
    const { game: unknown } = makeGame()
    await toVendettaEpilogue(unknown, 'keep')
    expect(messages(unknown)).toContain(LEND50_VENDETTA_ASK[0])
    expect(unknown.S.mem['intro.mama'], 'первое сообщение вводит посредника в историю').toBe(true)

    const { game: known } = makeGame()
    known.S.mem['met.mama'] = true
    await toVendettaEpilogue(known, 'keep')
    expect(messages(known)).toContain(LEND50_VENDETTA_ASK_KNOWN[0])
  })

  it('перезагрузка посреди просьбы вражды доигрывает её: и реплики, и карточку', async () => {
    const storage = memStorage()
    const { game } = makeGame({ storage })
    Object.assign(game.S.mem, {
      'endgame.active': true, 'endgame.started': game.S.day, 'endgame.vendetta': true, 'endgame.intro': true,
    })
    // сирота: одна реплика посредника без карточки — как после закрытия вкладки посреди просьбы
    game.S.msgs.push({ kind: 'text', from: 'alik', who: 'mama', text: LEND50_VENDETTA_ASK[0], id: game.S.nextId++, time: '12:00' })
    game.save()

    const { game: again } = makeGame({ storage })
    await flush()

    const text = messages(again)
    expect(text.filter((x) => x === LEND50_VENDETTA_ASK[0]), 'подводка не задвоилась').toHaveLength(1)
    expect(again.S.msgs.filter((m) => m.kind === 'lend50'), 'карточка одна').toHaveLength(1)
    expect(again.S.mem['lend50.asked']).toBe(true)
    expect(again.choices.map((c) => c.act)).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
  })

  it('в эпилоге вражды нет тёплых соседей Дня выплаты: ни «как родные», ни шкатулки (#1557)', async () => {
    const { game } = makeGame()
    await toVendettaEpilogue(game, 'keep')
    // только транскрипт группы вражды: до него в партии свои реплики, и они тут не проверяются
    const from = game.S.msgs.findIndex((m) => m.kind === 'sys' && m.text.includes(ENDGAME_VENDETTA_GROUP))
    expect(from, 'группа вражды в ленте').toBeGreaterThanOrEqual(0)
    for (let i = 0; i < 6; i++) await game.endgameFormality()
    await game.send(game.choices.find((c) => c.act === 'endgameMute')!)
    await game.send(game.choices.find((c) => c.act === 'endgameLeave')!)

    const text = messages(game, from).join('\n')
    for (const warm of ['разойдёмся как родные', 'ВЫПЛАТА ЗАКРЫТА', 'шкатул', 'хорошему мальчику', 'Пятьдесят рублей']) {
      expect(text, warm).not.toContain(warm)
    }
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
