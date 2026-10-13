// Колкости (#683): панч уходит игроку — кнопка видна в окне реплики-триггера, ответ Алика —
// короткое отражение; серия не двигается, кнопка не предлагается дважды. Окно держит проверка
// said в паре: без триггера в последних репликах кнопки нет.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Choice } from '../engine/state'

const find = (chs: Choice[]) => (text: string): Choice | undefined => chs.find((c) => c.text === text)

/** Как playEpisode: серия показана (arc.i), реплика — в ленте_output path say, ctx.arc поставлен после неё. */
async function playSeries(game: ReturnType<typeof makeGame>['game'], arc: string, i: number, line: string): Promise<void> {
  game.S.arcs[arc] = { i, last: game.S.day }
  await game.say([line])
  game.setCtx({ arc })
}

/** Оффер с odds 0.8 — кадры выбора перебираем, пока кнопка не выпадет (детерминировано сидом). */
const untilOffered = (game: ReturnType<typeof makeGame>['game'], text: string): Choice | undefined => {
  for (let k = 0; k < 20; k++) {
    const c = find(game.buildChoices())(text)
    if (c) return c
  }
  return undefined
}

describe('колкости (#683)', () => {
  it('окно: кнопка после реплики-триггера серии, ответ Алика — отражение, серия не двигается', async () => {
    const { game } = makeGame({ seed: 13 })
    await playSeries(game, 'razmik', 1, 'Он на сорок метров выше тебя — значит, в очереди первый. Логично?')
    const jab = untilOffered(game, 'Очередь не по высоте.')
    expect(jab).toBeDefined()
    await game.send(jab!)
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.from === 'alik' && m.text === 'Очередь трёхмерная, брат. Ты не в курсе.')).toBe(true)
    expect(game.S.arcs.razmik!.i).toBe(1) // колкость не двигает серию
    // один раз за партию: того же триггера окно больше не предлагает кнопку
    for (let k = 0; k < 5; k++) expect(find(game.buildChoices())('Очередь не по высоте.')).toBeUndefined()
  })

  it('без триггера в окне кнопки нет', async () => {
    const { game } = makeGame({ seed: 13 })
    game.S.arcs.razmik = { i: 1, last: game.S.day }
    game.setCtx({ arc: 'razmik' })
    for (let k = 0; k < 5; k++) expect(find(game.buildChoices())('Очередь не по высоте.')).toBeUndefined()
  })

  it('«Банк так не считает» — только после формы клятвы', async () => {
    const { game } = makeGame({ seed: 13 })
    game.setCtx({ when: 'в пятницу' })
    for (let k = 0; k < 5; k++) expect(find(game.buildChoices())('Банк так не считает.')).toBeUndefined()
    await game.say(['Слово Алика: в пятницу всё отдам. Слово Алика крепче банковского!'])
    game.setCtx({ when: 'в пятницу' })
    const jab = untilOffered(game, 'Банк так не считает.')
    expect(jab).toBeDefined()
    await game.send(jab!)
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.from === 'alik' && m.text === 'Не считает, брат. Ему никто не верит, а мне — ты.')).toBe(true)
  })
})
