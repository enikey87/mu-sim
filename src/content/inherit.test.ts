// «Наследство дяди Тиграна» (#1439): письмо из Глендейла, обе ветки проигрышные, проводка в книгу лжи
// и окно отклика на развязку. Ветка «радоваться» теряет 54 000 ₽ Алика и уходит на четыре дня вперёд,
// ветка «отговорить» даёт достижение «Спаситель наследства» и обиду. Долг игрока не трогает ни одна.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { QUESTS } from './quests'
import { P_INH_BURNED, P_INH_REFUSED } from './rules/player-choice-pools'
import { INH_BURNED_B, INH_REFUSED_B } from './world'
import { alikDead, endgame, inhBurned, inhDoneAt, inhRefused, mourning } from './memkeys'

const LETTER_START = 'УВАЖАЕМЫЙ Г-Н АЛИК ВОЗДУХОНЕСЯН'
const BURNED = 'Тиграна не существует'
const textOf = (m: { kind: string; text?: string }): string => (m.kind === 'text' ? String(m.text) : '')
const frame = (game: Game) => { game.S.choices = null; return game.buildChoices() }
const windowBtn = (game: Game) => frame(game).find((c) => c.act === 'inhDone')
/** id активной сцены: читаем через параметр, чтобы сужение `S.scene = null` в тесте не сужало тип до never. */
const sceneId = (game: Game): string | undefined => game.S.scene?.id
const alikSince = (game: Game, from: number): string =>
  game.S.msgs.slice(from).filter((m) => m.kind === 'text' && m.from === 'alik').map(textOf).join(' ')

/** Партия до письма: квест берётся настоящим правилом PickQuest, как в живой игре. */
async function letterArrives(game: Game): Promise<void> {
  game.S.day = 210
  for (let i = 0; i < 300; i++) {
    game.S.scene = null
    await game.fire('PickQuest')
    if (sceneId(game) === 'q_inherit') return
  }
  throw new Error('квест «наследство» не выпал за 300 PickQuest — проверка пустеет')
}

async function pick(game: Game, go: 'believe' | 'refuse'): Promise<void> {
  game.S.choices = null
  const c = game.choices.find((x) => x.scene && x.go === go)
  expect(c, `ветки ${go} нет в блоке`).toBeDefined()
  await game.send(c!)
}

