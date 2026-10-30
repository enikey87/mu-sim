// Свип коллекционных концовок (#1599): SETUP → срабатывание → экран → эпилог-проводка → досье.
// Серийные финалы здесь не дублируются (их SETUP — в finales.test.ts), сценарные драйверы дорог —
// другой уровень (scenarios.test.ts). Условия концовок ставятся фактами; payday_* проходят свою сцену,
// потому что факт `payday` рождается только в ней — подмена его в памяти прятала бы мёртвый исход.
import { describe, expect, it } from 'vitest'
import { makeGame, memStorage } from '../test/helpers'
import { CHRONIC_RUDE_AFTER_VENDETTA, ENDING_MIN_DAY, ENDINGS, type EndingId } from './finales'
import { endgame } from './memkeys'
import { COINS_BRIDGE_CATCHES, DETECTIVE_CATCHES } from './payday'
import { ENDGAME_BLOODFEUD_GROUP, ENDGAME_GROUP, ENDGAME_VENDETTA_GROUP, EPILOGUE_BANNER } from './endgame'
import { uiOf, viewOf } from '../ui/view'
import type { Game } from '../engine/game'

const messages = (g: Game): string[] =>
  g.S.msgs.flatMap((m) => (m.kind === 'text' || m.kind === 'sys' ? [m.text] : []))

/** Кнопка сцены по `go`: после выбора сцена сама ведёт к следующему узлу. */
const pick = async (g: Game, go: string): Promise<void> => {
  g.S.choices = null
  const c = g.choices.find((x) => x.go === go)
  expect(c, `кнопки ${go} на сцене нет`).toBeDefined()
  await g.send(c!)
}

/** День выплаты своим ходом: анонс → сумка → дележ → (великая отмазка: принять) → исход.
 *  Исход выбирает правило PaydayOutcome по фактам SETUP — здесь его не подменяем. */
const payday = async (g: Game): Promise<void> => {
  await g.enterNode('payday', 'announce')
  await pick(g, 'bag')
  await pick(g, 'share')
  if (g.S.scene?.id === 'payday' && g.S.scene.node === 'grand') await pick(g, 'accept')
}

/** Факты-условия концовки, поставленные напрямую (юнит-уровень); сцена — там, где факт рождается сам. */
type Setup = (g: Game) => void | Promise<void>

/** Куда ведёт эпилог после экрана: свободная партия, терминальный поток вражды/отлучения или группа выплаты. */
type Epilogue = 'free' | 'vendetta' | 'bloodfeud' | 'payout'

/** Одна строка на концовку: `Record<EndingId, …>` не даст добавить концовку без условий и проводки. */
const SWEEP: Record<EndingId, { setup: Setup; epilogue: Epilogue }> = {
  family: { setup: (g) => { g.S.mem['finale.samvel'] = 'groom' }, epilogue: 'free' },
  heir: { setup: (g) => { g.S.mem['finale.alik_death'] = 'will' }, epilogue: 'free' },
  ram: { setup: (g) => { g.S.mem['finale.boris'] = 'toyou' }, epilogue: 'free' },
  alik: { setup: (g) => { g.S.mem['finale.garik'] = 'cutter' }, epilogue: 'free' },
  honest: { setup: (g) => { g.S.mem['finale.grant'] = 'ally' }, epilogue: 'free' },
  vendetta: {
    // сход объявлен, окно примирения вышло: `vendettaFall` считается от ходов после схода
    setup: (g) => { g.S.mem.vendetta = true },
    epilogue: 'vendetta',
  },
  bloodfeud: {
    setup: (g) => { Object.assign(g.S.mem, { vendetta: true, 'count.rudeAfterVendetta': CHRONIC_RUDE_AFTER_VENDETTA, 'count.sorry': 0 }) },
    epilogue: 'bloodfeud',
  },
  multiverse: {
    // единственная концовка группы выплаты: вход в неё — выплата (заморозка мира), потом 800-й день
    setup: async (g) => {
      await payday(g)
      await g.closeEnding()
      expect(g.S.mem[endgame.active], 'вход в группу выплаты').toBe(true)
      g.S.day = 800
      g.S.stats.sent = 300
    },
    epilogue: 'payout',
  },
  // исходы Дня выплаты: цепочка условия (real: «Святой» + суд; coins: две разные поимки) — фактами,
  // а сам `payday` — сценой, иначе мёртвый производитель исхода прошёл бы свип незамеченным
  payday_real: { setup: async (g) => { Object.assign(g.S.ach, { saint: 190, court: 200 }); await payday(g) }, epilogue: 'payout' },
  payday_detective: { setup: async (g) => { g.S.mem.caughtUnique = DETECTIVE_CATCHES; await payday(g) }, epilogue: 'payout' },
  payday_coins: { setup: async (g) => { g.S.mem.caughtUnique = COINS_BRIDGE_CATCHES; await payday(g) }, epilogue: 'payout' },
  payday_lavash: { setup: async (g) => { g.S.mem['crypto.hodl'] = true; await payday(g) }, epilogue: 'payout' },
  payday_niva: { setup: async (g) => { g.S.mem['finale.niva'] = 'chose'; await payday(g) }, epilogue: 'payout' },
  payday_strasbourg: { setup: async (g) => { g.S.ach.strasbourg = 190; await payday(g) }, epilogue: 'payout' },
  payday_notyou: { setup: async (g) => { g.S.mem['finale.razmik'] = 'default'; await payday(g) }, epilogue: 'payout' },
  payday_default: { setup: payday, epilogue: 'payout' },
}

