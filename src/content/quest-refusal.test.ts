// Уточняющий вопрос в квесте не запирает игрока в согласии (#584): у трёх квестов из знания
// «только согласие и немой выход» появился отказ — реплика Алика, сцена кончается, ачивки нет.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { QUESTS } from './quests'
import type { Game } from '../engine/game'

/** Пройти квест по меткам кнопок; вернуть всё, что Алик сказал после последнего выбора игрока. */
async function walk(id: string, go: string[], game: Game): Promise<string> {
  await game.enterNode(id, QUESTS[id].start)
  const texts: string[] = []
  for (const g of go) {
    game.S.choices = null
    const c = game.choices.find((x) => x.scene && x.go === g)
    expect(c, `${id}: кнопка «${g}»`).toBeDefined()
    const n = game.S.msgs.length
    await game.send(c!)
    texts.push(...game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' ? [m.text] : [])))
  }
  return texts.join(' ')
}

const REFUSALS: Record<string, { ask: string; refuse: string; line: RegExp; agree: string; ach: string }> = {
  q_lottery: { ask: 'serious', refuse: 'no', line: /Билет всё равно твой/, agree: 'draw', ach: 'q_lottery' },
  q_mama: { ask: 'why', refuse: 'no', line: /Сам маме помидоры тащил/, agree: 'drive', ach: 'q_mama' },
  q_goat: { ask: 'mchs', refuse: 'no', line: /Козу снял/, agree: 'climb', ach: 'q_goat' },
}

describe('отказ после уточняющего вопроса', () => {
  for (const [id, r] of Object.entries(REFUSALS)) {
    it(`${id}: отказ звучит репликой Алика, сцена кончается, ачивки нет`, async () => {
      const { game } = makeGame()
      const said = await walk(id, [r.ask, r.refuse], game)
      expect(said, 'реплика отказа в чате').toMatch(r.line)
      expect(game.S.scene, 'сцена закрыта').toBeNull()
      expect(game.S.ach[r.ach], 'награда за согласие не выдана').toBeUndefined()
    })

    it(`${id}: согласие по-прежнему ставит достижение`, async () => {
      const { game } = makeGame()
      await walk(id, [r.ask, r.agree], game)
      expect(game.S.ach[r.ach], 'достижение по согласию').toBeDefined()
    })
  }
})
