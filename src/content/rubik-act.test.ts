// Факт подписи акта ставит строка, которая его утверждает (#588): без Гранта строк про подпись
// в серии нет — акта никто не подписывал, срок «как Рубик акт подпишет» не говорит «случилось».
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { actSigned, grantPaid, taxFrozen } from './memkeys'
import type { Game } from '../engine/game'

const playRubik = async (game: Game, grant: boolean) => {
  if (grant) game.S.mem['intro.grant'] = true
  for (let i = 0; i < 8; i++) await game.playArc('rubik') // вся серия, финал выбирает ArcFinale
  return game.S.msgs.flatMap((m) => (m.kind === 'text' ? [m.text] : []))
}

describe('акт Рубика', () => {
  it('без Гранта серия про подпись акта молчит — и фактов подписи и оплаты нет', async () => {
    const { game } = makeGame()
    const said = await playRubik(game, false)
    expect(said.some((t) => /подписал акт/.test(t)), 'строки про подпись в ленте нет').toBe(false)
    expect(game.S.mem[actSigned], 'акт не подписан').toBeUndefined()
    expect(game.S.mem[grantPaid], 'Грант не заплатил').toBeUndefined()
    expect(said.some((t) => /из налоговой/.test(t)), 'про налоговую серия говорит').toBe(true)
    expect(game.S.mem[taxFrozen], 'заморозку ставит строка про налоговую').toBe(true)
  })

  it('с Грантом строка про подпись звучит — акт подписан', async () => {
    const { game } = makeGame()
    const said = await playRubik(game, true)
    expect(said.some((t) => /подписал акт/.test(t)), 'строка про подпись в ленте').toBe(true)
    expect(game.S.mem[actSigned], 'факт подписи поставлен строкой').toBe(true)
  })
})