describe('письмо из Глендейла: обе ветки проигрышные (#1439)', () => {
  it('письмо приходит капсом, регистрирует наследство как место денег и предлагает ровно два выбора', async () => {
    const { game } = makeGame({ seed: 3 })
    await letterArrives(game)
    const letter = game.S.msgs.map(textOf).find((t) => t.startsWith(LETTER_START))
    expect(letter, 'письма в ленте нет').toBeDefined()
    expect(letter!, 'письмо потеряло капс оригинала').not.toMatch(/[а-яё]/)
    expect(letter!, 'письмо называет квартиру, заправки и барбершоп').toContain('БАРБЕРШОП')
    expect(game.S.ledger.claims.some((c) => c.claimKey === 'money_inheritance'), 'письмо не записало утверждение о наследстве').toBe(true)
    game.S.choices = null
    const opts = game.choices.filter((c) => c.scene)
    expect(opts.map((c) => c.go).sort()).toEqual(['believe', 'refuse'])
  })

  it('ветка «радоваться»: четыре дня спустя Тиграна нет, потеряны 54 000 Алика, долг не тронут, достижения нет', async () => {
    const { game } = makeGame({ seed: 3 })
    await letterArrives(game)
    const day = game.S.day
    const debt = game.S.debt
    const from = game.S.msgs.length
    await pick(game, 'believe')
    const said = alikSince(game, from)
    expect(said, 'развязки «Тиграна не существует» нет').toContain(BURNED)
    expect(said, 'потеря своей суммы не названа').toContain('Пятьдесят четыре тысячи')
    expect(game.S.day - day, 'развязка пришла не через четыре дня').toBe(4)
    expect(game.S.msgs.slice(from).some((m) => m.kind === 'sep'), 'прыжок календаря не показан разделителем дат').toBe(true)
    expect(game.S.mem[inhBurned], 'ветка не записала, что наследство сгорело').toBe(true)
    expect(game.S.mem[inhRefused], 'ветка «радоваться» записала обиду').toBeUndefined()
    expect(game.S.debt, 'потеря Алика вычтена из долга игрока').toBe(debt)
    expect(game.S.ach.q_inherit, '«Спаситель наследства» выдан за проигранную ветку').toBeUndefined()
  })

  it('ни один узел гэга не двигает деньги и долг игрока: свои 54 000 — только слова Алика', () => {
    const money = Object.values(QUESTS.q_inherit.nodes).flatMap((n) => (n.fx?.money || n.fx?.debt || n.fx?.barter || n.fx?.invoice ? [n] : []))
    expect(money, 'узел гэга двигает счёт партии').toEqual([])
  })

  it('ветка «отговорить»: достижение и обида, деньги целы, сгоревшего наследства в партии нет', async () => {
    const { game } = makeGame({ seed: 3 })
    await letterArrives(game)
    const debt = game.S.debt
    const mood = game.S.mood
    const from = game.S.msgs.length
    await pick(game, 'refuse')
    const said = alikSince(game, from)
    expect(said, 'обиды Алика нет').toMatch(/ТЫ ПОНЯЛ,? ЧТО ТЫ СДЕЛАЛ/)
    expect(game.S.ach.q_inherit, 'достижение «Спаситель наследства» не выдано').toBeDefined()
    expect(game.S.mem[inhRefused], 'обида не зафиксирована фактом').toBe(true)
    expect(game.S.mem[inhBurned], 'отказная ветка записала сгоревшее наследство').toBeUndefined()
    expect(game.S.mood, 'обида не сдвинула настроение').toBeLessThan(mood)
    expect(game.S.debt, 'отказная ветка двинула долг игрока').toBe(debt)
    expect(said, 'отказная ветка рассказывает сгоревшее наследство').not.toContain(BURNED)
    expect(said, 'отказная ветка не сказала про пропавшего юриста').toContain('Юрист пропал')
  })

  it('повтор срабатывания за партию запрещён: второй раз квест не запускается и тронуть нечего', async () => {
    const { game } = makeGame({ seed: 3 })
    await letterArrives(game)
    await pick(game, 'refuse')
    expect(game.questAllowed('q_inherit'), 'квест доступен после прохождения').toBe(false)
    for (let i = 0; i < 300; i++) {
      game.S.scene = null
      await game.fire('PickQuest')
      expect(sceneId(game), 'квест выпал второй раз').not.toBe('q_inherit')
    }
  })

  it('квест не берётся до 200-го дня, в эндгейме, при смерти Алика и в трауре', () => {
    const { game } = makeGame()
    expect(game.questAllowed('q_inherit'), 'квест доступен в начале партии').toBe(false)
    game.S.day = 205
    expect(game.questAllowed('q_inherit'), 'квест доступен в середине партии').toBe(true)
    for (const key of [endgame.active, alikDead, mourning]) {
      game.S.mem[key] = true
      expect(game.questAllowed('q_inherit'), `квест доступен при ${key}`).toBe(false)
      delete game.S.mem[key]
    }
  })
})

describe('проводка в книгу лжи: «так наследство или заправки?» (#1439)', () => {
  it('после письма игрок может поймать Алика на другом месте денег', async () => {
    const { game } = makeGame({ seed: 3 })
    await letterArrives(game)
    await game.say([{ t: 'Деньги лежат в банке. В трёхлитровой, с огурцами.', claims: ['money_jar'] }])
    const c = frame(game).find((x) => x.act === 'catchLie')
    expect(c, 'кнопки «Поймать на лжи» после письма и другой версии нет').toBeDefined()
    expect(c!.text).toContain('наследстве')
    const caught = Number(game.S.mem.caught ?? 0)
    await game.send(c!)
    expect(Number(game.S.mem.caught ?? 0), 'поимка не засчитана').toBe(caught + 1)
  })

  it('продолжение утверждения — по ветке: сгоревшее наследство или замороженное', async () => {
    const burned = makeGame({ seed: 3 }).game
    await letterArrives(burned)
    await pick(burned, 'believe')
    burned.S.day += 11
    const from = burned.S.msgs.length
    await burned.callback()
    expect(alikSince(burned, from), 'сгоревшей ветки нет в воспоминании Алика').toContain('Наследство сгорело')

    const refused = makeGame({ seed: 9 }).game
    await letterArrives(refused)
    await pick(refused, 'refuse')
    refused.S.day += 11
    const from2 = refused.S.msgs.length
    await refused.callback()
    const said = alikSince(refused, from2)
    expect(said, 'отказная ветка говорит о сгоревшем наследстве').not.toContain('Наследство сгорело')
    expect(said, 'отказного продолжения нет').toContain('заморожено до извинений')
  })
})

