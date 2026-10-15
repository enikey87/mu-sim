// Колкости (#683): панч уходит игроку — кнопка видна в окне реплики-триггера, ответ Алика —
// короткое отражение; серия не двигается, кнопка не предлагается дважды. Окно держит проверка
// said в паре: без триггера в последних репликах кнопки нет.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { valueOf } from '../engine/rules'
import type { Choice } from '../engine/state'
import type { Entry } from './fact'
import { ARC_TALK, WORD_TALK } from './talk'
import { LEGENDS } from './legends'
import { saidTriggers, saidTrigger, type TalkPair } from './said'
import { ARCS, ARC_DONE } from './arcs'
import { FINALES } from './finales'
import { OATH_FORMS } from './misc'

const find = (chs: Choice[]) => (text: string): Choice | undefined => chs.find((c) => c.text === text)

/** Как playEpisode: серия показана (arc.i), реплика — в ленте_output path say, ctx.arc поставлен после неё. */
async function playSeries(game: ReturnType<typeof makeGame>['game'], arc: string, i: number, line: string): Promise<void> {
  game.S.arcs[arc] = { i, last: game.S.day }
  await game.say([line])
  game.setCtx({ arc })
}

/** Оффер с odds 0.8 — кадры выбора перебираем, пока кнопка не выпадет (детерминировано сидом). */
const untilOffered = (game: ReturnType<typeof makeGame>['game'], text: string): Choice | undefined => {
  for (let k = 0; k < 20; k++) {
    const c = find(game.buildChoices())(text)
    if (c) return c
  }
  return undefined
}

describe('колкости (#683)', () => {
  it('окно: кнопка после реплики-триггера серии, ответ Алика — отражение, серия не двигается', async () => {
    const { game } = makeGame({ seed: 13 })
    await playSeries(game, 'razmik', 1, 'Он на сорок метров выше тебя — значит, в очереди первый. Логично?')
    const jab = untilOffered(game, 'Очередь не по высоте.')
    expect(jab).toBeDefined()
    await game.send(jab!)
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.from === 'alik' && m.text === 'Очередь трёхмерная, брат. Ты не в курсе.')).toBe(true)
    expect(game.S.arcs.razmik!.i).toBe(1) // колкость не двигает серию
    // один раз за партию: того же триггера окно больше не предлагает кнопку
    for (let k = 0; k < 5; k++) expect(find(game.buildChoices())('Очередь не по высоте.')).toBeUndefined()
  })

  it('без триггера в окне кнопки нет', async () => {
    const { game } = makeGame({ seed: 13 })
    game.S.arcs.razmik = { i: 1, last: game.S.day }
    game.setCtx({ arc: 'razmik' })
    for (let k = 0; k < 5; k++) expect(find(game.buildChoices())('Очередь не по высоте.')).toBeUndefined()
  })

  it('«Банк так не считает» — только после формы клятвы', async () => {
    const { game } = makeGame({ seed: 13 })
    game.setCtx({ when: 'в пятницу' })
    for (let k = 0; k < 5; k++) expect(find(game.buildChoices())('Банк так не считает.')).toBeUndefined()
    await game.say(['Слово Алика: в пятницу всё отдам. Слово Алика крепче банковского!'])
    game.setCtx({ when: 'в пятницу' })
    const jab = untilOffered(game, 'Банк так не считает.')
    expect(jab).toBeDefined()
    await game.send(jab!)
    expect(game.S.msgs.some((m) => m.kind === 'text' && m.from === 'alik' && m.text === 'Не считает, брат. Ему никто не верит, а мне — ты.')).toBe(true)
  })
})

/** Все строки значения — включая вложенные Entry и объекты: серии, финалы, формы клятвы. */
const str = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) for (const x of v) str(x, out)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) str(x, out)
  return out
}

describe('колкости (#738): триггер окна — данные, а не строка в предикате', () => {
  it('каждый триггер находится в источнике своей пары: правка серии или формы красит тест', () => {
    expect(saidTriggers().length, 'триггеров не стало — проверка пустеет').toBeGreaterThanOrEqual(11)
    const seen: string[] = []
    const pairs: Array<[string, readonly Entry<TalkPair>[]]> = [...Object.entries(ARC_TALK), ['word', WORD_TALK]]
    for (const [arc, es] of pairs) {
      const source = arc === 'word'
        ? str(OATH_FORMS)
        : [...str(ARCS[arc]?.eps), ...str(FINALES[arc] ?? []), ...str((ARC_DONE as Record<string, unknown>)[arc])]
      for (const e of es) {
        const t = saidTrigger(valueOf(e)[2])
        if (!t) continue
        seen.push(t)
        expect(source.some((s) => s.includes(t)), `триггер «${t}» (${arc}) не найден в источнике — правка текста умертвит колкость`).toBe(true)
      }
    }
    expect(seen.sort(), 'реестр триггеров и предикаты расходятся').toEqual([...saidTriggers()].sort())
  })

  it('регулярка окна легенды матчит строку своей легенды (#748)', () => {
    let n = 0
    for (const [id, legend] of Object.entries(LEGENDS)) {
      const source = str(legend.lines)
      for (const e of legend.talk ?? []) {
        const cond = valueOf(e)[2]
        if (!cond || cond.cond !== 'said' || cond.flags === undefined) continue
        n++
        const re = new RegExp(cond.trigger, cond.flags)
        expect(source.some((s) => re.test(s)), `${id} /${cond.trigger}/${cond.flags} не матчит ни одну строку легенды`).toBe(true)
      }
    }
    expect(n, 'регулярок не стало — проверка пустеет').toBeGreaterThanOrEqual(4)
  })
})
