// Плейтест оператора 02.11 (#1673), замечания №1 и №4: соболезнование — событие, а не режим траура.
// «Слишком много „Сочувствую“» жило в двух офферах: Mourn давал кнопку каждый второй блок все семь
// недель траура (odds 0.5), Condole снимал её с любой грустной отмазки с роднёй и держал ctx неделю —
// кнопка вставала в блок про карту. Здесь доказано обратное: кнопка есть в окне бита арки и её нет
// в тихой фазе, пул живой и без имён/сумм, а логический слой ловит возврат класса (arc-relevance).
import { describe, expect, it } from 'vitest'
import type { Game } from '../engine/game'
import type { Entry } from '../engine/rules'
import { makeGame } from '../test/helpers'
import { playtest, buttonStem } from '../tools/playtest'
import { logicFindings, PERSON_RE, sumsIn } from '../tools/logic-review'
import { D, EVENT_FRESH_TURNS } from './excuses'
import { valueOf } from './fact'
import { grandpaDeathAt, mourning } from './memkeys'

const POOL = new Set<string>((D.P_CONDOLE as Entry<string>[]).map(valueOf))
const live = (game: Game): string[] => game.open(D.P_CONDOLE as Entry<string>[])
const isCondole = (t: string): boolean => POOL.has(t)

/** Кнопки соболезнования в текущем блоке: метка действия, текст — стебель P_CONDOLE. */
const condole = (game: Game): string[] => {
  game.S.choices = null
  return game.buildChoices().filter((c) => c.act === 'condole' && isCondole(c.text)).map((c) => c.text)
}

/** Сборок за проверку: вероятностный оффер (odds) обязан попасться хотя бы раз, а детерминированного
 *  «нет» не бывает — 30 сборок при odds 0.5 дают непустой ответ с вероятностью 1 − 2⁻³⁰. */
const builds = (game: Game, n = 30): string[] => Array.from({ length: n }, () => condole(game)).flat()

/** Дедушка «умирает»: арка доигрывает первую серию, в мире остаётся траур и штамп хода бита. */
const dies = async (): Promise<{ game: Game; at: number }> => {
  const { game } = makeGame()
  game.S.day = 250
  await game.playArc('grandpa')
  const at = Number(game.S.mem[grandpaDeathAt])
  return { game, at }
}

describe('окно соболезнования на бите арки «Бессмертный дедушка» (#1673)', () => {
  it('бит «дедушка умирает»: ход штампован, кнопка в первом блоке', async () => {
    const { game, at } = await dies()
    expect(game.S.mem[mourning], 'траур не начался — проверка не про ту фазу').toBe(true)
    expect(Number.isFinite(at), 'ход бита не штампован').toBe(true)
    expect(at, 'штамп не на ходу бита').toBe(game.S.stats.sent)
    expect(condole(game), 'в блоке бита соболезнования нет').not.toHaveLength(0)
  })

  it('кнопка держится на штампе бита, а не на трауре: без штампа её нет (вернули odds 0.5 → красный)', async () => {
    const { game } = await dies()
    expect(builds(game), 'в блоке бита соболезнования нет').not.toHaveLength(0)
    delete game.S.mem[grandpaDeathAt]
    expect(game.S.mem[mourning], 'траур остался — значит, проверяем то, что нужно').toBe(true)
    expect(builds(game), 'кнопка живёт всем трауром — окно вернули к odds 0.5').toHaveLength(0)
  })

  it('тихая фаза: на четвёртый ход после бита кнопки нет, хотя траур висит', async () => {
    const { game, at } = await dies()
    game.S.stats.sent = at + EVENT_FRESH_TURNS
    expect(builds(game), 'окно закрылось раньше срока').not.toHaveLength(0)
    game.S.stats.sent = at + EVENT_FRESH_TURNS + 1
    expect(game.S.mem[mourning], 'траур уже кончился — проверка пустеет').toBe(true)
    expect(builds(game), 'кнопка живёт весь траур').toHaveLength(0)
  })

  it('грустная отмазка с роднёй — не повод: старый гейт Condole (ctx.rel + ctx.sad) снят', async () => {
    const { game } = await dies()
    game.S.stats.sent += 100 // тихая фаза: траур ещё стоит, окна нет
    game.S.ctx = { rel: { n: 'дядя Вартан', g: 'м', you: 'ваш дядя Вартан' }, sad: true }
    expect(game.S.mem[mourning], 'траур уже кончился — проверка не про ту фазу').toBe(true)
    expect(builds(game), '«развод соседа» снова получает соболезнование').toHaveLength(0)
    delete game.S.mem[mourning]
    expect(builds(game), 'кнопка в блоке без траура').toHaveLength(0)
  })
})