describe('окно отклика на развязку (#1439)', () => {

  const burn = async (seed = 3) => {
    const { game } = makeGame({ seed })
    await letterArrives(game)
    await pick(game, 'believe')
    expect(game.S.mem[inhDoneAt], 'развязка не штампует ход события').toBe(game.S.stats.sent)
    return game
  }
  const refuse = async (seed = 9) => {
    const { game } = makeGame({ seed })
    await letterArrives(game)
    await pick(game, 'refuse')
    expect(game.S.mem[inhDoneAt], 'отказная развязка не штампует ход события').toBe(game.S.stats.sent)
    return game
  }

  it('горелая развязка: свой пул вопроса и парный ответ про нотариусов, а не про обиду', async () => {
    for (const seed of [3, 5, 7, 11]) {
      const game = await burn(seed)
      const btn = windowBtn(game)
      expect(btn, `сид ${seed}: на развязке отклика нет — событие повисает`).toBeDefined()
      const i = (P_INH_BURNED as readonly string[]).indexOf(btn!.text)
      expect(i, `сид ${seed}: кнопка не из пула горелой ветки: ${btn!.text}`).toBeGreaterThanOrEqual(0)
      const from = game.S.msgs.length
      await game.send(btn!)
      const said = alikSince(game, from)
      expect(said, `сид ${seed}: ответ не по выбранной строке — ${said}`).toContain(INH_BURNED_B[i])
      expect(
        said.includes(INH_REFUSED_B[0]) || said.includes(INH_REFUSED_B[1]),
        `сид ${seed}: горелой ветке Алик отвечает про обиду — ${said}`,
      ).toBe(false)
    }
  })

  it('отказная развязка: свой пул вопроса и парный ответ про обиду, без нотариусов и 54 000', async () => {
    for (const seed of [9, 12, 2, 6]) {
      const game = await refuse(seed)
      const btn = windowBtn(game)
      expect(btn, `сид ${seed}: на отказной развязке отклика нет`).toBeDefined()
      const i = (P_INH_REFUSED as readonly string[]).indexOf(btn!.text)
      expect(i, `сид ${seed}: кнопка не из пула отказной ветки: ${btn!.text}`).toBeGreaterThanOrEqual(0)
      const from = game.S.msgs.length
      await game.send(btn!)
      const said = alikSince(game, from)
      expect(said, `сид ${seed}: ответ не по выбранной строке — ${said}`).toContain(INH_REFUSED_B[i])
      expect(INH_BURNED_B.some((t) => said.includes(t)), `сид ${seed}: отказник слышит про сгоревшее наследство — ${said}`).toBe(false)
    }
  })

  it('ответ потребляет окно; за пределами трёх ходов и после ответа кнопки нет', async () => {
    const game = await burn()
    const at = Number(game.S.mem[inhDoneAt])
    game.S.stats.sent = at + 4
    expect(windowBtn(game), 'окно живёт дольше трёх ходов').toBeUndefined()
    game.S.stats.sent = at + 3
    const btn = windowBtn(game)
    expect(btn, 'внутри окна кнопки нет').toBeDefined()
    await game.send(btn!)
    expect(game.S.mem[inhDoneAt], 'ответ не потребил окно').toBeUndefined()
    expect(windowBtn(game), 'после ответа кнопка жива').toBeUndefined()
  })
})
