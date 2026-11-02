// После признания «это я учу английский» источник мычания назван: ответ на коровий вопрос
// и на «Мууу» держит линию Бынича, а не прежние версии-отрицания COW_A/COW_B (#1697).
// До признания пул прежний — лестница начинается с отрицания, и сторож это проверяет.
import { describe, it, expect } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import type { Game } from '../engine/game'
import { D } from './excuses'
import { valueOf, type Entry } from './fact'
import { muenAt } from './memkeys'

const COW_OLD = [...D.COW_A, ...D.COW_B].map((e: Entry<string>) => valueOf(e))
const MUEN_COW_TEXT = (D.MUEN_COW as Entry<string>[]).map(valueOf)

/** Отправить реплику и вернуть сказанное Аликом в этом ходу. */
async function said(game: Game, c: { text: string; tone?: string; act?: string }): Promise<string> {
  const from = game.S.msgs.length
  await game.send(c as never)
  return alikTexts(game.S.msgs.slice(from)).join(' ')
}

/** Настоящий порог признания: два мычания и второй вопрос про корову (порог — в `muenTurn`). */
async function recognition(game: Game): Promise<void> {
  game.moo()
  game.moo()
  await game.send({ text: 'Алик, это у вас корова мычит?', tone: 'cow' })
  await game.send({ text: 'Алик, это у вас корова мычит?', tone: 'cow' })
  expect(game.S.mem[muenAt], 'признания не прозвучало — проверка пустеет').toBeDefined()
}

const cows = (text: string) => COW_OLD.filter((l) => text.includes(l))

describe('коровьи ответы после признания «учу английский» (#1697)', () => {
  it('коровий тон: до признания — прежние версии, после — линия Бынича', async () => {
    const before = makeGame({ seed: 1 }).game
    const old = await said(before, { text: 'Алик, это у вас корова мычит?', tone: 'cow' })
    expect(cows(old).length, `прежний пул исчез до признания: ${old}`).toBeGreaterThan(0)

    const { game } = makeGame({ seed: 1 })
    await recognition(game)
    const after = await said(game, { text: 'Алик, это у вас корова мычит?', tone: 'cow' })
    expect(after, 'ответа на коровий вопрос нет — проверка пустеет').not.toBe('')
    expect(MUEN_COW_TEXT.some((l) => after.includes(l)), `ответ не из линии признания: ${after}`).toBe(true)
    expect(cows(after), `после признания вернулась версия-отрицание: ${after}`).toEqual([])
  })

  it('вопрос «что за му на фоне» после признания тоже держит линию признания', async () => {
    const { game } = makeGame({ seed: 1 })
    await recognition(game)
    const after = await said(game, { text: 'Алик, а что это за «му» на фоне?', tone: 'neutral', act: 'voice' })
    expect(MUEN_COW_TEXT.some((l) => after.includes(l)), `ответ не из линии признания: ${after}`).toBe(true)
    expect(cows(after), `после признания вернулась версия-отрицание: ${after}`).toEqual([])
  })

  it('«Мууу» игрока, когда колода «не понимаю» исчерпана, не уходит в версии-отрицания', async () => {
    const { game } = makeGame({ seed: 1 })
    await recognition(game)
    const answers: string[] = []
    for (let i = 0; i < 8; i++) answers.push(await said(game, { text: 'Мууу', tone: 'neutral', act: 'moo' }))
    expect(
      answers.some((a) => MUEN_COW_TEXT.some((l) => a.includes(l))),
      `фолбэк «Мууу» не дошёл до линии признания: ${answers.join(' | ')}`,
    ).toBe(true)
    expect(answers.flatMap(cows), `после признания «Мууу» получило версию-отрицание: ${answers.join(' | ')}`).toEqual([])
  })
})
