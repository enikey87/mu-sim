// Лестница грубости: ступени по температуре ссоры, боковые ветки, извинения, финал.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../../test/helpers'
import type { Game } from '../../engine/game'
import type { Msg } from '../../engine/state'
import * as T from '../rude'
import { HEAT } from './rude'

const texts = (game: Game, from: number) => game.S.msgs.slice(from).map((m) => (m.kind === 'text' || m.kind === 'sys' ? m.text : m.kind === 'sticker' ? m.e : ''))
const whos = (game: Game, from: number) => game.S.msgs.slice(from).filter((m): m is Extract<Msg, { kind: 'text' }> => m.kind === 'text').map((m) => m.who ?? 'alik')
const fire = async (game: Game, tone: string) => { const n = game.S.msgs.length; const r = await game.fire('PlayerMessage', { tone }); return { r: r?.name, n } }
const says = async (game: Game, intent: string) => { const n = game.S.msgs.length; const r = await game.fire('PlayerSays', { intent }); return { r: r?.name, n } }
const heat = (game: Game, h: number) => { game.S.mem[HEAT] = h }
const fresh = (game: Game) => { game.S.choices = null; return game.choices }
const offered = (game: Game) => { for (let i = 0; i < 20; i++) if (fresh(game).some((c) => c.act === 'moo')) return true; return false }
const all = (pool: readonly T.Said[]) => pool.map(([, t]) => t)

