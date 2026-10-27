// Признание «это я учу английский» + карточка курса mu-en получают своё окно отклика (#1410):
// событие-развязка лестницы мычания раньше повисало — следующий блок был генерик, и в партии
// о нём больше не вспоминали. Окно как у семейства #927/#1292: `muenTurn` штампует ход в `muenAt`,
// факт свежести открывает оффер `Opt_Muen`, ответ пишет `muen.answered` и потребляет окно.
// `muenAt` при этом остаётся однократностью карточки: ответ его не стирает, второй карточки нет.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { muenAnswered, muenAt } from './memkeys'
import { MUEN_ASK_B } from './world'
import { P_MUEN } from './rules/player-choice-pools'

const frame = (game: Game) => { game.S.choices = null; return game.buildChoices() }
const muenBtn = (game: Game) => frame(game).find((c) => c.act === 'muen')
const poolTexts = (): string[] => P_MUEN.map((t) => String(t))
const muenCards = (game: Game) => game.S.msgs.filter((m) => m.kind === 'muen')

/** Настоящий путь события: два мычания и второй вопрос про корову (порог — в `muenTurn`). */
const meetRecognition = async (game: Game) => {
  game.moo()
  game.moo()
  await game.send({ text: 'Алик, это у вас корова мычит?', tone: 'cow' })
  await game.send({ text: 'Алик, это у вас корова мычит?', tone: 'cow' })
  expect(muenCards(game), 'признания не прозвучало — проверка пустеет').toHaveLength(1)
  expect(game.S.mem[muenAt], 'признание не штампует свой ход').toBeDefined()
}

describe('признание «учу английский» открывает окно отклика (#1410)', () => {
  it('ход признания штампуется, и на этом ходу в блоке есть отклик из своего пула', async () => {
    const { game } = makeGame({ seed: 1 })
    await meetRecognition(game)
    expect(Number(game.S.mem[muenAt]), 'штамп не несёт ход события').toBe(game.S.stats.sent)
    const btn = muenBtn(game)
    expect(btn, 'на ходу признания отклика нет — событие повисает').toBeDefined()
    expect(poolTexts(), `кнопка не из пула события: ${btn!.text}`).toContain(btn!.text)
  })

  it('без штампа признания отклика нет, даже если карточка в ленте', async () => {
    const { game } = makeGame({ seed: 1 })
    await meetRecognition(game)
    game.S.mem[muenAt] = undefined
    expect(muenBtn(game), 'отклик на курс звучит без самого признания').toBeUndefined()
  })

  it('окно — ход признания и три после; внутри окна строка не повторяется, за окном кнопка уходит', async () => {
    const { game } = makeGame({ seed: 1 })
    await meetRecognition(game)
    const at = Number(game.S.mem[muenAt])
    const offered: string[] = []
    for (let turn = 0; turn <= 3; turn++) {
      game.S.stats.sent = at + turn
      const btn = muenBtn(game)
      if (btn) offered.push(btn.text)
    }
    expect(offered.length, 'окно признания ничего не предложило — проверка пустеет').toBeGreaterThan(0)
    expect(offered.every((t) => poolTexts().includes(t)), `кнопка вне пула: ${offered.join(' | ')}`).toBe(true)
    expect(offered, `строка пула повторилась внутри окна: ${offered.join(' → ')}`).toEqual([...new Set(offered)])
    // граница окна — по факту, а не по пулу: три строки исчерпываются раньше, чем кончается окно
    game.S.stats.sent = at + 3
    expect(game.facts().muenFresh, 'третий ход после признания — уже вне окна').toBe(true)
    game.S.stats.sent = at + 4
    expect(game.facts().muenFresh, 'окно живёт дольше трёх ходов').toBe(false)
    expect(muenBtn(game), 'окно живёт дольше трёх ходов после признания').toBeUndefined()
  })

  it('ответ идёт по выбранной строке, пишет факт выбора и потребляет окно', async () => {
    const { game } = makeGame({ seed: 1 })
    await meetRecognition(game)
    const at = Number(game.S.mem[muenAt])
    // окно показывает по строке за ход: нужную строку найдём в пределах окна, как её найдёт игрок
    let btn: { text: string } | undefined
    let index = -1
    for (let turn = 0; turn <= 3 && !btn; turn++) {
      game.S.stats.sent = at + turn
      const b = muenBtn(game)
      if (b && b.text === P_MUEN[2]) { btn = b; index = 2 }
    }
    expect(btn, 'строка «кто такой Бынич» не предложена в окне — проверка пустеет').toBeDefined()
    const from = game.S.msgs.length
    await game.send(btn! as never)
    const said = game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    expect(said, 'ответа Алика на вопрос о курсе нет').toContain(MUEN_ASK_B[index])
    expect(game.S.mem[muenAnswered], 'выбор игрока не записан фактом').toBe(true)
    expect(muenBtn(game), 'после ответа кнопка курса жива').toBeUndefined()
  })

  it('окно не расширяет однократность карточки: после ответа второго признания нет (НК-2)', async () => {
    const { game } = makeGame({ seed: 1 })
    await meetRecognition(game)
    const at = Number(game.S.mem[muenAt])
    game.S.stats.sent = at
    const btn = muenBtn(game)
    expect(btn, 'окно закрыто до ответа — проверка пустеет').toBeDefined()
    await game.send(btn! as never)
    expect(game.S.mem[muenAnswered]).toBe(true)
    // три вопроса про корову после ответа: порог пройден, шапка карточки на месте — второго признания нет
    await game.send({ text: 'Алик, это у вас корова мычит?', tone: 'cow' })
    await game.send({ text: 'Алик, это у вас корова мычит?', tone: 'cow' })
    await game.send({ text: 'Алик, а что это за «му» на фоне?', tone: 'cow' })
    expect(muenCards(game), 'ответ на окно вернул карточку вторым признанием').toHaveLength(1)
  })
})
