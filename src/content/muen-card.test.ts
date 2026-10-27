// Карточка курса «Английский с Быничем» (mu-en): эскалация мычания — один раз
// за партию, не раньше второго мычания и второго вопроса про корову.
// До порога корову отрицают обычные пулы COW_A/COW_B — карточки быть не может.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { muenAt } from './memkeys'

const sendCow = async (game: ReturnType<typeof makeGame>['game']) => {
  await game.send({ text: 'Алик, это у вас корова мычит?', tone: 'cow' })
}
const muenCards = (game: ReturnType<typeof makeGame>['game']) =>
  game.S.msgs.filter((m) => m.kind === 'muen')

describe('эскалация мычания: карточка курса mu-en (Tone_Cow)', () => {
  it('до порога (меньше двух мычаний или меньше двух вопросов) карточки нет', async () => {
    const { game } = makeGame({ seed: 1 })
    game.moo()
    await sendCow(game)
    await sendCow(game)
    expect(muenCards(game), 'одно мычание — рано').toHaveLength(0)
  })

  it('после двух мычаний и второго вопроса — признание и карточка, ровно один раз', async () => {
    const { game } = makeGame({ seed: 1 })
    game.moo()
    game.moo()
    await sendCow(game)
    expect(muenCards(game), 'первый вопрос ещё держит легенду').toHaveLength(0)
    await sendCow(game)
    const cards = muenCards(game)
    expect(cards, 'второй вопрос — карточка').toHaveLength(1)
    expect(game.mem()[muenAt], 'факт показа поставлен').toBe(true)
    const said = game.S.msgs.filter((m) => m.kind === 'text').map((m) => m.text).join(' ')
    expect(said, 'признание опирается на методику Бынича').toContain('Бынича')
    await sendCow(game)
    await sendCow(game)
    expect(muenCards(game), 'повтора карточки нет — один раз за партию').toHaveLength(1)
  })
})
