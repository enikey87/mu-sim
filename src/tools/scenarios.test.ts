// Постоянный сюит проблемных сценариев грубого пути (#1580): три дороги и нейтральная страховка.
// Дороги, которые раньше ловились только живой партией, играются настоящими ходами через playtest():
// драйвер кричит до схода, затем переключает поведение — извиняется, молчит или продолжает кричать.
// Инварианты — по флагам, событиям и отсутствию строк пулов, а не по тексту реплики: замена строки
// пула тест не ломает. Сдвинувшийся путь падает явно (драйвер называет ход и советует сдвинуть сид),
// а упавшая проверка печатает полную расшифровку партии — разбор без повторного прогона.
import { describe, expect, it } from 'vitest'
import { openOffer, playtest, transcript, type Driver, type DriverAct, type Played, type WorldFrame } from './playtest'
import { RUDE_SHOUTS } from './shouts'
import { CHRONIC_RUDE_AFTER_VENDETTA, ENDING_MIN_DAY } from '../content/finales'
import { FEUD_LIFTED, FEUD_LIFTED_STICKER, FEUD_PRICE } from '../content/rude'
import { count, endgame, vendettaLifted } from '../content/memkeys'
import { valueOf, type Entry, type Line } from '../content/fact'
import {
  ENDGAME_BLOODFEUD_FORMALITIES, ENDGAME_BLOODFEUD_LEAVERS, ENDGAME_BLOODFEUD_OPEN,
  ENDGAME_VENDETTA_ACT, ENDGAME_VENDETTA_ACT_SIGNED, ENDGAME_VENDETTA_APOLOGY, ENDGAME_VENDETTA_ASK,
  ENDGAME_VENDETTA_FORMALITIES, ENDGAME_VENDETTA_LEAVE, ENDGAME_VENDETTA_MUTE, ENDGAME_VENDETTA_OPEN, ENDGAME_VENDETTA_RENAMES,
} from '../content/endgame'

/** Ход настоящей реплики игрока, когда кнопки извинения в кадре нет. */
const APOLOGY = 'Прости, Алик, я погорячился'
const isApology = (text: string): boolean => /^(алик[,\s]+)?(прости|извин|сорри|sorry|ладно, я перегнул|мир\?)/i.test(text.trim())
const isRudeTone = (tone: string): boolean => tone === 'rude' || tone === 'threat'

/** Ступени обычной грубой лестницы (#1576): после терминального экрана ни одна не отвечает. */
const LADDER = /^(Tone_Rude|Tone_WhileBlocked|Tone_MissRude|Tone_ViolentThreat|Tone_Intimidation|Tone_Threat_Hot|Rude_Family_|Rude_Calls|Rude_Block|Rude_WhileBlocked|Rude_Tribunal|Rude_Polite|Rude_Vendetta|ColdWar_Rude|ColdWar_Request)/

/** Что сценарий увидел в партии: ходы перехода и момент, когда экран концовки сыгран и закрыт. */
interface Trace {
  /** Ход, на котором мир объявил сход. */
  feudAt?: number
  /** Ход, на котором сход снят, и арки, уже начатые к этому ходу. */
  liftedAt?: number
  arcsAtLift?: string[]
  /** Ход, на котором терминальный экран сыгран: флаги эпилога уже стоят. */
  screenAt?: { turn: number; ending: 'vendetta' | 'bloodfeud'; day: number }
  /** Криков игрока после экрана. */
  shoutsAfterScreen: number
}

/**
 * Сценарный игрок грубого пути: кричит до схода (кнопкой или свободным текстом из пула), а после —
 * `apologise` (извиняется до снятия схода, дальше вежливая партия), `silent` (не извиняется вовсе)
 * или `shout` (продолжает кричать после экрана `shouts` раз). Возвращает `undefined` — ход бота.
 */
