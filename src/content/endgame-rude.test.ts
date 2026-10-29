// Терминальные эпилоги закрывают грубую лестницу (#1576): после экрана «Вендетты» и «Кровного врага»
// мир заморожен, и на крик отвечает колода эпилога, а не ступень ссоры из обычных пулов.
// Контроль каждого случая — та же партия до экрана: там правило лестницы обязано сработать, иначе
// проверка не доказывала бы, что сценарий вообще бьёт в эту ступень.
import { describe, expect, it } from 'vitest'
import { makeGame, flush } from '../test/helpers'
import type { Game } from '../engine/game'
import type { Facts } from '../engine/rules'
import { valueOf, type Entry } from './fact'
import * as T from './rude'
import { HEAT, blocked, coldWar, count, endgame, polite } from './memkeys'
import type { Rng } from '../engine/rng'
import { CHRONIC_RUDE_AFTER_VENDETTA, ENDING_MIN_DAY } from './finales'

const messages = (game: Game, from = 0): string[] =>
  game.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))
const fire = (game: Game, facts: Facts) => game.fire('PlayerMessage', facts)

/** Тексты пулов — по значению строки, а не по обёртке Gated. */
const pool = (...pools: ReadonlyArray<readonly unknown[]>): Set<string> =>
  new Set(pools.flat().map((e) => {
    const v = valueOf(e as Entry<string | { t: string }>)
    return typeof v === 'string' ? v : v.t
  }))

/** Строки обычной грубой лестницы: родня, звонки мамы, блок и объявление схода. */
const LADDER_TEXTS = pool(
  ...Object.values(T.RUDE_FAMILY),
  T.RUDE_CALLS_VOICE, T.RUDE_CALLS_ALIK, T.RUDE_BLOCK_SYS,
  T.BLOCK_MAMA, T.BLOCK_OFFICE, T.RUDE_ALT, T.BLOCK_LIFTED,
  T.VENDETTA.map(([, said]) => (typeof said === 'string' ? said : said.t)),
  T.COUNTERSUIT.map(([, said]) => (typeof said === 'string' ? said : said.t)),
  T.APPEAL,
)

interface LadderCase {
  name: string
  /** Правило-ступень, в которую бьёт сценарий (префикс для родни: кто из троих напишет — выбор колоды). */
  rule: string
  facts: Facts
  mem?: Record<string, unknown>
  /** Ступени с once, уже сыгранные в контрольной партии (встречный иск). */
  once?: string[]
  /** Свой бросок: случай с odds (привычка к крику) без него не докажет, во что бьёт. */
  rng?: Rng
}

const CASES: LadderCase[] = [
  { name: 'S0 обида', rule: 'Tone_Rude', facts: { tone: 'rude' } },
  { name: 'S0 повторный крик', rule: 'Tone_Rude_Again', facts: { tone: 'rude' }, mem: { [count.rude]: 2 } },
  {
    name: 'S1 родня в личке', rule: 'Rude_Family_', facts: { tone: 'rude' },
    mem: { [HEAT]: 1, 'intro.karine': true, 'intro.samvel': true, 'intro.arsen': true },
  },
  { name: 'S2 звонки мамы', rule: 'Rude_Calls', facts: { tone: 'rude' }, mem: { [HEAT]: 2 } },
  { name: 'S3 блок', rule: 'Rude_Block', facts: { tone: 'rude' }, mem: { [HEAT]: 3 } },
  { name: 'S3 крик в блоке', rule: 'Rude_WhileBlocked', facts: { tone: 'rude' }, mem: { [blocked]: true } },
  { name: 'S3 вежливое в блоке', rule: 'Tone_WhileBlocked', facts: { tone: 'neutral' }, mem: { [blocked]: true } },
  { name: 'S4 семейный суд', rule: 'Rude_Tribunal', facts: { tone: 'rude' }, mem: { [HEAT]: 4 } },
  { name: 'S5 регламент после суда', rule: 'Rude_Polite', facts: { tone: 'rude' }, mem: { [polite]: true } },
  { name: 'объявление схода', rule: 'Rude_Vendetta', facts: { tone: 'rude' }, mem: { [count.rude]: 14 } },
  {
    name: 'вежливость после серии криков', rule: 'Tone_MissRude', facts: { tone: 'neutral' },
    mem: { [count.rude]: 15, [HEAT]: 0 }, rng: { random: () => 0 },
  },
  { name: 'холодная война: крик', rule: 'ColdWar_Rude', facts: { tone: 'rude' }, mem: { [coldWar]: true } },
  { name: 'холодная война: просьба', rule: 'ColdWar_Request', facts: { tone: 'neutral', category: 'request' }, mem: { [coldWar]: true } },
  { name: 'прямая угроза', rule: 'Tone_ViolentThreat', facts: { tone: 'rude', category: 'violent-threat' } },
  { name: 'запугивание', rule: 'Tone_Intimidation', facts: { tone: 'rude', category: 'intimidation' } },
  { name: 'угроза судом', rule: 'Tone_Threat_Hot', facts: { tone: 'threat' }, mem: { [HEAT]: 2 } },
  { name: 'апелляция вместо встречного иска', rule: 'Tone_Threat_Hot_Again', facts: { tone: 'threat' }, mem: { [HEAT]: 2 }, once: ['Tone_Threat_Hot'] },
]

