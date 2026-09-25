// «Спасибо» и «привет» свободным текстом (docs/design/greetings.md): свой ответ путём игрока.
import { describe, expect, it } from 'vitest'
import { alikTexts, makeGame } from '../test/helpers'
import { specificityOf, valueOf, type Entry } from '../engine/rules'
import type { Game } from '../engine/game'
import { GREET, GREET_MORNING, GREET_NIGHT, THANKS } from './misc'

/** Реплика из пула: обращение в начале и подстановки ({night}) не мешают — ищем по самому длинному куску шаблона. */
const fromPool = (pool: readonly Entry<string>[], text: string) =>
  pool.some((p) => {
    const raw = valueOf(p)
    return text.includes(raw.split(/\{\w+\}/).sort((a, b) => b.length - a.length)[0].replace(/^[,.\s]+|[.!?…]+$/g, '').slice(0, 30))
  })

/** Сколько сидов из 12 ответили репликой пула (реакция без ответа — законный исход в ~30% вежливых ходов). */
async function answered(text: string, pool: readonly Entry<string>[], setup: (g: Game) => void = () => {}): Promise<number> {
  let n = 0
  for (let seed = 1; seed <= 12; seed++) {
    const { game } = makeGame({ seed })
    setup(game)
    const from = alikTexts(game.S.msgs).length
    await game.send(text)
    if (alikTexts(game.S.msgs).slice(from).some((t) => fromPool(pool, t))) n++
  }
  return n
}
const at = (hour: number) => (g: Game) => { g.S.clock = hour * 60 }

describe('«спасибо» и «привет»: у Алика свой ответ', () => {
  it('«спасибо» — ответ из пула благодарности, а не случайная отмазка', async () => {
    expect(await answered('Спасибо!', THANKS)).toBeGreaterThanOrEqual(6)
  })
  it('приветствие днём, ночью и утром — свои строки', async () => {
    expect(await answered('Привет, Алик!', GREET, at(14))).toBeGreaterThanOrEqual(6)
    expect(await answered('Доброе утро!', GREET_NIGHT, at(3))).toBeGreaterThanOrEqual(6)
    expect(await answered('Доброе утро!', GREET_MORNING, at(8))).toBeGreaterThanOrEqual(6)
    // ночью и утром дневной пул не звучит
    expect(await answered('Привет!', GREET, at(3))).toBe(0)
  })
  it('«спасибо» поднимает настроение, но не чаще раза в 8 ходов', async () => {
    const { game } = makeGame()
    const say = async (sent: number) => { game.S.stats.sent = sent; await game.fire('PlayerMessage', { category: 'gratitude', tone: 'polite' }) }
    const mood = () => game.S.mood
    expect(mood()).toBe(5)
    await say(0)
    expect(mood()).toBe(6)
    await say(3) // середина перерыва
    expect(mood()).toBe(6)
    await say(7) // ход до границы
    expect(mood()).toBe(6)
    await say(8) // ровно перерыв — можно
    expect(mood()).toBe(7)
  })
  it('после перевода «я ничего не перевёл» не звучит', async () => {
    const lie = 'я же ничего не перевёл'
    const heard = async (paid: number) => {
      let n = 0
      for (let seed = 1; seed <= 40; seed++) {
        const { game } = makeGame({ seed })
        game.S.stats.paid = paid
        const from = alikTexts(game.S.msgs).length
        await game.send('Спасибо!')
        if (alikTexts(game.S.msgs).slice(from).some((t) => t.includes(lie))) n++
      }
      return n
    }
    expect(await heard(0)).toBeGreaterThan(0)
    expect(await heard(1)).toBe(0)
  })
  it('«спасибо» путём игрока: настроение растёт, приветствие его не трогает', async () => {
    const { game } = makeGame()
    await game.send('Спасибо!')
    expect(game.S.mood).toBe(6)
    const { game: g2 } = makeGame()
    await g2.send('Привет, Алик!')
    expect(g2.S.mood).toBe(5)
  })
  it('«передай привет» и «вы добрый человек» — тоже приветствие', async () => {
    expect(await answered('Передай привет Борису!', GREET, at(14))).toBeGreaterThanOrEqual(6)
    expect(await answered('Вы добрый человек.', GREET, at(14))).toBeGreaterThanOrEqual(6)
  })
  it('в блоке, S5, вендетте, эндгейме и после «смерти» — прежний ход', async () => {
    const states: Record<string, (g: Game) => void> = {
      блок: (g) => { g.S.mem.blocked = true },
      S5: (g) => { g.S.mem.polite = true },
      вендетта: (g) => { g.S.mem.vendetta = true },
      эндгейм: (g) => { g.S.mem['endgame.active'] = true },
      смерть: (g) => { g.S.mem.alik_dead = true },
    }
    for (const [name, setup] of Object.entries(states)) {
      expect(await answered('Спасибо!', THANKS, setup), `${name}: спасибо`).toBe(0)
      expect(await answered('Привет, Алик!', GREET, (g) => { setup(g); at(14)(g) }), `${name}: привет`).toBe(0)
    }
  })
  it('блок, смерть, телефон у Карине и Tone_MissRude старше новых ответов', () => {
    const { game } = makeGame()
    const spec = (name: string) => specificityOf(game.rules.all.find((r) => r.name === name)!)
    for (const older of ['Tone_WhileBlocked', 'Tone_WhileDead', 'Phone_Karine_PlayerMessage', 'Tone_MissRude'])
      for (const mine of ['Tone_Thanks', 'Tone_Greeting']) expect(spec(older), `${older} > ${mine}`).toBeGreaterThan(spec(mine))
  })
})
