// «Какой ещё регламент?!» ждёт, пока Алик произнесёт «регламент», а не факта вежливого режима (#1230, рецидив #831-2).
import { describe, expect, it } from 'vitest'
import { alikTexts, makeGame, setMoney } from '../test/helpers'
import { Game } from '../engine/game'
import { spec, valueOf, type Entry } from './fact'
import { saidRegiment } from './memkeys'
import { POLITE_RUDE } from './rude'
import { MONEY_REPLY_REGIMENT, P_RUDE_POLITE } from './topics'

const LINE = 'Какой ещё регламент?!'
const NEIGHBORS = ['ХВАТИТ ВЕЖЛИВО!!!', 'Алик, говори нормально!!!', 'Лучше бы ты кричал!!!']
const WORD = /регламент/i
const openRude = (game: Game): string[] => game.open(P_RUDE_POLITE)
/** Окно вежливости ставится тем же протоколом, что и у трибунала: факт на 10 дней (`scenes.ts`). */
const polite = (game: Game): void => { game.rules.applyOps([{ key: 'polite', op: '=', value: true, forDays: 10 }], {}) }
const rudeLine = (game: Game): string | undefined => {
  game.S.choices = null
  return game.buildChoices().find((c) => c.tone === 'rude')?.text
}
const shout = async (game: Game): Promise<string> => {
  const from = game.S.msgs.length
  const r = await game.fire('PlayerMessage', { tone: 'rude' })
  expect(r?.name).toBe('Rude_Polite')
  return alikTexts(game.S.msgs.slice(from)).at(-1)!
}

describe('вариант «Какой ещё регламент?!» — после слова «регламент» от Алика (#1230)', () => {
  it('до слова строки нет ни в колоде, ни в блоке; три соседа открыты', () => {
    const { game } = makeGame()
    polite(game)
    expect(game.S.mem.polite).toBe(true)
    expect(game.S.mem[saidRegiment]).toBeUndefined()
    expect(openRude(game), 'вариант регламента до первого слова').not.toContain(LINE)
    expect(openRude(game)).toEqual(expect.arrayContaining(NEIGHBORS))
    expect(openRude(game), 'пул не должен пустеть').toHaveLength(NEIGHBORS.length)
    expect(rudeLine(game)).not.toBe(LINE)
  })

  it('снятый гейт возвращает строку до слова — проверка видит именно гейт', () => {
    const { game } = makeGame()
    polite(game)
    const bare = (P_RUDE_POLITE as Entry<string>[]).map((e) => (valueOf(e) === LINE ? LINE : e))
    expect(game.open(bare)).toContain(LINE)
  })

  it('обе строки, которые произносят слово, и дно-ответ несут штамп факта', () => {
    const stamped = [...POLITE_RUDE, ...MONEY_REPLY_REGIMENT].map((e) => spec(e)).filter((s) => WORD.test(s.t))
    expect(stamped.map((s) => s.t), 'строки со словом «регламент»').toHaveLength(3)
    for (const s of stamped) {
      expect(s.remember?.some((op) => op.key === saidRegiment && op.value === true), s.t).toBe(true)
    }
  })

  it('ответ на крик без слова факта не ставит и вариант не открывает', async () => {
    let plain = false
    for (let seed = 1; seed <= 40 && !plain; seed++) {
      const { game } = makeGame({ seed })
      polite(game)
      const said = await shout(game)
      if (WORD.test(said)) continue
      plain = true
      expect(game.S.mem[saidRegiment], said).toBeUndefined()
      expect(openRude(game), said).not.toContain(LINE)
      expect(openRude(game)).toEqual(expect.arrayContaining(NEIGHBORS))
      expect(rudeLine(game)).not.toBe(LINE)
    }
    expect(plain, 'строка пула без слова «регламент» не попалась').toBe(true)
  })

  it('ответ «в рамках регламента» ставит факт — строка появляется', async () => {
    let word = false
    for (let seed = 1; seed <= 40 && !word; seed++) {
      const { game } = makeGame({ seed })
      polite(game)
      for (let i = 0; i < 8 && !word; i++) {
        const said = await shout(game)
        // пул повторяется не раньше шести ходов: двигаем ход, чтобы дошла следующая строка
        game.S.stats.sent += 7
        if (!WORD.test(said)) {
          expect(game.S.mem[saidRegiment], said).toBeUndefined()
          expect(openRude(game), said).not.toContain(LINE)
          continue
        }
        word = true
        expect(game.S.mem[saidRegiment], said).toBe(true)
        expect(openRude(game), said).toContain(LINE)
      }
    }
    expect(word, 'строка со словом «регламент» не попалась').toBe(true)
  })

  it('дно-ответ на деньги: слово ставит факт, остальные строки регламента — нет', () => {
    const game = makeGame({ seed: 7 }).game
    setMoney(game, Game.MONEY_BOTTOM)
    polite(game)
    expect(game.S.mem[saidRegiment]).toBeUndefined()
    let word = false
    for (let i = 0; i < 10 && !word; i++) {
      const said = game.moneyReply('polite')
      if (!WORD.test(said)) {
        expect(game.S.mem[saidRegiment], said).toBeUndefined()
        expect(openRude(game), said).not.toContain(LINE)
        continue
      }
      word = true
      expect(game.S.mem[saidRegiment], said).toBe(true)
      expect(openRude(game), said).toContain(LINE)
    }
    expect(word, 'дно-ответ «в рамках регламента» не попался').toBe(true)
  })
})
