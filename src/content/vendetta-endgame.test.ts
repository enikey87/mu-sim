// Терминальность «Вендетты» (#1556): после её экрана партия уходит в свой эпилог вражды,
// День выплаты для грубого пути не наступает ни до, ни после схода. Извинение в живом окне
// (пока сход не стал экраном) — полный выход: снимает и холодную войну, и вражду.
// Содержимое эпилога (#1557): акт приёма-передачи обид, просьба «займи 50» через маму, своя колода
// отключения уведомлений; тёплые соседи группы выплаты в группу вражды не заходят.
import { describe, expect, it } from 'vitest'
import { makeGame, flush, memStorage } from '../test/helpers'
import {
  ENDGAME_GROUP, ENDGAME_MUTE, ENDGAME_VENDETTA_ACT, ENDGAME_VENDETTA_ACT_SIGNED, ENDGAME_VENDETTA_ASK,
  ENDGAME_VENDETTA_FORMALITIES, ENDGAME_VENDETTA_GROUP, ENDGAME_VENDETTA_LEAVE, ENDGAME_VENDETTA_MUTE,
  ENDGAME_VENDETTA_RENAMES, LEND50_LINK, LEND50_SYS,
} from './endgame'
import { CHRONIC_RUDE_AFTER_VENDETTA, ENDING_MIN_DAY } from './finales'
import type { Game } from '../engine/game'
import type { Msg } from '../engine/state'

const messages = (game: Game, from = 0) =>
  game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))
const cards = (game: Game, from = 0) =>
  game.S.msgs.slice(from).filter((m): m is Extract<Msg, { kind: 'lend50' }> => m.kind === 'lend50')
