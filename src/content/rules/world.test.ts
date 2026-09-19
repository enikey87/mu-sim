// Новые возможности системы правил внутри игры: сцены по сюжету, наступившие обещания, хор, состояния мира, приоритеты.
import { describe, it, expect } from 'vitest'
import { makeGame, alikTexts } from '../../test/helpers'
import { ARCS } from '../arcs'
import { CHORUS, CHORUS_FED_UP, WEDDING_NOISE, BORIS_SICK, DEAD_KARINE, DEAD_ALIK, PROMISE_DUE } from '../world'
import type { Game } from '../../engine/game'
import type { Msg } from '../../engine/state'

const pickScene = (game: Game) => game.rules.match({ event: 'PickScene' }, game.facts())?.name
const texts = (msgs: Msg[]) => msgs.filter((m) => m.kind === 'text').map((m) => (m.kind === 'text' ? m.text : ''))
// фраза могла получить обращение в начале («Эээ, брат, …») — сверяем по середине
const has = (pool: string[], said: string[]) => pool.some((t) => said.some((a) => a.includes(t.slice(6, 26)) || t.includes(a.slice(0, 25))))

describe('сцены выбираются по сюжету', () => {
  it('«смертный одр» — только после 240-го дня и при плохом настроении', () => {
    const { game } = makeGame()
    const seen = new Set<string>()
    for (let i = 0; i < 300; i++) seen.add(pickScene(game)!)
    expect(seen).not.toContain('Scene_deathbed')
    expect(seen).not.toContain('Scene_invoice')
    expect(seen).not.toContain('Scene_heir')
    expect(seen).not.toContain('Scene_tax')
    game.S.day = 260
    game.S.mood = 3
    const late = new Set<string>()
    for (let i = 0; i < 400; i++) late.add(pickScene(game)!)
    expect(late).toContain('Scene_deathbed')
    expect(late).toContain('Scene_invoice')
  })
  it('«наследство» — после того как дедушка переписал завещание; «если спросят» — после угроз судом', () => {
    const { game } = makeGame()
    game.S.arcs.grandpa = { i: 4, last: 0 }
    game.S.arcs.boris = { i: 1, last: 0 } // «долг перешёл Борису» — когда Борис уже есть
    game.S.mem['count.threat'] = 1
    const seen = new Set<string>()
    for (let i = 0; i < 400; i++) seen.add(pickScene(game)!)
    expect(seen).toContain('Scene_heir')
    expect(seen).toContain('Scene_tax')
  })
  it('показанная сцена уходит на перерыв 25 дней; все на перерыве — обычная отмазка', async () => {
    const { game } = makeGame()
    for (let i = 0; i < 40; i++) {
      const before = game.S.scene
      await game.startScene()
      if (!game.S.scene && !before) break
      game.S.scene = null
    }
    const used = Object.keys(game.S.rules.cooldown).filter((k) => k.startsWith('Scene_'))
    expect(used.length).toBeGreaterThan(5)
    expect(pickScene(game) === undefined || !used.includes(pickScene(game)!)).toBe(true)
    game.S.day += 25
    expect(pickScene(game)).toBeDefined()
  })
})

describe('обещания наступают', () => {
  it('в день срока Алик пишет сам — про это обещание', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { game } = makeGame({ seed })
      game.recordPromise({ text: 'через три дня — всё отдам', d: 3 })
      expect(game.S.rules.schedule.at(-1)).toMatchObject({ event: 'PromiseDue', at: game.S.day + 3 })
      game.S.day += 3
      const from = game.S.msgs.length
      await game.afterTurn()
      const t = texts(game.S.msgs.slice(from)).join(' ')
      if (t) { expect(t).toContain('через три дня — всё отдам'); return }
    }
    throw new Error('ни в одной из 12 партий обещание не «наступило» (шанс 60%)')
  })
  it('«когда-нибудь» не наступает никогда; «переписанное» обещание тоже', async () => {
    const { game } = makeGame()
    game.recordPromise({ text: 'когда Арарат вернут', d: null })
    expect(game.S.rules.schedule).toEqual([])
    game.recordPromise({ text: 'завтра', d: 1 })
    game.S.promises.at(-1)!.due = null // правка «изменено»
    game.S.day += 1
    const n = game.S.msgs.length
    await game.afterTurn()
    expect(game.S.msgs.length).toBe(n)
  })
  it('в хорошем настроении Алик «держит слово» — 50 ₽ ровно в срок', async () => {
    let kept = false
    for (let seed = 1; seed <= 30 && !kept; seed++) {
      const { game } = makeGame({ seed })
      game.S.mood = 9
      game.recordPromise({ text: 'послезавтра — переведу', d: 2 })
      game.S.day += 2
      await game.afterTurn()
      kept = game.S.msgs.some((m) => m.kind === 'transfer')
    }
    expect(kept).toBe(true)
  })
  it('у реплик — свой текст обещания', () => {
    expect(PROMISE_DUE.every((t) => t.includes('{t}') || t.includes('тот самый'))).toBe(true)
  })
})

