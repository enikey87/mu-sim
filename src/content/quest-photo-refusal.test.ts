// В квесте «фото плитки» можно отказаться (#582): отказ и с просьбы, и после «Какой процент?» —
// звучит шуткой Алика, фото не уходит, ach.q_photo не ставится, рекламы в памяти и на выплате нет.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { QUESTS } from './quests'
import type { Game } from '../engine/game'

async function walk(game: Game, go: readonly string[]): Promise<string> {
  await game.enterNode('q_photo', QUESTS.q_photo.start)
  const texts: string[] = []
  for (const g of go) {
    game.S.choices = null
    const c = game.choices.find((x) => x.scene && x.go === g)
    expect(c, `кнопка «${g}»`).toBeDefined()
    const n = game.S.msgs.length
    await game.send(c!)
    texts.push(...game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' ? [m.text] : [])))
  }
  return texts.join(' ')
}

describe('q_photo: отказ от фото для рекламы', () => {
  for (const [what, path] of [['с просьбы', ['no']], ['после вопроса о проценте', ['pct', 'no']]] as const) {
    it(`отказ ${what}: шутка в чате, фото не ушло, сцена закрыта`, async () => {
      const { game } = makeGame()
      const said = await walk(game, path)
      expect(said, 'реплика отказа в чате').toMatch(/Без фотографии клиенты поверят/)
      expect(game.S.ach.q_photo, 'достижение отправки не поставлено').toBeUndefined()
      expect(game.S.msgs.some((m) => m.kind === 'sys' && /выложили/.test(m.text)), 'системной строки про рекламу нет').toBe(false)
      expect(game.S.scene, 'сцена закрыта').toBeNull()
    })
  }

  it('отправка фото по-прежщему ставит достижение и ведёт рекламу', async () => {
    const { game } = makeGame()
    await walk(game, ['send'])
    expect(game.S.ach.q_photo, 'достижение отправки').toBeDefined()
    expect(game.S.msgs.some((m) => m.kind === 'sys' && /выложили/.test(m.text)), 'системная строка про рекламу').toBe(true)
  })
})