function roughRoad(after: 'apologise' | 'silent' | 'shout', caps = { rude: 60, shouts: 20 }): { driver: Driver; trace: Trace } {
  const trace: Trace = { shoutsAfterScreen: 0 }
  const driver: Driver = (game, turn): DriverAct => {
    const mem = game.S.mem
    const feud = mem.vendetta === true
    if (feud && trace.feudAt === undefined) trace.feudAt = turn
    if (!feud && trace.feudAt !== undefined && trace.liftedAt === undefined) {
      trace.liftedAt = turn
      trace.arcsAtLift = Object.keys(game.S.arcs)
    }
    if (trace.screenAt === undefined) {
      if (mem[endgame.bloodfeud]) trace.screenAt = { turn, ending: 'bloodfeud', day: game.S.day }
      else if (mem[endgame.vendetta]) trace.screenAt = { turn, ending: 'vendetta', day: game.S.day }
    }

    if (game.battery.dead) return { kind: 'charge' }
    const job = game.S.msgs.find((m) => m.kind === 'job' && !m.answered)
    if (job) return { kind: 'job', yes: !mem[endgame.active] }
    const offer = openOffer(game)
    if (offer) return { kind: 'card', pick: 'take' }

    const choices = game.choices
    const shout = (): DriverAct => {
      const rude = choices.find((c) => isRudeTone(c.tone) && !isApology(c.text))
      return rude
        ? { kind: 'send', i: choices.indexOf(rude) }
        : { kind: 'free', text: RUDE_SHOUTS[turn % RUDE_SHOUTS.length]!, tone: 'rude' }
    }

    if (trace.feudAt === undefined) {
      if (turn >= caps.rude) throw new Error(`грубиян не дошёл до схода за ${caps.rude} ходов — дорога перестала бить в вражду: сдвиньте сид или обновите шаги`)
      return shout()
    }
    if (after === 'shout') {
      if (trace.screenAt === undefined) return shout()
      if (trace.shoutsAfterScreen >= caps.shouts) return { kind: 'idle' }
      trace.shoutsAfterScreen++
      return shout()
    }
    if (after === 'silent') {
      // молчун не берёт ни прямого извинения, ни посредника: сход обязан дожить до своего экрана
      if (!feud && trace.screenAt === undefined) throw new Error('молчун снял сход без извинения — дорога перестала бить в вражду: сдвиньте сид или обновите шаги')
      const calm = choices.find((c) => !isRudeTone(c.tone) && c.tone !== 'cow' && c.act !== 'sorry' && c.act !== 'via' && !isApology(c.text))
      return calm ? { kind: 'send', i: choices.indexOf(calm) } : { kind: 'idle' }
    }
    if (feud) {
      if (turn > trace.feudAt + 20) throw new Error('извинение не снимает сход — дорога перестала бить в вражду: сдвиньте сид или обновите шаги')
      const sorry = choices.find((c) => c.act === 'sorry')
      return sorry ? { kind: 'send', i: choices.indexOf(sorry) } : { kind: 'free', text: APOLOGY, tone: 'polite' }
    }
    // мир: вежливая партия до Дня выплаты — тем же способом, что играет живой игрок
    const polite = choices.find((c) => c.tone === 'polite') ?? choices.find((c) => !isRudeTone(c.tone))
    return choices.length ? { kind: 'send', i: choices.indexOf(polite ?? choices[0]!) } : { kind: 'idle' }
  }
  return { driver, trace }
}

/** Тексты пулов — по значению строки, а не по обёртке Gated. */
const lines = (...pools: ReadonlyArray<readonly Line[]>): string[] => pools.flat().map((l) => {
  const v = valueOf(l as Entry<string | { t: string }>)
  return typeof v === 'string' ? v : v.t
})

const sysTexts = (p: Played): string[] => p.game.S.msgs.flatMap((m) => (m.kind === 'sys' ? [m.text] : []))
const saidTexts = (p: Played): string[] => p.game.S.msgs.flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))
/** Сообщения после терминального экрана: с асида харнесса, чтобы вступление эпилога тоже попало. */
const afterScreen = (p: Played): string[] => {
  const screen = p.asides.find((a) => a.text.startsWith('(экран концовки:'))
  return (screen ? p.game.S.msgs.slice(screen.at) : []).flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))
}
const framesSince = (p: Played, turn: number): WorldFrame[] => p.world.filter((f) => f.turn >= turn)

/** Падение проверки печатает полную расшифровку: разбор не требует повторного прогона с PLAYTEST_OUT. */
function verify(p: Played, assertions: () => void): void {
  try {
    assertions()
  } catch (e) {
    throw new Error(`${(e as Error).message}\n\n——— партия ${p.seed}, полная расшифровка ———\n${transcript(p)}`)
  }
}

