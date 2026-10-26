// Условие Карине «переложите нам ванную» получает своё окно отклика (#1382): сцена мира ставила только
// факт `bath.asked`, и до Дня выплаты игрок ответить на условие не мог — блок вариантов был генерик.
// Окно как у #1320/#1353: строка условия штампует ход, факт свежести открывает оффер, ответ потребляет окно
// и пишет ветку выбора (`bath.answered`), на которую опирается строка отказа в Дне выплаты (#862).
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import type { Entry } from './fact'
import type { Line } from './fact'
import { bathAsked, bathAskedAt, bathAnswered, paydayScene } from './memkeys'
import { BATH_ASK_B } from './world'
import { BATH_ANSWER, P_BATH_ASK } from './rules/player-choice-pools'
import { PAYDAY_SCENE } from './payday'

const frame = (game: Game) => { game.S.choices = null; return game.buildChoices() }
const bathBtn = (game: Game) => frame(game).find((c) => c.act === 'bathAsk')
const poolTexts = (): string[] => P_BATH_ASK.map((t) => String(t))

/** Настоящий путь условия: сцена примирения, ветка «текстом», Карине дома и уже знакома. */
const meetCondition = async (game: Game) => {
  game.S.mem['intro.karine'] = true
  game.S.mem['ritual.count'] = 2
  await game.enterNode('ritual', 'text')
  expect(game.S.mem[bathAsked], 'условие не прозвучало — проверка пустеет').toBe(true)
}

/** Строки отказа Дня выплаты, открытые сейчас (гейты проверяются до розыгрыша). */
const refuseLines = (game: Game): string[] =>
  (game.open(PAYDAY_SCENE.nodes.refuse.a as Entry<Line>[]) as Line[])
    .map((l) => (typeof l === 'string' ? l : (l as { t: string }).t))
    .filter((t) => /ванн/i.test(t))

describe('условие Карине о ванной открывает окно отклика (#1382)', () => {
  it('строка условия штампует ход, и на этом ходу в блоке есть отклик из своего пула', async () => {
    const { game } = makeGame({ seed: 1 })
    await meetCondition(game)
    expect(Number(game.S.mem[bathAskedAt]), 'строка условия не штампует свой ход').toBe(game.S.stats.sent)
    const btn = bathBtn(game)
    expect(btn, 'на ходу условия отклика нет — условие живёт без ответа').toBeDefined()
    expect(poolTexts(), `кнопка не из пула условия: ${btn!.text}`).toContain(btn!.text)
  })

  it('без факта условия отклика нет, даже если штамп стоит', async () => {
    const { game } = makeGame({ seed: 1 })
    game.S.mem[bathAskedAt] = game.S.stats.sent
    expect(bathBtn(game), 'отклик на условие звучит без самого условия').toBeUndefined()
  })

  it('окно — ход условия и три после; строки внутри окна не повторяются, за окном кнопка уходит', async () => {
    const { game } = makeGame({ seed: 1 })
    await meetCondition(game)
    const at = Number(game.S.mem[bathAskedAt])
    const offered: string[] = []
    for (let turn = 0; turn <= 3; turn++) {
      game.S.stats.sent = at + turn
      const btn = bathBtn(game)
      if (btn) offered.push(btn.text)
    }
    expect(offered.length, 'окно условия ничего не предложило — проверка пустеет').toBeGreaterThan(0)
    expect(offered.every((t) => poolTexts().includes(t)), `кнопка вне пула: ${offered.join(' | ')}`).toBe(true)
    expect(offered, `строка пула повторилась внутри окна: ${offered.join(' → ')}`).toEqual([...new Set(offered)])
    // граница окна — по факту, а не по пулу: три строки исчерпываются раньше, чем кончается окно
    game.S.stats.sent = at + 3
    expect(game.facts().bathAskFresh, 'третий ход после условия — уже вне окна').toBe(true)
    game.S.stats.sent = at + 4
    expect(game.facts().bathAskFresh, 'окно живёт дольше трёх ходов').toBe(false)
    expect(bathBtn(game), 'окно живёт дольше трёх ходов после условия').toBeUndefined()
  })

  it('окно кончается Днём выплаты: условие в дележе — уже претензия, а не вопрос', async () => {
    const { game } = makeGame({ seed: 1 })
    await meetCondition(game)
    expect(bathBtn(game), 'окно закрыто до Дня выплаты — проверка пустеет').toBeDefined()
    game.S.mem[paydayScene] = true
    expect(bathBtn(game), 'после Дня выплаты условие всё ещё предлагает ответ').toBeUndefined()
  })

  it('ответ пишет ветку выбора и потребляет окно; «в счёт долга» — единственное согласие на вычет', async () => {
    const { game } = makeGame({ seed: 1 })
    await meetCondition(game)
    const at = Number(game.S.mem[bathAskedAt])
    // окно показывает по строке за ход: «в счёт долга» найдём в пределах окна, как её найдёт игрок
    let btn: { text: string } | undefined
    for (let turn = 0; turn <= 3 && !btn; turn++) {
      game.S.stats.sent = at + turn
      const b = bathBtn(game)
      if (b && b.text === P_BATH_ASK[0]) btn = b
    }
    expect(btn, 'строка «в счёт долга» не предложена в окне — проверка пустеет').toBeDefined()
    const from = game.S.msgs.length
    await game.send(btn! as never)
    const said = game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    expect(said, `ответа Алика на условие нет`).toContain(BATH_ASK_B[0])
    expect(game.S.mem[bathAnswered], 'выбор игрока не записан веткой').toBe(BATH_ANSWER[0])
    expect(game.S.mem[bathAskedAt], 'ответ не потребил окно').toBeUndefined()
    expect(bathBtn(game), 'после ответа кнопка условия жива').toBeUndefined()
  })

  it('День выплаты опирается на выбор: «в счёт долга» — не «без твоего согласия» (#862)', () => {
    const { game } = makeGame({ seed: 1 })
    game.S.mem[bathAsked] = true
    expect(refuseLines(game).some((t) => t.includes('без твоего согласия')), 'без ответа строка отказа не звучит').toBe(true)
    game.S.mem[bathAnswered] = BATH_ANSWER[0]
    const lines = refuseLines(game)
    expect(lines.length, 'строка про ванную пропала — проверка пустеет').toBe(1)
    expect(lines[0], 'игрок сам предложил счёт в счёт — «без согласия» спорит с ним').not.toContain('без твоего согласия')
    expect(lines[0], 'строка не называет выбор игрока').toMatch(/счёт долга/)
    // отказ и вопрос о плитке согласием на вычет не являются — строка отказа остаётся прежней
    game.S.mem[bathAnswered] = BATH_ANSWER[1]
    expect(refuseLines(game).some((t) => t.includes('без твоего согласия'))).toBe(true)
  })
})
