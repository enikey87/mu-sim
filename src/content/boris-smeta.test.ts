// «Новую смету составили» наступает от реплики про смету, а не от выздоровления Бориса (#586).
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { borisSmetaReady } from './memkeys'
import { LEGENDS } from './legends'
import { spec } from './fact'

const SMETA_LINE = 'Новую смету составили — Борис посмотрел на неё с интересом. Спрятали в сейф. На всякий случай.'

describe('смета Бориса', () => {
  it('выздоровление Бориса смету не составляет: после «Борису лучше» факта ещё нет', async () => {
    const { game } = makeGame()
    for (let i = 0; i < 3; i++) await game.playArc('boris') // до «Борису лучше. Но теперь он ест только квитанции» включительно
    expect(game.S.mem[borisSmetaReady], 'готовой сметы в мире нет').toBeUndefined()
  })

  it('смету составляет реплика, которая это утверждает, — и срок может наступить', async () => {
    const { game } = makeGame()
    for (let i = 0; i < 3; i++) await game.playArc('boris')
    game.setLegend('boris_smeta', 'boris')
    // строка-новость ещё в пуле: её и должен сказать мир
    expect(game.open(LEGENDS.boris_smeta.lines).map((l) => spec(l).t)).toContain(SMETA_LINE)
    // звучит настоящим ходом Алика
    let said = false
    for (let i = 0; i < 80 && !said; i++) {
      game.S.stats.sent += 3
      game.setLegend('boris_smeta', 'boris')
      const n = game.S.msgs.length
      if ((await game.fire('AlikTurn'))?.name === 'Turn_Legend') {
        said = game.S.msgs.slice(n).some((m) => m.kind === 'text' && m.text === SMETA_LINE)
      }
      game.S.scene = null
    }
    expect(said, 'реплика про составленную смету звучит ходом').toBe(true)
    expect(game.S.mem[borisSmetaReady], 'факт поставлен той же репликой').toBe(true)
  })
})
