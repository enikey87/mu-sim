// #1149: сомнение в отмазке («Я сам там работал, всё было нормально!») — отклик на строительную
// претензию в текущем блоке. Новая реплика Алика её снимает: «там» больше не к чему отнести.
import { describe, expect, it } from 'vitest'
import { makeGame } from '../test/helpers'

const choiceTexts = (game: ReturnType<typeof makeGame>['game']) => {
  game.S.choices = null
  return game.buildChoices().map((c) => c.text)
}

describe('сомнение в отмазке (#1149)', () => {
  it('после строительной отмазки сомнение в пуле', () => {
    const { game } = makeGame()
    game.S.ctx = { constr: true } // как после объектной отмазки Алика
    expect(choiceTexts(game).length, 'блок не собрался — проверка пустеет').toBeGreaterThan(0)
    game.S.choices = null
    expect(game.buildChoices().some((c) => c.act === 'defend'), 'сомнение после объектной отмазки').toBe(true)
  })

  it('чужая реплика снимает претензию: варианта с «там» нет', async () => {
    const { game } = makeGame()
    game.S.ctx = { constr: true } // 4 января: бригада из Гюмри уехала с бетономешалкой
    // 7 января: срок наступил — Алик пишет сам, ни стройки, ни объекта в реплике нет
    await game.say(['Эээ, брат, сегодня «в четверг после обеда». Я поставил будильник. Будильник тоже подождёт.'])
    expect(game.S.ctx?.constr, 'новая реплика оставила чужую строительную претензию').toBeFalsy()
    expect(choiceTexts(game).some((t) => /там работал|на стройке|на объекте/.test(t)), 'вариант отсылает к стройке').toBe(false)
  })
})