describe('свип коллекционных концовок (#1599)', () => {
  it('реестр и свип совпадают: у каждой концовки есть условия и эпилог, лишних нет', () => {
    const ids = ENDINGS.map((e) => e.id)
    expect(ids, 'реестр — те самые 16, что проверяет свип').toHaveLength(16)
    expect(new Set(ids).size).toBe(ids.length)
    expect(Object.keys(SWEEP).sort()).toEqual([...ids].sort())
    for (const e of ENDINGS) expect(typeof SWEEP[e.id].setup, `${e.id}: SETUP не задан`).toBe('function')
  })

  // НК: снять условие у любой концовки (сделать всегда-истинной) — здесь она сработает без SETUP.
  it('без сконструированных условий ни одна концовка не срабатывает — всегда-истинной в реестре нет', async () => {
    const { game } = makeGame()
    game.S.day = 800 // и третий акт, и 800-й день «Параллельной вселенной»
    game.S.stats.sent = 300
    await game.fire('CheckEnding')
    expect(game.S.ending).toBeNull()
  })

  // НК: снять у multiverse `missing(endgame.bloodfeud)` — сохранение с флагом отлучения получит выплату.
  it('«Параллельная вселенная» не выходит из терминального эпилога: флаг группы закрывает её и без факта схода', async () => {
    const { game } = makeGame()
    game.S.day = 800
    game.S.stats.sent = 300
    // флаг эпилога живёт в сохранении; исходный факт схода мог не переехать — гейт держит именно флаг
    Object.assign(game.S.mem, { [endgame.active]: true, [endgame.bloodfeud]: true })
    const rule = await game.fire('CheckEnding')
    expect(rule?.name, 'концовка группы выплаты').toBe('Endgame_NoEnding')
    expect(game.S.ending).toBeNull()
  })

  it('каждая концовка: SETUP → срабатывание → экран из реестра → эпилог-проводка → досье', async () => {
    const storage = memStorage()
    let prev: Game | null = null
    for (const e of ENDINGS) {
      prev?.reset() // новая партия, коллекция устройства переживает сброс
      const { game } = makeGame({ storage })
      game.S.day = ENDING_MIN_DAY
      // пробы заморозки до SETUP: вход в терминальный эпилог или в группу выплаты снимает события
      // и обнуляет простой; свободная концовка оставляет и то, и другое
      game.scheduleEvent(game.S.day + 2, 'StoryBeat', { sweepProbe: true })
      const probe = () => game.S.rules.schedule.some((it) => it.kind === 'event' && it.facts?.sweepProbe === true)
      game.S.offlineDays = 5

      await SWEEP[e.id].setup(game)
      if (game.S.ending !== e.id) await game.fire('CheckEnding')
      expect(game.S.ending, `${e.id}: условия неконструируемы — проверь достижимость (сработало: ${game.S.ending ?? 'ничего'})`).toBe(e.id)

      const view = viewOf(uiOf(game))
      expect(view.ending, `${e.id}: экран концовки`).toEqual({ id: e.id, title: e.title, text: e.text, icon: e.icon })
      expect(view.endingId).toBe(e.id)
      expect(e.icon, `${e.id}: иконка экрана`).toBeTruthy()
      expect(view.endings.find((r) => r.id === e.id), `${e.id}: строка досье`).toMatchObject({ got: true, title: e.title, icon: e.icon })
      expect(game.endingsSeen().has(e.id), `${e.id}: коллекция устройства`).toBe(true)

      await game.closeEnding()
      const epilogue = SWEEP[e.id].epilogue
      const text = messages(game).join(' ')
      expect(game.S.ending).toBeNull()
      expect(!!game.S.mem[endgame.active], `${e.id}: заморозка мира`).toBe(epilogue !== 'free')
      expect(!!game.S.mem[endgame.vendetta], `${e.id}: поток вражды`).toBe(epilogue === 'vendetta')
      expect(!!game.S.mem[endgame.bloodfeud], `${e.id}: поток отлучения`).toBe(epilogue === 'bloodfeud')
      expect(probe(), `${e.id}: событие мира после эпилога`).toBe(epilogue === 'free')
      if (epilogue === 'free') {
        expect(text, `${e.id}: свободная концовка без эпилога`).not.toContain(EPILOGUE_BANNER)
        expect(game.S.offlineDays, `${e.id}: простой свободной партии`).toBe(5)
        expect(game.choices.map((c) => c.act ?? ''), `${e.id}: кнопки группы`).not.toContain('endgameMoney')
      } else {
        expect(game.S.scene, `${e.id}: сцена заморожена`).toBeNull()
        expect(game.S.offlineDays, `${e.id}: простой сброшен заморозкой`).toBe(0)
        const group = epilogue === 'vendetta' ? ENDGAME_VENDETTA_GROUP : epilogue === 'bloodfeud' ? ENDGAME_BLOODFEUD_GROUP : ENDGAME_GROUP
        expect(text, `${e.id}: своя группа эпилога`).toContain(group)
        for (const other of [ENDGAME_GROUP, ENDGAME_VENDETTA_GROUP, ENDGAME_BLOODFEUD_GROUP].filter((g) => g !== group)) {
          expect(text, `${e.id}: чужая группа эпилога`).not.toContain(other)
        }
      }
      prev = game
    }

    const dossier = viewOf(uiOf(prev!))
    expect(dossier.endingTotal, 'досье «Концовки N/16»').toBe(ENDINGS.length)
    expect(dossier.endingCount, 'все концовки открыты сконструированными условиями').toBe(ENDINGS.length)
    expect(dossier.endings.map((r) => r.got).filter(Boolean), 'каждая строка досье открыта').toHaveLength(ENDINGS.length)
  }, 30_000)
})
