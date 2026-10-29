// «Кровный враг» — терминальная концовка (#1571): после её экрана партия уходит в собственный
// эпилог отлучения, а не живёт дальше чекпоинтом. В отличие от «Вендетты» (#1556/#1557), где
// вражда бюрократическая и её просит мама, здесь род вычеркнул игрока: мама отвернулась, из группы
// все вышли, Алик ничего не просит. Окно извинения закрыто экраном концовки: после него — «не согласовано».
import { describe, expect, it } from 'vitest'
import { makeGame, flush, memStorage } from '../test/helpers'
import {
  ENDGAME_BLOODFEUD_APOLOGY, ENDGAME_BLOODFEUD_CHOICES, ENDGAME_BLOODFEUD_DONATE, ENDGAME_BLOODFEUD_FORMALITIES,
  ENDGAME_BLOODFEUD_GROUP, ENDGAME_BLOODFEUD_LEAVE, ENDGAME_BLOODFEUD_LEAVERS, ENDGAME_BLOODFEUD_MUTE,
  ENDGAME_BLOODFEUD_OPEN, ENDGAME_BLOODFEUD_RENAMES, ENDGAME_GROUP, ENDGAME_MUTE,
  ENDGAME_VENDETTA_ACT, ENDGAME_VENDETTA_ACT_SIGNED, ENDGAME_VENDETTA_APOLOGY, ENDGAME_VENDETTA_ASK,
  ENDGAME_VENDETTA_FORMALITIES, ENDGAME_VENDETTA_GROUP, ENDGAME_VENDETTA_LEAVE, ENDGAME_VENDETTA_MUTE,
  ENDGAME_VENDETTA_OPEN, ENDGAME_VENDETTA_RENAMES, EPILOGUE_BANNER, LEND50_SYS,
} from './endgame'
import { CHRONIC_RUDE_AFTER_VENDETTA } from './finales'
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

