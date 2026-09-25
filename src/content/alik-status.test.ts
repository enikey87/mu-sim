// Подпись профиля Алика (docs/design/alik-status.md): состояние мира одной системной строкой в конце хода.
import { describe, expect, it } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { valueOf, type LineSpec } from '../engine/rules'
import { ALIK_STATUS } from './misc'
import { HEAT } from './memkeys'

const statuses = (g: Game) => g.S.msgs.flatMap((m) => (m.kind === 'sys' && m.text.startsWith('Алик Воздухонесян изменил статус') ? [m.text] : []))
const HIDDEN = 'Алик скрыл от вас статус'
const hidden = (g: Game) => g.S.msgs.flatMap((m) => (m.kind === 'sys' && m.text === HIDDEN ? [m.text] : []))
const turn = async (g: Game) => { g.S.offlineDays = 0; await g.send({ text: 'Алик, как дела?', tone: 'polite' }) }
/** Крик доходит до блока (S3): ступень задаётся температурой ссоры, блок ставит правило Rude_Block. */
const rage = async (g: Game) => { g.S.offlineDays = 0; g.S.mem[HEAT] = 3; await g.send({ text: 'Алик, ты вор!', tone: 'rude' }) }
/** Серия за серией, пока настоящая серия не поставит состояние (или сериал не кончится). */
async function playUntil(g: Game, arc: string, holds: (g: Game) => boolean): Promise<void> {
  for (let i = 0; i < 20 && !holds(g); i++) {
    const before = statuses(g).length
    await g.playArc(arc)
    expect(statuses(g).length, `${arc}: статус до хода игрока`).toBe(before)
  }
  expect(holds(g), `${arc}: состояние не наступило`).toBe(true)
}
const nivaAway = (g: Game) => g.S.mem['niva.away'] === true

