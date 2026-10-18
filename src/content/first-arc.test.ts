// Маринование первой арки (#1004): первые дни партии — только шаблонные отмазки Алика; сериал стартует
// после окна, родня (семейный чат) в окне не пишет. Задержка считается в одном месте — game.marinating().
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { START_DAY, ARC_MARINATION_DAYS } from '../engine/state'

describe('маринование первой арки (#1004)', () => {
  it('в окне сериалы не стартуют и родня не пишет; после окна — стартуют как раньше', async () => {
    const { game } = makeGame()
    expect(game.S.day).toBe(START_DAY)
    // окно: много сюжетных и обычных ходов на стартовых днях (игрок «наговорил» уже 20 реплик)
    for (let t = 0; t < 60; t++) {
      game.S.stats.sent = Math.min(20, game.S.stats.sent + 1)
      await game.fire('StoryBeat')
      await game.fire('AlikTurn')
      game.S.scene = null
    }
    expect(Object.keys(game.S.arcs).length, 'сериал стартовал в окне марирования').toBe(0)
    expect(game.facts().arcAvailable, 'окно марирования закрылось раньше срока').toBe(false)
    const who = game.S.msgs.flatMap((m) => (m.kind === 'text' && m.who && m.who !== 'me' ? [m.who] : []))
    expect(who, 'родня написала в окне марирования').toEqual([])
    // за окном — стартуют как раньше
    game.S.day = START_DAY + ARC_MARINATION_DAYS
    expect(game.facts().arcsMature, 'окно не закрылось по ходу дней').toBe(true)
    let started = false
    for (let t = 0; t < 80 && !started; t++) { await game.fire('AlikTurn'); game.S.scene = null; started = Object.keys(game.S.arcs).length > 0 }
    expect(started, 'после окна сериал не стартовал').toBe(true)
  })

  it('НС: с первого дня после окна тот же ход сериал стартует', async () => {
    // контроль механики: тот же набор ходов без окна стартует сериал — значит, его держит именно задержка
    const { game } = makeGame()
    game.S.day = START_DAY + ARC_MARINATION_DAYS
    game.S.stats.sent = 20
    let started = false
    for (let t = 0; t < 80 && !started; t++) { await game.fire('AlikTurn'); game.S.scene = null; started = Object.keys(game.S.arcs).length > 0 }
    expect(started).toBe(true)
  })
})
