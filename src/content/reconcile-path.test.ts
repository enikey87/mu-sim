// #1565: путь примирения из живого схода (вражды) обязан быть достижим.
// Механики, из-за которых он не работал: текст кнопки не читался классификатором; прямое извинение
// тонуло под ритуалом и подсказками блока; кнопки посредника в сходе не предлагались; у поздней
// вендетты флаг и терминальный экран вставали одним ходом.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { HEAT, vendettaAt } from './memkeys'
import { VENDETTA_GRACE_TURNS, ENDING_MIN_DAY } from './finales'
import { valueOf } from './fact'
import { SWING } from './misc'

const CRY = { text: 'АЛИК!!! ТЫ ВРЁШЬ!!!', tone: 'rude' as const }
const APOLOGY = 'Прости, Алик, я погорячился'
const calmer = { text: 'Понял. Молчу.', tone: 'neutral' as const }
const lastAlik = (game: Game): string => {
  const m = [...game.S.msgs].reverse().find((x) => x.kind === 'text' && x.from === 'alik')
  return m && m.kind === 'text' ? m.text : ''
}
/** Сход объявлен своим путём: 15-й крик за партию без извинений. */
const toVendetta = async (game: Game): Promise<void> => {
  Object.assign(game.S.mem, { 'count.rude': 14, 'rude.heat': 5 })
  await game.send(CRY)
  expect(game.S.mem.vendetta, '15-й крик не объявил сход').toBe(true)
}
/** Кнопки посредника в одном кадре выбора. */
const via = (game: Game) => {
  game.S.choices = null
  return game.choices.filter((c) => c.act === 'via')
}

