// #1633: ответ на спокойную строку грубого слота не утверждает капс/крик, которых в этой реплике нет.
// Тон кнопки по-прежнему наследуется от слота (#583) — различается только текст ответа Алика.
import { describe, it, expect } from 'vitest'
import { makeGame, alikTexts } from '../../test/helpers'
import type { Game } from '../../engine/game'
import { RUDE_AGAIN, RUDE_AGAIN_CALM } from '../misc'
import { count } from '../memkeys'
import { lineId, lintLines, spec, type Line } from '../fact'

/** Фрагмент строки без обращения в начале и без хвостовой пунктуации — как в rules.test.ts. */
const frag = (s: string): string => s.replace(/[.!?…]+$/, '').slice(5, 25)
const hits = (pool: readonly string[], text: string): boolean => pool.some((line) => text.includes(frag(line)))
const poolTexts = (pool: readonly Line[]): string[] => pool.map((l) => spec(l).t)
const CALM_TEXTS = poolTexts(RUDE_AGAIN_CALM)
/** Строки, утверждающие крик именно этой реплики: пул повторного хода без репутации (#1633). */
const SHOUT_TEXTS = poolTexts(RUDE_AGAIN).filter((t) => !CALM_TEXTS.includes(t))

/** Ход с готовой кнопкой: тон задаёт слот, текст — сама строка. */
async function turn(game: Game, text: string): Promise<string> {
  const from = game.S.msgs.length
  await game.send({ text, tone: 'rude' })
  return alikTexts(game.S.msgs.slice(from)).join(' ')
}

/** Оставить в пуле репутации одну свежую строку: выбор перестаёт быть жребием и различает пулы. */
function onlyFirstCalmFresh(game: Game): void {
  for (const t of CALM_TEXTS.slice(1)) game.lines.mark(lineId('RUDE_AGAIN', t))
}

const CALM_TEXT = 'Свадьба за свадьбой. Музыкант за мой счёт, между прочим.'
const SHOUT_TEXT = 'ХВАТИТ СВАДЕБ!!! Мне есть нечего!!!'

describe('повторный грубый ход: ответ по тексту, а не по тону слота (#1633)', () => {
  it('спокойная строка грубого слота не падает в пул крика, даже когда репутация кончилась', async () => {
    const { game } = makeGame()
    game.S.mem[count.rude] = 2
    // все строки репутации уже звучали: спокойный ход уходит в общий фолбэк, а не в пул крика
    for (const t of CALM_TEXTS) game.lines.mark(lineId('RUDE_AGAIN', t))
    const answer = await turn(game, CALM_TEXT)
    expect(answer, 'Алик промолчал — проверка пустеет').not.toBe('')
    expect(hits(poolTexts(RUDE_AGAIN), answer), `ответ утверждает крик спокойной реплики: «${answer}»`).toBe(false)
  })

  it('спокойный ход получает строку репутации, а не «ты кричишь/капс»', async () => {
    const { game } = makeGame()
    game.S.mem[count.rude] = 2
    onlyFirstCalmFresh(game)
    const answer = await turn(game, CALM_TEXT)
    expect(hits([CALM_TEXTS[0]!], answer), `ответ не из пула репутации: «${answer}»`).toBe(true)
    expect(hits(SHOUT_TEXTS, answer), `ответ утверждает крик спокойной реплики: «${answer}»`).toBe(false)
  })

  it('капс-строка того же слота получает пул крика', async () => {
    const { game } = makeGame()
    game.S.mem[count.rude] = 2
    // репутация кончилась: ответить может только пул крика — иначе фолбэк
    for (const t of CALM_TEXTS) game.lines.mark(lineId('RUDE_AGAIN', t))
    const answer = await turn(game, SHOUT_TEXT)
    expect(hits(SHOUT_TEXTS, answer), `ответ не про крик: «${answer}»`).toBe(true)
  })

  it('тихий грубый текст без капса тоже не выдаёт себя за крик', async () => {
    // тон rude приходит от категории (укор), а не от капса: текст спокойный
    const { game } = makeGame()
    game.S.mem[count.rude] = 2
    onlyFirstCalmFresh(game)
    const from = game.S.msgs.length
    await game.send({ text: 'Ты вор, Алик.', tone: 'rude', category: 'accusation' })
    const answer = alikTexts(game.S.msgs.slice(from)).join(' ')
    expect(hits([CALM_TEXTS[0]!], answer), `ответ не из пула репутации: «${answer}»`).toBe(true)
    expect(hits(SHOUT_TEXTS, answer), `ответ утверждает крик спокойного укора: «${answer}»`).toBe(false)
  })

  it('пулы проходят линтер, репутация остаётся в общем пуле', () => {
    expect(lintLines('RUDE_AGAIN', RUDE_AGAIN)).toEqual([])
    expect(lintLines('RUDE_AGAIN_CALM', RUDE_AGAIN_CALM)).toEqual([])
    const all = poolTexts(RUDE_AGAIN)
    expect(CALM_TEXTS.filter((t) => !all.includes(t)), 'репутация пропала из пула повторного хода').toEqual([])
    expect(SHOUT_TEXTS.length, 'в пуле повторного хода не осталось строк про крик').toBeGreaterThan(0)
  })
})
