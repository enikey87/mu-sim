// Окно отклика на перевод 50 ₽ (#1003): каждый перевод штампует факт-ход, кнопка реакции живёт ≤2 хода
// и не зависит от ctx (заметка 10 живой рецензии №3); ответ Алика потребляет окно (#951).
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { TRANSFER_FRESH_TURNS } from './excuses'

const findReply = (game: Game) => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'transferQ') }

describe('окно отклика на перевод (#1003)', () => {
  it('перевод даёт кнопку реакции, даже когда ctx перебит соседним сообщением; ответ закрывает окно', async () => {
    const { game } = makeGame()
    await game.transfer()
    expect(findReply(game), 'на ходу перевода кнопки нет').toBeDefined()
    await game.say(['Джан, и ещё: журнал напоминает про обещание.']) // ctx уехал на другое сообщение — как в заметке 10
    const btn = findReply(game)
    expect(btn, 'после соседнего сообщения кнопка реакции пропала').toBeDefined()
    expect(btn!.text, 'кнопка не из пула реакций на перевод').toMatch(/Спасибо за 50 ₽|Алик, это шутка\?|50 рублей\?!|Спасибо\. Осталось ещё немножко/)
    const from = game.S.msgs.length
    await game.send(btn!)
    const said = game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    expect(said.length, 'Алик не ответил на реакцию').toBeGreaterThan(0)
    expect(findReply(game), 'после ответа окно не закрылось').toBeUndefined()
    // следующий перевод открывает окно заново
    await game.transfer()
    expect(findReply(game), 'новый перевод окно не открыл').toBeDefined()
  })

  it('окно ≤2 ходов: на втором ходу кнопка есть, дальше — нет', async () => {
    const { game } = makeGame()
    await game.transfer()
    game.S.stats.sent += TRANSFER_FRESH_TURNS
    expect(findReply(game), 'в окне кнопки нет').toBeDefined()
    game.S.stats.sent += 1
    expect(findReply(game), 'за окном кнопка осталась').toBeUndefined()
  })

  it('перевод в пачке «пока тебя не было» тоже штампует окно', async () => {
    const { game } = makeGame()
    await game.awayMsg('transfer')
    expect(findReply(game), 'перевод из пачки без окна').toBeDefined()
    game.S.stats.sent += TRANSFER_FRESH_TURNS + 1
    expect(findReply(game), 'за окном кнопка осталась').toBeUndefined()
  })
})