describe('хор: упомянутый персонаж вклинивается', () => {
  it('Алик упомянул Гарика — Гарик может ответить; не больше одного персонажа за ход', async () => {
    let spoke = 0
    for (let seed = 1; seed <= 30; seed++) {
      const { game } = makeGame({ seed })
      game.alikMsg({ kind: 'text', from: 'alik', text: 'Гарик в горах, Карине у мамы, Борис болеет.' })
      const from = game.S.msgs.length
      await game.afterTurn()
      const who = game.S.msgs.slice(from).filter((m) => m.kind === 'text' && m.who).map((m) => (m.kind === 'text' ? m.who : ''))
      expect(who.length).toBeLessThanOrEqual(1)
      if (who.length) {
        spoke++
        expect(['garik', 'karine', 'boris']).toContain(who[0])
        expect(game.S.actors[who[0]!].interjections).toBe(1)
      }
    }
    expect(spoke).toBeGreaterThan(5)
  })
  it('реплики Алика от лица других персонажей хор не запускают', async () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', who: 'karine', text: 'Гарик, иди сюда.' })
    await game.afterTurn()
    expect(game.S.actors.garik).toBeUndefined()
  })
  it('упоминают слишком часто — персонажу надоело (по порядку, один раз)', async () => {
    const { game } = makeGame()
    game.S.actors.garik = { interjections: 3 }
    const lines: string[] = []
    for (let i = 0; i < 80 && lines.length < 3; i++) {
      game.S.stats.sent += 20 // пропустить перерыв
      game.alikMsg({ kind: 'text', from: 'alik', text: 'Это Гарик виноват.' })
      const from = game.S.msgs.length
      await game.afterTurn()
      for (const m of game.S.msgs.slice(from)) if (m.kind === 'text' && m.who === 'garik' && CHORUS_FED_UP.garik.includes(m.text)) lines.push(m.text)
    }
    expect(lines).toEqual(CHORUS_FED_UP.garik)
  })
  it('у каждого персонажа хора есть реплики', () => {
    for (const [who, arr] of Object.entries(CHORUS)) expect(arr.length, who).toBeGreaterThan(2)
  })
})

describe('состояния мира со сроком', () => {
  it('серия «свадьба Самвела» включает свадьбу на 8 дней — она окрашивает ходы, потом проходит', async () => {
    const { game } = makeGame()
    await game.playArc('samvel')
    game.S.arcs.beton = { i: 1, last: 0 } // второй сериал уже идёт — ходы не перехватывает «второй сериал»
    expect(game.S.mem.wedding).toBe(true)
    let noise = 0
    for (let i = 0; i < 150; i++) {
      game.S.stats.sent += 4
      if (game.rules.match({ event: 'AlikTurn' }, game.facts())?.name === 'Turn_Wedding') noise++
    }
    expect(noise).toBeGreaterThan(3)
    game.S.day += 8
    await game.afterTurn()
    expect(game.S.mem.wedding).toBeUndefined()
    for (let i = 0; i < 60; i++) expect(game.rules.match({ event: 'AlikTurn' }, game.facts())?.name).not.toBe('Turn_Wedding')
    expect(WEDDING_NOISE.length).toBeGreaterThan(3)
  })
  it('Борис болеет — на его доске; Алик об этом говорит', async () => {
    const { game } = makeGame()
    game.S.arcs.boris = { i: 1, last: 0 }
    await game.playArc('boris')
    expect(game.S.actors.boris.sick).toBe(true)
    let said = false
    for (let i = 0; i < 150 && !said; i++) {
      game.S.stats.sent += 4
      const from = game.S.msgs.length
      game.S.scene = null // выпавшая сцена подняла бы порог приоритета и заглушила ходы
      // выбор по весам: match и fire бросают кости отдельно — проверяем то, что реально сработало
      if ((await game.fire('AlikTurn'))?.name === 'Turn_BorisSick') said = has(BORIS_SICK, alikTexts(game.S.msgs.slice(from)))
    }
    expect(said).toBe(true)
    game.S.day += 10
    await game.afterTurn()
    expect(game.S.actors.boris.sick).toBeUndefined()
  })
  it('«Алик умер» перекрывает обычный ход целиком: отвечает Карине или Алик «с того света»', async () => {
    const { game } = makeGame()
    game.S.day = 250
    await game.playArc('alik_death')
    expect(game.S.mem.alik_dead).toBe(true)
    for (let i = 0; i < 6; i++) {
      const from = game.S.msgs.length
      await game.fire('AlikTurn')
      const t = game.S.msgs.slice(from).filter((m) => m.kind === 'text').map((m) => (m.kind === 'text' ? m.text : ''))
      expect(has([...DEAD_KARINE, ...DEAD_ALIK], t)).toBe(true)
    }
    game.S.day += 6
    await game.afterTurn()
    expect(game.S.mem.alik_dead).toBeUndefined()
  })
  it('состояния в сериалах ссылаются на реальные эпизоды', () => {
    const states = Object.values(ARCS).flatMap((a) => a.eps.filter((e) => e.state).map((e) => e.state!.key))
    expect(states).toEqual(expect.arrayContaining(['wedding', 'sick', 'alik_dead']))
  })
})

describe('приоритеты: посреди сцены Алик не болтает', () => {
  it('во время сцены «Алик пишет сам» даёт только уведомление телефона', async () => {
    const { game } = makeGame()
    game.S.scene = { id: 'deathbed', node: 'ask', vars: {} }
    for (let i = 0; i < 20; i++) {
      const n = game.S.msgs.length
      const r = await game.fire('AlikIdle')
      expect(r?.name).toBe('Idle_Notif')
      expect(game.S.msgs.length).toBe(n)
    }
  })
  it('без сцены — болтает', async () => {
    const { game } = makeGame()
    const names = new Set<string>()
    for (let i = 0; i < 40; i++) names.add((await game.fire('AlikIdle'))!.name)
    expect([...names].some((n) => n !== 'Idle_Notif')).toBe(true)
  })
})