describe('статус Алика живёт миром', () => {
  it('«Нива» уехала: до серии статуса нет, после хода игрока — строка, один раз', async () => {
    const { game } = makeGame()
    await turn(game)
    expect(statuses(game)).toEqual([])
    await playUntil(game, 'niva', nivaAway)
    await turn(game)
    expect(statuses(game)).toEqual(['Алик Воздухонесян изменил статус: «Ищу «Ниву». Видели — звоните»'])
    for (let i = 0; i < 3; i++) await turn(game)
    expect(statuses(game)).toHaveLength(1)
  })
  it('Борис заболел и Размик на кране — свои строки; два открытых состояния — по одной строке за ход', async () => {
    const { game } = makeGame()
    await playUntil(game, 'boris', (g) => g.S.actors.boris?.sick === true)
    await playUntil(game, 'razmik', (g) => g.S.arcs.razmik !== undefined)
    await turn(game)
    expect(statuses(game)).toHaveLength(1)
    await turn(game)
    expect(statuses(game).sort()).toEqual([
      'Алик Воздухонесян изменил статус: «Сиделка барана. Звонить шёпотом»',
      'Алик Воздухонесян изменил статус: «Снимаю Размика с крана. Не отвлекать, высоко»',
    ].sort())
  })
  it('свадьба Самвела с тамадой — «Тамада»', async () => {
    const { game } = makeGame()
    Object.assign(game.S.mem, { 'intro.samvel': true, 'intro.tamada': true, 'wedding.samvel': true })
    await turn(game)
    expect(statuses(game)).toEqual(['Алик Воздухонесян изменил статус: «Тамада. До последнего тоста не беспокоить 🥂»'])
  })
  it('вежливость-убийца — голос колл-центра', async () => {
    const { game } = makeGame()
    game.S.mem.polite = true
    await turn(game)
    expect(statuses(game)).toEqual(['Алик Воздухонесян изменил статус: «Уважаемые клиенты! Ваше обращение очень важно для нас»'])
  })
  it('знакомство без состояния — строки нет: статус держит факт состояния, а не имя', async () => {
    const { game } = makeGame()
    Object.assign(game.S.mem, { 'intro.niva': true, 'intro.samvel': true, 'intro.tamada': true, 'finale.razmik': 'default' })
    Object.assign(game.S.arcs, { boris: { i: 1, last: 0 }, razmik: { i: 8, last: 0 } })
    for (let i = 0; i < 3; i++) await turn(game)
    expect(statuses(game)).toEqual([])
  })
  it('в блоке, при «смерти», с телефоном у Карине и в эндгейме — молчит путём игрока; «скрыл» только в блоке', async () => {
    const quiet: Record<string, { setup: (g: Game) => void; hidden: boolean }> = {
      блок: { setup: (g) => { g.S.mem.blocked = true }, hidden: true },
      смерть: { setup: (g) => { g.S.mem.alik_dead = true }, hidden: false },
      'телефон у Карине': { setup: (g) => { g.S.mem['phone.karine'] = true }, hidden: false },
      эндгейм: { setup: (g) => { g.S.mem['endgame.active'] = true }, hidden: false },
    }
    for (const [name, { setup, hidden: wantHidden }] of Object.entries(quiet)) {
      const { game } = makeGame()
      await playUntil(game, 'niva', nivaAway)
      setup(game)
      await turn(game)
      expect(statuses(game), name).toEqual([])
      expect(hidden(game), name).toEqual(wantHidden ? [HIDDEN] : [])
      if (name !== 'эндгейм') {
        expect(game.ui.status?.text, name).toBe('не в сети')
        expect(game.ui.status?.cls ?? '', name).not.toBe('online')
      }
    }
  })
  it('в блоке шапка не показывает «прочитано»/«печатает…»/«в сети» ни в какой момент хода', async () => {
    const { game } = makeGame()
    game.S.mem.blocked = true
    const seen: string[] = []
    const emit = game.emit.bind(game)
    game.emit = () => {
      const t = game.ui.status?.text
      if (t) seen.push(t)
      emit()
    }
    await turn(game)
    expect(seen.filter((t) => t === 'прочитано' || t === 'печатает…' || t === 'в сети')).toEqual([])
    expect(game.ui.status?.text).toBe('не в сети')
    expect(game.alikSilent()).toBe(true)
  })
  it('alikSilent — одно место: блок, смерть, телефон у Карине, пропал; эндгейм сам по себе не глушит шапку', () => {
    const { game } = makeGame()
    expect(game.alikSilent()).toBe(false)
    game.S.mem['endgame.active'] = true
    expect(game.alikSilent()).toBe(false)
    for (const key of ['blocked', 'alik_dead', 'phone.karine'] as const) {
      const { game: g } = makeGame()
      g.S.mem[key] = true
      expect(g.alikSilent(), key).toBe(true)
    }
    const { game: off } = makeGame()
    off.S.offlineDays = 2
    expect(off.alikSilent()).toBe(true)
  })
  it('в блоке статус скрыт: строка один раз за блок, после разблокировки пул возвращается', async () => {
    const { game } = makeGame()
    await playUntil(game, 'niva', nivaAway) // есть что объявлять: состояние уже наступило
    game.S.mem.blocked = true
    await turn(game)
    expect(hidden(game)).toEqual([HIDDEN])
    expect(statuses(game)).toEqual([])
    expect(game.ui.status?.text).toBe('не в сети')
    await turn(game)
    expect(hidden(game)).toHaveLength(1) // один раз за блок, а не каждый ход
    game.S.mem.blocked = false // разблокировка извинением через посредника
    await turn(game)
    expect(statuses(game)).toEqual(['Алик Воздухонесян изменил статус: «Ищу «Ниву». Видели — звоните»'])
  })
  it('блок ставит правило: строка приходит в его ходу, второй блок — снова', async () => {
    const { game } = makeGame()
    await rage(game)
    expect(game.S.mem.blocked).toBe(true)
    expect(hidden(game)).toEqual([HIDDEN])
    game.nextDay(12) // блок кончился сам (4 дня) и прошёл перерыв Rude_Block
    await game.afterTurn()
    expect(game.S.mem.blocked).toBeUndefined()
    await rage(game)
    expect(game.S.mem.blocked).toBe(true)
    expect(hidden(game)).toHaveLength(2)
  })
  it('статус не называет сроков и дат: такой текст — обещание без записи', () => {
    for (const l of ALIK_STATUS.map(valueOf)) expect((l as LineSpec).t).not.toMatch(/понедельник|вторник|сред|четверг|пятниц|суббот|воскрес|завтра|недел|месяц|\d/i)
  })
  it('в эндгейме «скрыл статус» не звучит, даже если блок ещё висит', async () => {
    const { game } = makeGame()
    await playUntil(game, 'niva', nivaAway)
    game.S.mem.blocked = true
    game.S.mem['endgame.active'] = true
    await turn(game)
    expect(hidden(game)).toEqual([])
    expect(statuses(game)).toEqual([])
  })
  it('строка блока не называет статус — об этом говорит STATUS_HIDDEN', async () => {
    const { RUDE_BLOCK_SYS } = await import('./rude')
    const { valueOf: v } = await import('../engine/rules')
    for (const e of RUDE_BLOCK_SYS) {
      expect(v(e)).not.toMatch(/[Сс]татус/)
    }
  })
})