describe('сценарии грубого пути (#1580)', () => {
  it('ДОРОГА 1 «раскаяние»: вражда снимается извинением после названной цены, мир возвращается и доходит до Дня выплаты', async () => {
    const { driver, trace } = roughRoad('apologise')
    const p = await playtest(1, 220, undefined, undefined, 'neutral', driver)
    const mem = p.game.S.mem
    const texts = sysTexts(p)
    verify(p, () => {
      // контроль: партия реально прошла живую вражду и лестницу, а не обошла дорогу
      expect(trace.feudAt, 'сценарий не дошёл до схода — дорога перестала бить в вражду: сдвиньте сид или обновите шаги').toBeDefined()
      // цена выхода названа первым прямым «прости» (#1570) — извинение прошло протокол, а не посредника
      expect(saidTexts(p).filter((t) => lines(FEUD_PRICE).includes(t)).length, 'цена выхода не прозвучала: первое «прости» не дошло до протокола').toBeGreaterThan(0)
      expect(mem.vendetta, 'сход остался объявленным').toBe(false)
      expect(mem.coldWar, 'холодная война осталась после принятого мира').toBe(false)
      expect(mem[vendettaLifted], 'метка снятия схода не поставлена').toBe(true)
      // маркер снятия слышен так же громко, как объявление: системная строка и стикер перемирия
      expect(texts, 'снятие схода не названо системной строкой').toContain(FEUD_LIFTED)
      expect(p.game.S.msgs.some((m) => m.kind === 'sticker' && m.e === FEUD_LIFTED_STICKER.e), 'стикер перемирия не прозвучал').toBe(true)
      // после снятия сюжет снова идёт: начинается арка, которой к моменту мира не было
      const startedAfter = Object.keys(p.game.S.arcs).filter((id) => !(trace.arcsAtLift ?? []).includes(id))
      expect(startedAfter, 'после снятия схода не началась ни одна арка — мир остался в режиме вражды').not.toEqual([])
      // и партия доходит до Дня выплаты: вражда больше не закрывает третий акт
      expect(texts, 'партия не дошла до «— День выплаты —»').toContain('— День выплаты —')
      expect(mem.payday, 'День выплаты не назвал исход').toBeTruthy()
    })
  }, 120_000)

  it('ДОРОГА 2 «крикун»: после «Кровного врага» лестница молчит, эпилог отлучения уникален, выплаты нет', async () => {
    const { driver, trace } = roughRoad('shout')
    const p = await playtest(3, 80, undefined, undefined, 'neutral', driver)
    const screen = trace.screenAt
    verify(p, () => {
      expect(screen?.ending, 'дорога не дошла до экрана «Кровного врага» — сдвиньте сид или обновите шаги').toBe('bloodfeud')
      expect(p.game.S.endings.bloodfeud, 'экран «Кровного врага» не был сыгран').toBeTruthy()
      expect(p.game.S.mem[endgame.bloodfeud], 'мир не вошёл в эпилог отлучения').toBe(true)
      expect(trace.shoutsAfterScreen, `после экрана не прозвучало ${20} криков — дорога не проверила эпилог`).toBeGreaterThanOrEqual(20)
      // контроль: до экрана лестница отвечала — иначе проверка молчания ничего не доказывает
      const before = framesSince(p, 0).filter((f) => f.turn < (screen?.turn ?? 0)).flatMap((f) => f.said)
      expect(before.some((s) => s.r && LADDER.test(s.r)), 'до экрана лестница не отвечала — сценарий не бьёт в дорогу').toBe(true)
      // регрессия #1576: ни одна ступень лестницы не отвечает после экрана
      const after = framesSince(p, screen?.turn ?? 0).flatMap((f) => f.said).filter((s) => s.r)
      expect(after.filter((s) => LADDER.test(s.r!)), 'грубая лестница ответила после терминального экрана').toEqual([])
      // ответ держит сам эпилог отлучения, а не обычные пулы
      const answered = afterScreen(p)
      expect(answered.some((t) => lines(ENDGAME_BLOODFEUD_FORMALITIES).includes(t)), 'эпилог отлучения не ответил своей формальностью').toBe(true)
      expect(answered.filter((t) => lines(ENDGAME_BLOODFEUD_OPEN, ENDGAME_BLOODFEUD_LEAVERS).includes(t)), 'вступление отлучения не прозвучало').not.toEqual([])
      // эпилог уникален: строки эпилога вражды в отлучении не звучат
      const vendettaPools = lines(ENDGAME_VENDETTA_OPEN, ENDGAME_VENDETTA_ACT, [ENDGAME_VENDETTA_ACT_SIGNED], ENDGAME_VENDETTA_APOLOGY, ENDGAME_VENDETTA_FORMALITIES, ENDGAME_VENDETTA_MUTE, ENDGAME_VENDETTA_RENAMES, ENDGAME_VENDETTA_LEAVE, ENDGAME_VENDETTA_ASK)
      expect(answered.filter((t) => vendettaPools.includes(t)), 'в отлучении прозвучали строки эпилога вражды').toEqual([])
      // выплаты после терминального экрана нет
      expect(sysTexts(p), 'после отлучения наступил День выплаты').not.toContain('— День выплаты —')
      expect(p.game.S.mem.payday, 'отлучение назвало исход выплаты').toBeUndefined()
    })
  }, 120_000)

  it('ДОРОГА 3 «молчун»: без извинений до третьего акта партия получает «Вендетту» и эпилог вражды, выплаты нет', async () => {
    const { driver, trace } = roughRoad('silent')
    const p = await playtest(4, 130, undefined, undefined, 'neutral', driver)
    const mem = p.game.S.mem
    const screen = trace.screenAt
    verify(p, () => {
      expect(screen?.ending, 'дорога не дошла до экрана «Вендетты» — сдвиньте сид или обновите шаги').toBe('vendetta')
      expect(screen!.day, 'экран встал раньше третьего акта').toBeGreaterThanOrEqual(ENDING_MIN_DAY)
      expect(Number(mem[count.sorry] ?? 0), 'молчун извинился — это уже другая дорога').toBe(0)
      expect(Number(mem[count.rudeAfterVendetta] ?? 0), 'крики после схода довели до «Кровного врага»').toBeLessThan(CHRONIC_RUDE_AFTER_VENDETTA)
      expect(p.game.S.endings.vendetta, 'экран «Вендетты» не был сыгран').toBeTruthy()
      expect(mem[endgame.vendetta], 'мир не вошёл в эпилог вражды').toBe(true)
      expect(mem[endgame.bloodfeud], 'эпилог вражды подменился отлучением').toBeUndefined()
      // эпилог вражды: акт приёма-передачи обид и мама-посредница, а не пулы отлучения
      const answered = afterScreen(p)
      expect(answered.some((t) => lines(ENDGAME_VENDETTA_ACT).includes(t)), 'акт приёма-передачи обид не прозвучал').toBe(true)
      expect(answered.some((t) => lines(ENDGAME_VENDETTA_ASK).includes(t)), 'мама-посредница не прозвучала').toBe(true)
      expect(answered.filter((t) => lines(ENDGAME_BLOODFEUD_OPEN, ENDGAME_BLOODFEUD_LEAVERS).includes(t)), 'во вражде прозвучали строки отлучения').toEqual([])
      // выплаты нет: вражда закрыла День выплаты навсегда
      expect(sysTexts(p), 'после вражды наступил День выплаты').not.toContain('— День выплаты —')
      expect(mem.payday, 'вражда назвала исход выплаты').toBeUndefined()
    })
  }, 120_000)

  it('ДОРОЖКА-НУЛЕВАЯ: нейтральная партия доходит до Дня выплаты — страховка достижимости денег', async () => {
    const p = await playtest(2, 260)
    const sys = sysTexts(p)
    verify(p, () => {
      expect(p.game.S.mem.vendetta, 'нейтральная партия объявила сход').toBeFalsy()
      expect(sys, 'нейтральная партия не дошла до «— День выплаты —»: выплата стала недостижимой').toContain('— День выплаты —')
      const outcome = p.game.S.mem.payday
      expect(outcome, 'День выплаты не назвал исход').toBeTruthy()
      expect(p.game.S.endings[`payday_${outcome}`], 'экран исхода выплаты не был сыгран').toBeTruthy()
      expect(sys.some((t) => t.startsWith('Алик добавил вас в группу «ДЕНЬ ВЫПЛАТЫ')), 'группа выплаты не открылась').toBe(true)
    })
  }, 120_000)
})