describe('пул соболезнований (#1673): живой, без имён и сумм, гейт умершего на месте', () => {
  /** Детекторы logic-слоя: имя персонажа или сумма в стебле кнопки (cat 6). */
  const lint = (lines: readonly string[]): string[] => lines.filter((t) =>
    Object.entries(PERSON_RE).some(([id, re]) => id !== 'alik' && re.test(t)) || sumsIn(t).size > 0)

  it('шесть живых стеблей, все уникальны по стеблю кнопки', async () => {
    const { game } = await makeGame()
    const lines = live(game)
    expect(lines.length, 'живых стеблей меньше шести — окно из четырёх ходов рефилит пул').toBeGreaterThanOrEqual(6)
    expect(new Set(lines.map(buttonStem)).size, 'стебли повторяются').toBe(lines.length)
  })

  it('имена и суммы не упоминаются; гейт is(alikDead) оставлен (умер Алик — «Соболезную») ', async () => {
    const { game } = await makeGame()
    const lines = live(game)
    expect(lint(lines), `строка с именем или суммой: ${lint(lines).join(' | ')}`).toEqual([])
    expect(lines.join(' '), 'соболезнование до смерти Алика').not.toMatch(/соболезн/i)
    game.S.mem.alik_dead = true
    expect(live(game).join(' '), 'умершему Алику соболезнования нет').toMatch(/соболезн/i)
  })

  it('НК: детекторы пула не слепы — имя и сумма ловятся', async () => {
    expect(lint(['Грачик, крепитесь.']), 'детектор имён слеп').not.toEqual([])
    expect(lint(['Держитесь. 50 000 верну.']), 'детектор сумм слеп').not.toEqual([])
  })

  it('прежние два живых стебля не переписаны', async () => {
    const { game } = await makeGame()
    const lines = live(game)
    expect(lines).toContain('Держитесь там.')
    expect(lines).toContain('Сочувствую. Правда.')
  })
})

describe('сценарий: соболезнования только у свежего бита арки (#1673)', () => {
  it('окно бита даёт кнопку, тихая фаза — ни одного соболезнования в посторонних блоках', async () => {
    // Тихая фаза держится тем, что арка не получает следующую серию: в живой партии она ждёт
    // каденцию и занятость канала, здесь ждём её же, сдвигая только час последней серии.
    const played = await playtest(41, 30, undefined, async (game) => {
      game.S.day = 250
      await game.playArc('grandpa')
    }, 'neutral', (game) => {
      const st = game.S.arcs.grandpa
      if (st) st.last = game.S.day
      return undefined
    })
    const fresh = (f?: { before?: Record<string, unknown>; mem?: Record<string, unknown> }): boolean =>
      [f?.before, f?.mem].some((m) => m?.grandpaDeathFresh === true)
    const blocks = played.acts.flatMap((a, turn) => (a.kind === 'send' ? [{ turn, texts: a.offered, f: played.world[turn] }] : []))
    const window = blocks.filter((b) => fresh(b.f))
    expect(window.length, 'блоков окна бита не было — сценарий пуст').toBeGreaterThan(0)
    expect(window.some((b) => b.texts.some(isCondole)), 'в окне бита соболезнования нет').toBe(true)
    const quiet = blocks.filter((b) => b.f?.before?.mourning === true && !fresh(b.f))
    expect(quiet.length, `тихой фазы траура не набралось: ${blocks.length} блоков`).toBeGreaterThanOrEqual(10)
    const found = quiet.filter((b) => b.texts.some(isCondole)).map((b) => `#${b.turn}: ${b.texts.join(' | ')}`)
    expect(found, 'соболезнование в тихой фазе').toEqual([])
    expect(logicFindings(played).filter((f) => f.id === 'arc-relevance').map((f) => `#${f.turn}: ${f.text}`)).toEqual([])
  }, 60_000)
})
