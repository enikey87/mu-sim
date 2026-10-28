// Окно отклика на предложение Карине (#1471): 7-я серия Рубика — прямое «Скажи, что подождёшь»,
// а следующий блок был полностью генерик. Пары #920 жили в общем `Talk_arc` (bonus 2) и проигрывали
// слот муэну и звонку с объекта: в трёх партиях из трёх отклик не выпал ни разу. Механизм — как у
// семейства окон #1292/#1382/#1413: строка серии штампует ход события, `<событие>Fresh` открывает оффер
// `Opt_RubikProposal`, отвечает тот же `talk` по номеру пары, который тратит пару (`TALK:arc:rubik:*`).
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { ARCS } from './arcs'
import { crewPaid, crewPaidAt, muenAt, rubikProposalAt } from './memkeys'

/** Пары #920 в порядке пула: окно показывает по строке за ход, ответ идёт по выбранной строке. */
const QUESTIONS = [
  'Карине, решай сама. Акт — сразу.',
  'Жену на акт менять? Она дороже.',
  'Подожду. Но сначала пусть подпишет акт.',
]
const ANSWERS = [
  'Решай. Я женой не торгую. Я просто акт жду.',
  'Дороже. Поэтому и прошу подождать.',
  'Сначала акт, потом деньги. Я слово держу, когда его держит бумага.',
]

const frame = (game: Game) => { game.S.choices = null; return game.buildChoices() }
const proposalBtn = (game: Game) => frame(game).find((c) => c.act === 'talk' && QUESTIONS.includes(c.text))

/** Настоящий путь серии: 6-я серия знакомит с Карине, 7-я — предложение и просьба «Скажи, что подождёшь». */
const meetProposal = async (game: Game) => {
  game.S.arcs.rubik = { i: 5, last: game.S.day - 5 }
  await game.playArc('rubik')
  expect(game.S.mem['intro.karine'], 'знакомства с Карине нет — пары гейтнуты').toBe(true)
  game.S.arcs.rubik = { i: 6, last: game.S.day - 1 }
  await game.playArc('rubik')
  expect(game.S.mem[rubikProposalAt], 'строка предложения не штампует ход события').toBeDefined()
}

/** Конкуренты, названные в #1471: открытая ложь (11), окно муэна (7) и звонка с объекта (7). */
const openCompetitors = async (game: Game) => {
  await game.playEpisode(ARCS.nune.eps[3], 'nune')
  game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в Дубае.' }, ['money_dubai'])
  expect(game.facts().lieOpen, 'ложь не открылась — конкурент пуст').toBe(true)
  game.S.mem[muenAt] = game.S.stats.sent
  game.S.mem[crewPaid] = true
  game.S.mem[crewPaidAt] = game.S.stats.sent
}

describe('предложение Карине открывает окно отклика (#1471)', () => {
  it('ход серии штампуется, и на этом ходу в блоке есть отклик из пар #920', async () => {
    const { game } = makeGame({ seed: 1 })
    await meetProposal(game)
    expect(Number(game.S.mem[rubikProposalAt]), 'штамп не несёт ход события').toBe(game.S.stats.sent)
    const btn = proposalBtn(game)
    expect(btn, 'на ходу просьбы отклика нет — предложение повисает').toBeDefined()
    expect(QUESTIONS, `кнопка вне пар #920: ${btn!.text}`).toContain(btn!.text)
  })

  it('отклик попадает в блок и при открытых окнах муэна, звонка и ловли лжи', async () => {
    const { game } = makeGame({ seed: 1 })
    await openCompetitors(game)
    await meetProposal(game)
    const live = game.rules.collect({ event: 'BuildChoices' }, game.facts()).map((r) => r.name)
    expect(live, `конкуренты не открылись: ${live.join(', ')}`)
      .toEqual(expect.arrayContaining(['Opt_CatchLie', 'Opt_Muen', 'Opt_CrewPaid', 'Opt_RubikProposal']))
    const block = frame(game)
    const texts = block.map((c) => c.text)
    expect(texts, `одна и та же пара встала в блок дважды: ${texts.join(' → ')}`).toEqual([...new Set(texts)])
    expect(block.some((c) => c.act === 'catchLie'), 'ловля лжи вытеснена — проверка пустеет').toBe(true)
    expect(block.map((c) => c.text).filter((t) => QUESTIONS.includes(t)), 'отклик на предложение проиграл слот').toHaveLength(1)
  })

  it('окно — ход события и три после; внутри окна строка не повторяется, за окном отклика нет', async () => {
    const { game } = makeGame({ seed: 1 })
    await meetProposal(game)
    const at = Number(game.S.mem[rubikProposalAt])
    const offered: string[] = []
    for (let turn = 0; turn <= 3; turn++) {
      game.S.stats.sent = at + turn
      const btn = proposalBtn(game)
      if (btn) offered.push(btn.text)
    }
    expect(offered.length, 'окно предложения ничего не предложило — проверка пустеет').toBeGreaterThan(0)
    expect(offered.every((t) => QUESTIONS.includes(t)), `кнопка вне пар #920: ${offered.join(' | ')}`).toBe(true)
    expect(offered, `вопрос пары повторился внутри окна: ${offered.join(' → ')}`).toEqual([...new Set(offered)])
    // граница окна — по факту события, а не по размеру пула
    game.S.stats.sent = at + 3
    expect(game.facts().rubikProposalFresh, 'третий ход после предложения — уже вне окна').toBe(true)
    game.S.stats.sent = at + 4
    expect(game.facts().rubikProposalFresh, 'окно живёт дольше трёх ходов').toBe(false)
    // к следующему ходу игрока контекст серии уже стёрт (`alikTurn`), поэтому пары #920 не может
    // предложить и общий `Talk_arc`: отклика нет по любой причине, а не только по штампу
    game.S.ctx = null
    expect(proposalBtn(game), 'окно живёт дольше трёх ходов после предложения').toBeUndefined()
  })

  it('ответ идёт по выбранной паре, тратит её и больше не предлагается', async () => {
    const { game } = makeGame({ seed: 1 })
    await meetProposal(game)
    const btn = proposalBtn(game)!
    const index = QUESTIONS.indexOf(btn.text)
    const from = game.S.msgs.length
    await game.send(btn as never)
    const said = game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    expect(said, 'ответа Алика на предложение нет').toContain(ANSWERS[index])
    expect(game.lines.has(`TALK:arc:rubik:${index}`), 'ответ не потратил пару #920').toBe(true)
    for (let i = 0; i < 10; i++) {
      game.S.choices = null
      expect(game.buildChoices().some((c) => c.text === btn.text), 'потраченная пара вернулась в блок').toBe(false)
    }
  })
})