describe('примирение в живом сходе (#1565)', () => {
  it('свободный текст «прости» принимается: оба флага сняты, лестница погашена, ритуала нет', async () => {
    const { game } = makeGame({ debug: true })
    await toVendetta(game)
    game.S.mem[HEAT] = 3 // в старой лестнице такой жар отправлял извинение в ритуал

    await game.send(APOLOGY)

    expect(game.ui.trace.find((t) => t.event === 'PlayerSays')?.chosen, 'извинение ушло не в принятие').toEqual(['Says_sorry_vendetta'])
    expect(game.S.mem.vendetta, 'сход снят').toBe(false)
    expect(game.S.mem.coldWar, 'холодная война кончена').toBe(false)
    expect(game.facts()[HEAT], 'мир погасил лестницу').toBe(0)
    expect(game.S.scene?.id, 'ритуал не перекрыл принятый мир').toBeUndefined()
    // режим вражды кончился: её сюжетные биты больше не претендуют на ход — мир вернулся к обычному потоку
    expect(game.rules.collect({ event: 'StoryBeat' }, game.facts()).some((r) => r.name.startsWith('Beat_Enmity')), 'вражда осталась режимом').toBe(false)
  })

  it('кнопка с извиняющимся текстом без своего act читается как извинение', async () => {
    const { game } = makeGame()
    game.S.mem.vendetta = true
    game.S.mem.coldWar = true
    game.S.mem[HEAT] = 3

    // вариант из P_SORRY, отправленный как кнопка без act (драйвер плейтеста терял act): текст — извинение
    await game.send({ text: 'Ладно, я перегнул.', tone: 'polite' })

    expect(game.S.mem.vendetta, 'клик по извинению не снял сход').toBe(false)
    expect(game.facts()[HEAT]).toBe(0)
  })

  it('кнопка без act с просьбой о деньгах извинением не становится (НК к чтению текста)', async () => {
    const { game } = makeGame()
    game.S.mem.vendetta = true
    game.S.mem.coldWar = true
    await game.send({ text: 'Верни деньги до пятницы', tone: 'neutral' })
    expect(game.S.mem.vendetta, 'просьба о деньгах сняла сход').toBe(true)
  })

  it('принятое извинение снимает и блок: «принято» и «не доставлено» не спорят', async () => {
    const { game } = makeGame()
    game.S.mem.vendetta = true
    game.S.mem.coldWar = true
    game.S.mem.blocked = true
    game.S.mem[HEAT] = 3

    expect((await game.fire('PlayerSays', { intent: 'sorry' }))?.name).toBe('Says_sorry_vendetta')
    expect(game.S.mem.blocked, 'блок остался при принятом мире').toBe(false)
    expect(game.S.mem.vendetta).toBe(false)
    expect(game.S.msgs.some((m) => m.kind === 'sys' && m.text === 'Алик Воздухонесян разблокировал вас'), 'разблокировка не названа').toBe(true)
  })

  it('третье извинение за шесть ходов — «качели», но мир всё равно наступает', async () => {
    const { game } = makeGame()
    game.S.mem.vendetta = true
    game.S.mem.coldWar = true
    game.S.mem[HEAT] = 3
    game.S.stats.sent = 10
    game.S.mem['sorryAt'] = '8,9,10' // три извинения в окне шести ходов

    await game.send(APOLOGY)

    expect(SWING.map(valueOf), '«качели» отдали не свою строку').toContain(lastAlik(game))
    expect(game.S.mem.vendetta).toBe(false)
    expect(game.S.mem.coldWar).toBe(false)
  })

  it('без схода правило молчит: обычное извинение идёт прежней лестницей (ноль диффа)', async () => {
    const a = makeGame().game
    a.S.mem[HEAT] = 0
    expect((await a.fire('PlayerSays', { intent: 'sorry' }))?.name, 'извинение без схода').toBe('Says_sorry')
    const b = makeGame().game
    b.S.mem[HEAT] = 3
    expect((await b.fire('PlayerSays', { intent: 'sorry' }))?.name, 'извинение после серии криков').toBe('Says_sorry_ritual')
  })

  it('кнопки посредника в сходе возвращаются не реже раза в пять ходов', async () => {
    const { game } = makeGame()
    game.S.mem.vendetta = true
    game.S.mem.coldWar = true
    const frames: number[] = []
    for (let i = 0; i < 16; i++) {
      if (via(game).length) frames.push(i)
      game.S.stats.sent++
    }
    expect(frames.length, 'посредник не предложен ни разу').toBeGreaterThan(0)
    expect(frames[0], 'первый кадр выбора уже без посредника').toBeLessThanOrEqual(5)
    for (let i = 1; i < frames.length; i++) expect(frames[i]! - frames[i - 1]!, `разрыв в показах: ${frames[i - 1]} → ${frames[i]}`).toBeLessThanOrEqual(5)
  })

  it('посредник в сходе — лучший из доступных: Борис, если он уже в истории', async () => {
    const { game } = makeGame()
    game.S.mem.vendetta = true
    game.S.arcs.boris = { i: 4, last: 0 }
    expect(via(game).map((c) => c.arg), 'не Борис при живом Борисе').toEqual(['boris'])
  })

  it('поздний сход: экран ждёт окно, извинение в окне спасает', async () => {
    const { game } = makeGame()
    game.S.day = ENDING_MIN_DAY // третий акт: без окна экран встал бы этим же ходом
    game.S.stats.sent = 100
    await toVendetta(game)
    expect(game.S.mem[vendettaAt], 'ход объявления схода не записан').toBe(game.S.stats.sent)
    expect(game.S.ending, 'экран схода встал в ход объявления').toBeNull()

    for (let i = 0; i < VENDETTA_GRACE_TURNS - 1; i++) await game.send(calmer)
    expect(game.S.ending, 'окно примирения уже кончилось').toBeNull()

    await game.send(APOLOGY)
    expect(game.S.mem.vendetta, 'извинение в окне не спасло').toBe(false)
    for (let i = 0; i < 3; i++) await game.send(calmer)
    expect(game.S.ending, 'мир в окне не отменил сход').toBeNull()
  })

  it('поздний сход без извинения: экран встаёт после окна, а не в тот же ход', async () => {
    const { game } = makeGame()
    game.S.day = ENDING_MIN_DAY
    game.S.stats.sent = 100
    await toVendetta(game)
    expect(game.S.ending).toBeNull()
    for (let i = 0; i < VENDETTA_GRACE_TURNS; i++) await game.send(calmer)
    expect(game.S.ending, 'экран не дождался конца окна').toBe('vendetta')
  })

  it('ранняя вражда окном не открывает финал раньше третьего акта', async () => {
    const { game } = makeGame()
    await toVendetta(game)
    for (let i = 0; i < VENDETTA_GRACE_TURNS + 2; i++) await game.send(calmer)
    expect(game.S.day, 'партия ещё не в третьем акте').toBeLessThan(ENDING_MIN_DAY)
    expect(game.S.ending, 'ранний сход получил терминальный экран').toBeNull()
  })

  it('после терминального экрана правило схода молчит (эпилог не примиряется)', async () => {
    const { game } = makeGame()
    Object.assign(game.S.mem, { vendetta: true, coldWar: true, 'endgame.active': true, 'endgame.vendetta': true })
    expect((await game.fire('PlayerSays', { intent: 'sorry' }))?.name).not.toBe('Says_sorry_vendetta')
  })
})