describe('лестница грубости: ступени', () => {
  it('S0 — обида: коротко пропадает; температура +1 и через 20 дней остывает', async () => {
    const { game } = makeGame()
    expect((await fire(game, 'rude')).r).toBe('Tone_Rude')
    expect(game.S.offlineDays).toBeGreaterThanOrEqual(1)
    expect(game.S.offlineDays).toBeLessThanOrEqual(2)
    expect(game.facts()[HEAT]).toBe(1)
    game.nextDay(20)
    await game.afterTurn()
    expect(game.facts()[HEAT]).toBe(0)
  })
  it('после примирения старые остывания не уводят ссору в минус: следующий крик снова поднимает лестницу', async () => {
    const { game } = makeGame()
    for (let i = 0; i < 3; i++) { game.S.offlineDays = 0; await fire(game, 'rude') }
    heat(game, 0) // суд/ритуал помирили
    game.nextDay(21)
    await game.afterTurn()
    expect(game.S.mem[HEAT]).toBe(0)
    await fire(game, 'rude')
    expect((await fire(game, 'rude')).r).toMatch(/^Rude_Family_/)
  })
  it('повторная обида (ссора остыла) — Алик помнит, но больше не пропадает', async () => {
    const { game } = makeGame()
    game.S.mem['count.rude'] = 3
    expect((await fire(game, 'rude')).r).toBe('Tone_Rude_Again')
    expect(game.S.offlineDays).toBe(0)
    expect(game.S.ctx?.offended).toBe(true)
  })
  it('S1 — второй крик подряд: вместо Алика пишет родня, у каждого свой перерыв', async () => {
    const { game } = makeGame()
    game.S.mem['intro.arsen'] = true // Арсен уже появился (иначе пишут двое)
    heat(game, 1)
    const seen = new Set<string>()
    for (let i = 0; i < 3; i++) {
      heat(game, 1)
      const { r, n } = await fire(game, 'rude')
      expect(r).toMatch(/^Rude_Family_/)
      const who = r!.replace('Rude_Family_', '')
      expect(whos(game, n)[0]).toBe(who)
      expect(T.RUDE_FAMILY[who]).toContain(texts(game, n).find((t) => T.RUDE_FAMILY[who].includes(t)))
      seen.add(who)
    }
    expect(seen.size).toBe(3) // все трое по очереди: каждый на перерыве 4 дня
    expect(game.S.offlineDays).toBe(0)
    expect(game.S.ctx?.offended).toBe(true) // можно извиниться
  })
  it('S2 — пропущенные от мамы и голосовое с расшифровкой', async () => {
    const { game } = makeGame()
    heat(game, 2)
    const { r, n } = await fire(game, 'rude')
    expect(r).toBe('Rude_Calls')
    const t = texts(game, n)
    expect(t[0]).toMatch(/Мама Алика/)
    expect(t.some((x) => all(T.RUDE_CALLS_VOICE).includes(x))).toBe(true)
    expect(t.some((x) => T.RUDE_CALLS_ALIK.includes(x))).toBe(true)
  })
  it('S3 — блок на 4 дня: Алик пишет с чужих номеров, крик «не доставлен», обычный ход тоже с чужих', async () => {
    const { game } = makeGame()
    heat(game, 3)
    const { r, n } = await fire(game, 'rude')
    expect(r).toBe('Rude_Block')
    expect(game.S.mem.blocked).toBe(true)
    expect(T.RUDE_BLOCK_SYS).toContain(texts(game, n)[0])
    expect(['boris', 'niva', 'intercom']).toContain(whos(game, n)[0])
    expect(game.S.ach.blocked).toBeDefined()
    const b = await fire(game, 'rude')
    expect(b.r).toBe('Rude_WhileBlocked') // блок важнее суда
    expect(texts(game, b.n)[0]).toBe(T.NOT_DELIVERED)
    expect(game.rules.match({ event: 'AlikTurn' }, game.facts())?.name).toBe('Turn_Blocked')
    game.nextDay(4)
    await game.afterTurn()
    expect(game.S.mem.blocked).toBeUndefined()
  })
  it('в блоке извинение не доставлено — только «через Бориса»; Борис разблокирует', async () => {
    const { game } = makeGame()
    heat(game, 3)
    await fire(game, 'rude')
    expect(fresh(game).map((c) => c.act)).toContain('viaBoris')
    const s = await says(game, 'sorry')
    expect(s.r).toBe('Says_sorry_blocked')
    expect(texts(game, s.n)[0]).toBe(T.NOT_DELIVERED)
    const v = await says(game, 'viaBoris')
    expect(v.r).toBe('Says_viaBoris')
    expect(game.S.mem.blocked).toBe(false)
    expect(texts(game, v.n)).toContain('Алик Воздухонесян разблокировал вас')
    expect(game.rules.match({ event: 'AlikTurn' }, game.facts())?.name).not.toBe('Turn_Blocked')
  })
  it('S4 — семейный суд в группе (один раз): прелюдия, голосование, приговор — 10 дней вежливости', async () => {
    const { game } = makeGame()
    game.S.arcs.boris = { i: 1, last: 0 } // Борис уже в сюжете — он свидетель в суде
    game.S.mem['intro.dekret'] = true // и Нуне уже в декрете
    heat(game, 4)
    const { r, n } = await fire(game, 'rude')
    expect(r).toBe('Rude_Tribunal')
    expect(texts(game, n)).toEqual(expect.arrayContaining(all(T.TRIBUNAL)))
    expect(texts(game, n).some((t) => /Голосование/.test(t))).toBe(true)
    expect(game.S.scene?.id).toBe('tribunal')
    const opts = fresh(game)
    expect(opts.map((c) => c.go)).toEqual(expect.arrayContaining(['guilty', 'lawyer', 'moo']))
    await game.send(opts.find((c) => c.go === 'moo')!)
    expect(game.S.mem.polite).toBe(true)
    expect(game.S.ach.tribunal).toBeDefined()
    expect(game.facts()[HEAT]).toBe(0)
    heat(game, 4)
    expect((await fire(game, 'rude')).r).not.toBe('Rude_Tribunal') // один раз за игру
  })
  it('S5 — вежливость-убийца: ход и ответ на крик — «в рамках регламента», потом проходит', async () => {
    const { game } = makeGame()
    game.rules.applyOps([{ key: 'polite', op: '=', value: true, forDays: 10 }], {})
    const t = await fire(game, 'rude')
    expect(t.r).toBe('Rude_Polite')
    expect(T.POLITE_RUDE).toContain(texts(game, t.n).at(-1))
    const n = game.S.msgs.length
    expect((await game.fire('AlikTurn'))?.name).toBe('Turn_Polite')
    expect(texts(game, n).some((x) => T.POLITE_TURN.includes(x))).toBe(true)
    game.nextDay(10)
    await game.afterTurn()
    expect(game.S.mem.polite).toBeUndefined()
  })
  it('вендетта: серия криков, 25+ за игру и ни одного извинения — один раз; потом окрашивает ходы', async () => {
    const { game } = makeGame()
    heat(game, 5)
    game.S.mem['count.rude'] = 25
    const { r, n } = await fire(game, 'rude')
    expect(r).toBe('Rude_Vendetta')
    expect(texts(game, n)).toEqual(expect.arrayContaining(all(T.VENDETTA)))
    expect(game.S.mem.vendetta).toBe(true)
    expect(game.S.ach.vendetta).toBeDefined()
    Object.assign(game.S.arcs, { beton: { i: 1, last: 0 }, niva: { i: 1, last: 0 } }) // сериалы уже идут — «первый/второй сериал» не перехватывают
    let colored = false
    for (let i = 0; i < 200 && !colored; i++) { game.S.stats.sent += 5; colored = game.rules.match({ event: 'AlikTurn' }, game.facts())?.name === 'Turn_Vendetta' }
    expect(colored).toBe(true)
  })
  it('хоть раз извинился — вендетты не будет', async () => {
    const { game } = makeGame()
    heat(game, 5)
    Object.assign(game.S.mem, { 'count.rude': 25, 'count.sorry': 1 })
    expect((await fire(game, 'rude')).r).not.toBe('Rude_Vendetta')
  })
})

