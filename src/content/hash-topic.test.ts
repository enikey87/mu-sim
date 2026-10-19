// Угроза «пойду на хаш» ждёт, пока хаш прозвучит: факт пишут вводящие строки, не весь пул (#1143).
import { describe, expect, it } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import { D } from './excuses'
import { valueOf, type Entry } from './fact'
import { saidHash, count } from './memkeys'

const THREAT = 'Я сам пойду к тебе на хаш и не уйду!!!'

describe('угроза «пойду на хаш» — после того, как хаш прозвучал (#1143)', () => {
  const open = (game: ReturnType<typeof makeGame>['game']) => game.open(D.P_RUDE_B)

  it('свежая партия не предлагает угрозу', () => {
    const { game } = makeGame()
    expect(game.S.mem[saidHash]).toBeUndefined()
    expect(open(game)).not.toContain(THREAT)
  })

  it('снятый гейт возвращает угрозу до хаша', () => {
    const { game } = makeGame()
    const bare = (D.P_RUDE_B as Entry<string>[]).map((e) => (valueOf(e) === THREAT ? THREAT : e))
    expect(game.open(bare)).toContain(THREAT)
  })

  it('ланч «ем хаш» пишет факт, соседние строки обеда — нет', async () => {
    const { game } = makeGame()
    for (let i = 0; i < 6 && !game.S.mem[saidHash]; i++) {
      const from = game.S.msgs.length
      await game.periodLine('lunch')
      const said = alikTexts(game.S.msgs.slice(from)).join('\n')
      if (!said.includes('ем хаш')) expect(game.S.mem[saidHash], said).toBeUndefined()
    }
    expect(game.S.mem[saidHash], 'строка «ем хаш» не попалась в колоде обеда').toBe(true)
    expect(open(game)).toContain(THREAT)
  })

  it('интро квеста хаша и сцена извинения пишут тот же факт', async () => {
    const quest = makeGame()
    await quest.game.enterNode('q_hash', 'ask')
    expect(quest.game.S.mem[saidHash]).toBe(true)
    expect(open(quest.game)).toContain(THREAT)

    const ritual = makeGame()
    expect(open(ritual.game)).not.toContain(THREAT)
    await ritual.game.enterNode('ritual', 'ask')
    expect(ritual.game.S.mem[saidHash]).toBe(true)
    expect(open(ritual.game)).toContain(THREAT)
  })

  it('«Приходи на хаш, помиримся» пишет факт, прочие прощения — нет', async () => {
    const { game } = makeGame()
    for (let i = 0; i < 8 && !game.S.mem[saidHash]; i++) {
      const from = game.S.msgs.length
      await game.send({ text: 'Прости', tone: 'polite', act: 'sorry' })
      const said = alikTexts(game.S.msgs.slice(from)).join('\n')
      if (!said.includes('Приходи на хаш')) expect(game.S.mem[saidHash], said).toBeUndefined()
      game.S.mem[count.sorry] = 0
      game.S.stats.sent += 10
    }
    expect(game.S.mem[saidHash], 'строка прощения про хаш не попалась').toBe(true)
    expect(open(game)).toContain(THREAT)
  })
})