/** Ни одна ступень таблицы: ответ эпилога может быть и не Tone_Default — суд идёт своей линией, — но не лестницей. */
const LADDER = new RegExp(`^(${CASES.map((c) => c.rule).join('|')})`)

/** Партия доехала до эпилога вражды: экран «Вендетты» сыгран и закрыт. */
async function toVendetta(game: Game): Promise<void> {
  game.S.mem.vendetta = true
  game.S.day = ENDING_MIN_DAY
  await game.fire('CheckEnding')
  expect(game.S.ending, 'экран вендетты').toBe('vendetta')
  await game.closeEnding()
  await flush()
}

/** Партия добрала хронику после схода: экран «Кровного врага» сыгран и закрыт. */
async function toBloodfeud(game: Game): Promise<void> {
  game.S.mem.vendetta = true
  game.S.mem['count.rudeAfterVendetta'] = CHRONIC_RUDE_AFTER_VENDETTA
  await game.fire('CheckEnding')
  expect(game.S.ending, 'экран «Кровного врага»').toBe('bloodfeud')
  await game.closeEnding()
  await flush()
}

const ENDINGS = [
  { name: '«Вендетта»', enter: toVendetta, flow: endgame.vendetta },
  { name: '«Кровный враг»', enter: toBloodfeud, flow: endgame.bloodfeud },
] as const

for (const ending of ENDINGS) {
  describe(`терминальный эпилог ${ending.name}: грубая лестница молчит (#1576)`, () => {
    for (const c of CASES) {
      it(`${c.name}: ${c.rule} не отвечает, отвечает эпилог`, async () => {
        // Контроль: до экрана те же факты бьют ровно в эту ступень — иначе случай ничего не проверяет.
        const control = makeGame({ rng: c.rng }).game
        for (const n of c.once ?? []) control.S.rules.once[n] = true
        Object.assign(control.S.mem, c.mem ?? {})
        expect((await fire(control, c.facts))?.name, `сценарий бьёт в ${c.rule}`).toMatch(new RegExp(`^${c.rule}`))

        const { game } = makeGame({ rng: c.rng })
        await ending.enter(game)
        expect(game.S.mem[endgame.active], 'мир заморожен').toBe(true)
        expect(game.S.mem[ending.flow], 'свой поток эпилога').toBe(true)
        for (const n of c.once ?? []) game.S.rules.once[n] = true
        Object.assign(game.S.mem, c.mem ?? {})
        const from = game.S.msgs.length

        const fired = await fire(game, c.facts)

        expect(fired?.name ?? '', 'ступень лестницы не отвечает в эпилоге').not.toMatch(LADDER)
        const said = messages(game, from).filter((t) => LADDER_TEXTS.has(t))
        expect(said, 'строки обычных пулов в ответе').toEqual([])
      })
    }
  })
}