// #308: шапка честна с первого хода молчания и в простое по таймеру
const ONLINE = new Set(['в сети', 'печатает…', 'прочитано', 'был недавно'])
/** Шапка, с которой игрок видит каждое сообщение Алика или родни, пришедшее, когда Алик уже не на связи. */
function watchLies(g: Game): string[] {
  const lies: string[] = []
  const push = g.push.bind(g)
  g.push = ((m: Parameters<Game['push']>[0]) => {
    const msg = push(m)
    const text = g.ui.status?.text ?? ''
    if ('from' in m && m.from === 'alik' && g.alikSilent() && ONLINE.has(text)) lies.push(`${text}: ${'text' in m ? m.text : m.kind}`)
    return msg
  }) as Game['push']
  return lies
}

describe('шапка с первого хода молчания (#308)', () => {
  it('блок посреди хода: сообщения после блока — под «не в сети», а не «прочитано»', async () => {
    let blocked = 0
    for (let seed = 1; seed <= 10; seed++) {
      const { game } = makeGame({ seed })
      const lies = watchLies(game)
      await rage(game)
      if (game.S.mem.blocked) blocked++
      expect(lies, `seed ${seed}`).toEqual([])
    }
    expect(blocked, 'блок ни разу не наступил — проверка пуста').toBeGreaterThan(5)
  })
  it('«смерть» серией: сообщения после неё — под «не в сети»', async () => {
    let died = 0
    for (let seed = 1; seed <= 10; seed++) {
      const { game } = makeGame({ seed })
      const lies = watchLies(game)
      for (let i = 0; i < 12 && !game.S.mem.alik_dead; i++) await game.playArc('alik_death')
      if (game.S.mem.alik_dead) died++
      for (let i = 0; i < 3; i++) await turn(game)
      expect(lies, `seed ${seed}`).toEqual([])
    }
    expect(died, '«смерть» ни разу не наступила — проверка пуста').toBeGreaterThan(5)
  })
  it('сообщение мимо «печатает…» (стикер) после блока — тоже под «не в сети»', () => {
    const { game } = makeGame()
    game.setStatus('прочитано')
    game.S.mem.blocked = true
    const lies = watchLies(game)
    game.alikMsg({ kind: 'sticker', from: 'alik', e: '🐏', c: 'бее' })
    expect(lies).toEqual([])
    expect(game.ui.status?.text).toBe('не в сети')
  })
  it('пауза «печати» после блока: шапка «не в сети» уже в паузе, а не с приходом сообщения', async () => {
    const { game } = makeGame()
    game.setStatus('прочитано')
    game.S.mem.blocked = true
    const pause = game.typingFor(1000)
    expect(game.ui.status?.text).toBe('не в сети')
    await pause
  })
  it('простой по таймеру в молчании: шапка не оживает (armStatus)', async () => {
    const { flush } = await import('../test/helpers')
    const run = async (setup: (g: Game) => void) => {
      const { game, clock } = makeGame({ noTimers: false })
      setup(game)
      const seen: string[] = []
      const emit = game.emit.bind(game)
      game.emit = () => { emit(); seen.push(game.ui.status?.text ?? '') }
      for (let i = 0; i < 40; i++) { clock.runTimers(); await flush() }
      return seen
    }
    // без молчания таймер правда двигает шапку — иначе проверка ниже пуста
    expect((await run(() => {})).some((t) => ONLINE.has(t))).toBe(true)
    for (const key of ['blocked', 'alik_dead', 'phone.karine'] as const) {
      const seen = await run((g) => { g.S.mem[key] = true })
      expect(seen.length, key).toBeGreaterThan(0)
      expect(seen.filter((t) => ONLINE.has(t)), key).toEqual([])
    }
  })
})