describe('лестница грубости: ветки', () => {
  it('«Мууу» игрока, пока ссора горячая, — корова мирит: температура −2; без ссоры Алик не понимает', async () => {
    const { game } = makeGame()
    heat(game, 3)
    game.S.ctx = { offended: true } // «Мууу» — сразу после обиды, а не всю ссору
    expect(offered(game)).toBe(true)
    const { r, n } = await says(game, 'moo')
    expect(r).toBe('Says_moo_peace')
    expect(T.COW_PEACE).toContain(texts(game, n).at(-1))
    expect(game.facts()[HEAT]).toBe(1)
    expect(game.S.ach.cowpeace).toBeDefined()
    heat(game, 0)
    const odd = await says(game, 'moo')
    expect(odd.r).toBe('Says_moo')
    expect(T.MOO_ODD).toContain(texts(game, odd.n).at(-1))
  })
  it('угроза судом в разгар ссоры — встречный иск, суд всех мирит', async () => {
    const { game } = makeGame()
    heat(game, 2)
    const { r, n } = await fire(game, 'threat')
    expect(r).toBe('Tone_Threat_Hot')
    expect(texts(game, n)).toEqual(expect.arrayContaining(all(T.COUNTERSUIT)))
    expect(game.facts()[HEAT]).toBe(0)
    expect(game.S.mem['count.threat']).toBe(1)
    heat(game, 3)
    const again = await fire(game, 'threat') // иск был — теперь апелляция
    expect(again.r).toBe('Tone_Threat_Hot_Again')
    expect(T.APPEAL).toContain(texts(game, again.n).at(-1))
    expect(game.facts()[HEAT]).toBe(2)
  })
  it('пул реплик исчерпан — ответ из генератора, а не повтор', async () => {
    const { game } = makeGame()
    game.S.mem['count.rude'] = 3
    const got: string[] = []
    for (let i = 0; i < 20; i++) { heat(game, 0); const { n } = await fire(game, 'rude'); got.push(...texts(game, n).filter((t) => t.length > 20)) }
    expect(new Set(got).size).toBe(got.length)
  })
  it('извинение после серии криков — только ритуал (сцена с хашем); хаш — кровные братья', async () => {
    const { game } = makeGame()
    heat(game, 3)
    expect((await says(game, 'sorry')).r).toBe('Says_sorry_ritual')
    expect(game.S.scene?.id).toBe('ritual')
    await game.send(fresh(game).find((c) => c.go === 'hash')!)
    expect(game.facts()[HEAT]).toBe(0)
    expect(game.S.ach.blood_brother).toBeDefined()
  })
  it('обычное извинение остужает ссору на 1', async () => {
    const { game } = makeGame()
    heat(game, 2)
    expect((await says(game, 'sorry')).r).toMatch(/^Says_sorry/)
    expect(game.facts()[HEAT]).toBe(1)
  })
  it('холодная война: игрок молчит после ссоры — Алик пишет первым, по порядку и без повторов', async () => {
    const { game } = makeGame()
    game.S.arcs.boris = { i: 1, last: 0 } // Борис уже в сюжете — его реплика тоже в колоде
    heat(game, 1)
    game.S.ctx = { offended: true }
    const n0 = game.S.msgs.length
    game.S.ctx = null // извинился — «Ну и молчи» уже невпопад
    for (let i = 0; i < 20; i++) expect((await game.fire('AlikIdle'))?.name).not.toBe('Idle_ColdWar')
    expect(game.S.msgs.length).toBeGreaterThanOrEqual(n0)
    game.S.ctx = { offended: true }
    const got: string[] = []
    for (let i = 0; i < 200 && got.length < T.COLD_WAR.length; i++) {
      game.S.stats.sent += 3
      game.S.ctx = { offended: true } // пересланное / стикер между ними меняют контекст — игрок всё ещё молчит обиженно
      const n = game.S.msgs.length
      if ((await game.fire('AlikIdle'))?.name === 'Idle_ColdWar') got.push(...texts(game, n).filter((t) => T.COLD_WAR.includes(t)))
    }
    expect(got).toEqual(T.COLD_WAR)
  })
  it('привыкание: кричал всю игру и вдруг вежлив — Алику не хватает крика', async () => {
    const { game } = makeGame()
    game.S.mem['count.rude'] = 15
    heat(game, 1)
    expect((await fire(game, 'polite')).r).not.toBe('Tone_MissRude') // только что кричал — не скучает
    heat(game, 0)
    let missed = false
    const rs: string[] = []
    for (let i = 0; i < 40 && !missed; i++) {
      game.S.stats.sent += 10
      game.S.scene = null // ход Алика мог начать сцену — в сцене тон игрока не разбирается
      const { r, n } = await fire(game, 'polite')
      rs.push(String(r))
      if (r === 'Tone_MissRude') { missed = true; expect(T.MISS_RUDE).toContain(texts(game, n)[0]) }
    }
    expect(missed, rs.join(',')).toBe(true)
    expect(game.S.ach.habit).toBeDefined()
  })
})