/** Партия добрала хронику после схода: экран «Кровного врага» сыгран и закрыт. */
async function toBloodfeudEpilogue(game: Game): Promise<void> {
  game.S.mem.vendetta = true
  game.S.mem['count.rudeAfterVendetta'] = CHRONIC_RUDE_AFTER_VENDETTA
  await game.fire('CheckEnding')
  expect(game.S.ending, 'экран «Кровного врага»').toBe('bloodfeud')
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

describe('«Кровный враг» — терминальная концовка грубого пути (#1571)', () => {
  it('после экрана открывается эпилог отлучения, а не День выплаты и не группа вражды', async () => {
    const { game } = makeGame()
    const from = game.S.msgs.length

    await toBloodfeudEpilogue(game)

    const text = messages(game, from).join(' ')
    expect(game.S.mem['endgame.active'], 'мир заморожен').toBe(true)
    expect(game.S.mem['endgame.bloodfeud'], 'поток — отлучение').toBe(true)
    expect(game.S.mem['endgame.vendetta'], 'чужой поток не включён').toBeFalsy()
    expect(text).toContain(ENDGAME_BLOODFEUD_GROUP)
    expect(text).not.toContain(ENDGAME_VENDETTA_GROUP)
    expect(text).not.toContain(ENDGAME_GROUP)
    expect(text, 'День выплаты не наступил').not.toMatch(/День выплаты/)
    // просьбы нет: донат-слот обрамляет игра, кнопки группы доступны сразу
    expect(game.S.mem['lend50.asked'], 'карточка автора на месте').toBe(true)
    expect(cards(game, from)).toHaveLength(1)
    expect(game.choices.map((c) => c.act)).toEqual(ENDGAME_BLOODFEUD_CHOICES.map((c) => c.act))
    expect(game.choices.map((c) => c.text)).toEqual(['Где извинения?', 'Отключить уведомления', 'Выйти из группы'])
  })

  it('вступление: баннер, группа, добавление, последнее слово Алика и уход рода — без запроса «займи 50»', async () => {
    const { game } = makeGame()
    const from = game.S.msgs.length

    await toBloodfeudEpilogue(game)

    const text = messages(game, from)
    const at = (line: string) => text.indexOf(line)
    const banner = at(EPILOGUE_BANNER)
    expect(banner, 'эпилог начинается с баннера').toBeGreaterThan(0)
    expect(text[banner + 1]).toBe(`Алик создал группу «${ENDGAME_BLOODFEUD_GROUP}»`)
    expect(text[banner + 2]).toBe('Алик добавил вас')
    expect(at(ENDGAME_BLOODFEUD_OPEN[0])).toBeGreaterThan(banner + 2)
    expect(at(ENDGAME_BLOODFEUD_OPEN.at(-1)!)).toBeGreaterThan(at(ENDGAME_BLOODFEUD_OPEN[0]))
    expect(at(ENDGAME_BLOODFEUD_LEAVERS[0]), 'мама отвернулась').toBeGreaterThan(at(ENDGAME_BLOODFEUD_OPEN.at(-1)!))
    expect(at(ENDGAME_BLOODFEUD_LEAVERS[1]), 'Алик ушёл').toBe(at(ENDGAME_BLOODFEUD_LEAVERS[0]) + 1)
    expect(at(ENDGAME_BLOODFEUD_DONATE[0]), 'донат-слот после ухода рода').toBeGreaterThan(at(ENDGAME_BLOODFEUD_LEAVERS[1]))
    // карточка одна и та же, что в группе выплаты; просьбы Алика и мамы в этом потоке нет
    expect(cards(game, from)[0]).toMatchObject({ text: LEND50_SYS })
    expect(text.some((t) => ENDGAME_VENDETTA_ASK.includes(t)), 'мама-посредница не просит').toBe(false)
    expect(game.choices.some((c) => (c.act ?? '').startsWith('lend50')), 'кнопок просьбы нет').toBe(false)
  })

  it('эпилог отлучения уникален: ни одна его строка не повторяет строки эпилога вражды', async () => {
    const bloodfeud = [
      ...ENDGAME_BLOODFEUD_OPEN, ...ENDGAME_BLOODFEUD_LEAVERS, ...ENDGAME_BLOODFEUD_DONATE, ...ENDGAME_BLOODFEUD_APOLOGY,
      ...ENDGAME_BLOODFEUD_FORMALITIES, ...ENDGAME_BLOODFEUD_MUTE, ...ENDGAME_BLOODFEUD_RENAMES, ...ENDGAME_BLOODFEUD_LEAVE,
    ]
    const vendetta = [
      ...ENDGAME_VENDETTA_OPEN, ...ENDGAME_VENDETTA_ACT, ENDGAME_VENDETTA_ACT_SIGNED, ...ENDGAME_VENDETTA_APOLOGY,
      ...ENDGAME_VENDETTA_ASK, ...ENDGAME_VENDETTA_FORMALITIES, ...ENDGAME_VENDETTA_MUTE, ...ENDGAME_VENDETTA_RENAMES, ...ENDGAME_VENDETTA_LEAVE,
    ]
    const shared = bloodfeud.filter((line) => vendetta.includes(line))
    expect(shared, 'копирование строк «Вендетты»').toEqual([])
    expect(new Set(bloodfeud).size, 'строки внутри пула не дублируются').toBe(bloodfeud.length)

    const { game } = makeGame()
    const from = game.S.msgs.length
    await toBloodfeudEpilogue(game)
    const text = messages(game, from).join(' ')
    expect(text).not.toContain('ВРАЖДА ЗАКРЫТА')
    expect(text).not.toContain('акт приёма-передачи обид')
  })

  it('«Где извинения?» после экрана — «не согласовано», а не примирение', async () => {
    const { game } = makeGame()
    await toBloodfeudEpilogue(game)
    const from = game.S.msgs.length

    await pick(game, 'endgameMoney')

    const lines = messages(game, from)
    const answer = lines.join(' ')
    expect(answer).toMatch(/не согласован/i)
    expect(lines.some((t) => ENDGAME_BLOODFEUD_APOLOGY.includes(t)), 'ответ из колоды отлучения').toBe(true)
    expect(ENDGAME_VENDETTA_APOLOGY.some((t) => answer.includes(t)), 'чужой колоды извинений нет').toBe(false)
    expect(answer).not.toMatch(/выплат|рубл|деньг/i)
  })

  it('свободное извинение после экрана тоже не принимается и не чистит флаги', async () => {
    const { game } = makeGame()
    await toBloodfeudEpilogue(game)
    const from = game.S.msgs.length

    await game.send({ text: 'Прости, брат. Я был неправ.', tone: 'polite', act: 'sorry' })

    const answer = messages(game, from).join(' ')
    expect(answer).toMatch(/не согласован/i)
    expect(game.S.mem.vendetta, 'вражда не снята').toBe(true)
    expect(game.S.mem['endgame.bloodfeud'], 'эпилог продолжается').toBe(true)
    expect(game.S.mem['count.sorry'], 'извинение не зачтено').toBeFalsy()
    expect(game.choices.map((c) => c.act)).toEqual(ENDGAME_BLOODFEUD_CHOICES.map((c) => c.act))
  })

  it('действия группы говорят колодой тишины: чужой войны и тёплой выплаты в ней нет', async () => {
    const { game } = makeGame()
    await toBloodfeudEpilogue(game)
    await pick(game, 'endgameMoney')
    const from = game.S.msgs.length

    await pick(game, 'endgameMute')
    await pick(game, 'endgameLeave')
    await game.endgameFormality()

    const said = messages(game, from)
    expect(said.some((t) => ENDGAME_BLOODFEUD_MUTE.includes(t)), said.join(' | ')).toBe(true)
    expect(said.some((t) => ENDGAME_BLOODFEUD_LEAVE.includes(t)), said.join(' | ')).toBe(true)
    expect(said.some((t) => ENDGAME_BLOODFEUD_FORMALITIES.includes(t)), said.join(' | ')).toBe(true)
    expect(said.some((t) => ENDGAME_VENDETTA_MUTE.includes(t) || ENDGAME_VENDETTA_LEAVE.includes(t) || ENDGAME_VENDETTA_FORMALITIES.includes(t))).toBe(false)
    expect(said.some((t) => ENDGAME_MUTE.includes(t)), 'тёплых соседей выплаты здесь нет').toBe(false)
    expect(said.join(' ')).not.toMatch(/Алик изменил название|Алик добавил вас обратно/)
  })

  it('День выплаты и «Параллельная вселенная» после отлучения недоступны', async () => {
    const { game } = makeGame()
    await toBloodfeudEpilogue(game)
    readyForPayday(game)

    expect(paydayRulesFor(game), 'ни одного входа в День выплаты').toEqual([])
    expect((await game.fire('StoryBeat'))?.name).toBe('Endgame_Formality')

    game.S.day = 900
    game.S.stats.sent = 400
    expect((await game.fire('CheckEnding'))?.name).toBe('Endgame_NoEnding')
    expect(game.S.ending, 'выхода из эпилога отлучения нет').toBeNull()
  })

  it('перезагрузка посреди донат-слота доигрывает его: рамка одна, карточка одна', async () => {
    const storage = memStorage()
    const { game } = makeGame({ storage })
    game.S.mem['endgame.active'] = true
    game.S.mem['endgame.started'] = game.S.day
    game.S.mem['endgame.bloodfeud'] = true
    game.S.mem['endgame.intro'] = true
    // сирота: рамка автора без карточки — как после закрытия вкладки посреди слота
    game.sys(ENDGAME_BLOODFEUD_DONATE[0])
    game.save()

    const { game: again } = makeGame({ storage })
    await flush()

    const text = again.S.msgs.flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))
    expect(text.filter((x) => x === ENDGAME_BLOODFEUD_DONATE[0])).toHaveLength(1)
    expect(again.S.mem['lend50.asked']).toBe(true)
    expect(cards(again)).toHaveLength(1)
    expect(again.choices.map((c) => c.act)).toEqual(ENDGAME_BLOODFEUD_CHOICES.map((c) => c.act))
  })
})