const pick = async (game: Game, act: string) => {
  const choice = game.choices.find((c) => c.act === act)
  expect(choice, act).toBeDefined()
  await game.send(choice!)
}
/** Просьба вражды отвечена: три кнопки группы вернулись. */
const answerVendettaAsk = (game: Game) => pick(game, 'lend50Serious')

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
    // просьба своя: её говорит мама (#1557), поэтому сразу после вступления — ответы на неё
    expect(game.S.mem['lend50.asked'], 'просьба вражды прозвучала').toBe(true)
    expect(game.choices.map((c) => c.act)).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
    await answerVendettaAsk(game)
    expect(game.choices.map((c) => c.act)).toEqual(['endgameMoney', 'endgameMute', 'endgameLeave'])
    expect(game.choices.map((c) => c.text)).toEqual(['Где извинения?', 'Отключить уведомления', 'Выйти из группы'])
  })

  it('«Где извинения?» отвечает враждой, а не деньгами: архива и пула выплаты в группе нет', async () => {
    const { game } = makeGame()
    await toVendettaEpilogue(game)
    await answerVendettaAsk(game)
    const from = game.S.msgs.length

    await pick(game, 'endgameMoney')

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
    // в живом сходе текст принимается напрямую (#1565); сцена ритуала проверяется своим входом:
    // её выход обязан снять оба флага, а не половину (#1556)
    Object.assign(game.S.mem, { vendetta: true, coldWar: true })
    await game.enterNode('ritual', 'ask')
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

describe('эпилог вражды: акт обид и донат через посредника (#1557)', () => {
  it('после группы — акт приёма-передачи обид: подпись системной строкой, финал «вражда навсегда» до просьбы', async () => {
    const { game } = makeGame()
    const from = game.S.msgs.length

    await toVendettaEpilogue(game)

    const text = messages(game, from)
    const at = (line: string) => text.indexOf(line)
    // реплика схода — из самого экрана концовки; эпилог начинается с баннера
    const banner = at('—— Эпилог ——')
    expect(banner).toBeGreaterThan(0)
    expect(text[banner + 1]).toBe(`Алик создал группу «${ENDGAME_VENDETTA_GROUP}»`)
    expect(text[banner + 2]).toBe('Алик добавил вас')
    // акт идёт после вступления группы и до просьбы, последней репликой — «вражда навсегда»
    expect(at(ENDGAME_VENDETTA_ACT[0])).toBeGreaterThan(banner + 2)
    expect(at(ENDGAME_VENDETTA_ACT[1])).toBeGreaterThan(at(ENDGAME_VENDETTA_ACT[0]))
    const signed = at('Вы подписали акт приёма-передачи обид')
    expect(signed).toBeGreaterThan(at(ENDGAME_VENDETTA_ACT[1]))
    expect(at(ENDGAME_VENDETTA_ACT_SIGNED)).toBe(signed + 1)
    expect(at(ENDGAME_VENDETTA_ASK[0])).toBeGreaterThan(at(ENDGAME_VENDETTA_ACT_SIGNED))
    expect(text.join(' ')).toContain('вражда — навсегда')
  })

  it('просит мама Алика: три реплики, «Верну. Ты меня знаешь» — последняя перед карточкой', async () => {
    const { game } = makeGame()
    const from = game.S.msgs.length

    await toVendettaEpilogue(game)

    const ask = game.S.msgs.slice(from).filter((m) => m.kind === 'text' && m.who === 'mama')
    expect(ask.map((m) => (m as { text: string }).text)).toEqual([...ENDGAME_VENDETTA_ASK])
    expect(ENDGAME_VENDETTA_ASK.at(-1)).toContain('Верну. Ты меня знаешь')
    expect(ENDGAME_VENDETTA_ASK).toHaveLength(3)
    const all = game.S.msgs.slice(from)
    const cardAt = all.findIndex((m) => m.kind === 'lend50')
    expect(cardAt).toBeGreaterThan(0)
    // карточка — сразу за «Верну»: между ними только она сама
    const beforeCard = all.slice(0, cardAt).flatMap((m) => (m.kind === 'text' ? [m.text] : []))
    expect(beforeCard.at(-1)).toBe(ENDGAME_VENDETTA_ASK.at(-1))
    expect(cards(game, from)).toHaveLength(1)
    expect(cards(game, from)[0]).toMatchObject({ text: LEND50_SYS, link: LEND50_LINK })
    // просьбу отвечают теми же тремя кнопками, что в группе выплаты
    expect(game.choices.map((c) => c.act)).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
    expect(game.S.mem['endgame.vendetta'], 'просьба не отменяет эпилог').toBe(true)
  })

  it('ответ на просьбу не подтверждает «оплату» вражды: деньги и долг не двигаются, вражда остаётся', async () => {
    const { game } = makeGame()
    await toVendettaEpilogue(game)
    const money = game.S.money
    const debt = game.S.debt
    const from = game.S.msgs.length

    await pick(game, 'lend50Yes')

    expect(game.S.mem['lend50.answer']).toBe('yes')
    expect([game.S.money, game.S.debt]).toEqual([money, debt])
    expect(game.S.mem.vendetta).toBe(true)
    expect(game.S.mem['endgame.vendetta']).toBe(true)
    expect(game.S.ending, 'вражда не кончается ответом').toBeNull()
    expect(messages(game, from).join(' ')).not.toMatch(/Вам перевод|Возврат/)
    expect(game.choices.map((c) => c.act)).toEqual(['endgameMoney', 'endgameMute', 'endgameLeave'])
  })

  it('отключение уведомлений в группе вражды отвечает своей колодой, а не тёплой колодой выплаты', async () => {
    const { game } = makeGame()
    await toVendettaEpilogue(game)
    await answerVendettaAsk(game)
    const from = game.S.msgs.length

    await pick(game, 'endgameMute')

    const said = messages(game, from)
    expect(said.some((t) => ENDGAME_VENDETTA_MUTE.includes(t)), said.join(' | ')).toBe(true)
    expect(said.some((t) => ENDGAME_MUTE.includes(t)), 'тёплых соседей выплаты здесь нет').toBe(false)
    expect(game.choices.map((c) => c.act)).toEqual(['endgameMoney', 'endgameMute', 'endgameLeave'])
  })

  it('тёплые соседи группы выплаты в эпилог вражды не заходят: «как родные» и примирение — не его слова', async () => {
    const { game } = makeGame()
    const from = game.S.msgs.length
    await toVendettaEpilogue(game)
    await answerVendettaAsk(game)
    for (const act of ['endgameMoney', 'endgameMute', 'endgameLeave']) await pick(game, act)
    for (let i = 0; i < 3; i++) await game.endgameFormality()

    const warm = /как родн|разойдёмся|теплот|обним|помири|прощаем/i
    const text = messages(game, from).join(' ')
    expect(text).not.toMatch(warm)
    // и ни один пул вражды не несёт тёплой строки: НК — вставили «как родные» в пул, тест красный
    const pools = [ENDGAME_VENDETTA_ACT, ENDGAME_VENDETTA_ASK, ENDGAME_VENDETTA_MUTE, ENDGAME_VENDETTA_FORMALITIES, ENDGAME_VENDETTA_LEAVE, ENDGAME_VENDETTA_RENAMES]
    expect(pools.flat().filter((line) => warm.test(line))).toEqual([])
    // память «ты мне 50 давал» — строка группы выплаты: во вражде её нет даже после ответа
    expect(messages(game, from).join(' ')).not.toMatch(/50 давал/)
  })

  it('двадцать ходов бота во вражде: цикл живёт, выплаты и тёплых строк нет', async () => {
    const { game } = makeGame()
    await toVendettaEpilogue(game)
    await answerVendettaAsk(game)
    const from = game.S.msgs.length

    const { botTurn } = await import('../tools/bot')
    for (let i = 0; i < 20; i++) await botTurn(game)

    const text = messages(game, from).join(' ')
    expect(text).not.toMatch(/как родн|разойдёмся|теплот|обним|помири|прощаем/i)
    expect(text).not.toMatch(/Пятьдесят рублей|День выплаты/)
    expect(game.S.mem['endgame.vendetta']).toBe(true)
    expect(game.choices.map((c) => c.act)).toEqual(['endgameMoney', 'endgameMute', 'endgameLeave'])
  })

  it('перезагрузка посреди просьбы вражды доигрывает её: обрывок мамы снят, карточка одна', async () => {
    const storage = memStorage()
    const { game } = makeGame({ storage })
    game.S.mem['endgame.active'] = true
    game.S.mem['endgame.started'] = game.S.day
    game.S.mem['endgame.vendetta'] = true
    game.S.mem['endgame.intro'] = true
    // сирота: первая реплика просьбы без карточки — как после закрытия вкладки посреди подводки
    game.alikMsg({ kind: 'text', from: 'alik', text: ENDGAME_VENDETTA_ASK[0], who: 'mama' })
    game.save()

    const { game: again } = makeGame({ storage })
    await flush()

    const text = again.S.msgs.flatMap((m) => (m.kind === 'text' ? [m.text] : []))
    expect(text.filter((x) => x === ENDGAME_VENDETTA_ASK[0])).toHaveLength(1)
    expect(again.S.mem['lend50.asked']).toBe(true)
    expect(cards(again)).toHaveLength(1)
    expect(text.filter((x) => x === ENDGAME_VENDETTA_ASK[0]).length).toBe(1)
    expect(again.choices.map((c) => c.act)).toEqual(['lend50Yes', 'lend50Serious', 'lend50No'])
  })
})
