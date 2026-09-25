// Амнистия обещаний (docs/design/promise-amnesty.md): сцена, одно определение «просрочено», обе ветки — путём игрока.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { test as holds } from '../engine/rules'
import { uiOf, viewOf } from '../ui/view'
import { ThickJournal, JournalForAmnesty } from './rules/criteria'
import { nuneDekretOver } from './memkeys'

/** Журнал игрока, который полгода слушал «завтра»: n датированных сроков прошли, плюс «когда-нибудь» и событийный. */
const journal = (g: Game, n: number, extras = true) => {
  for (let i = 0; i < n; i++) g.recordPromise({ text: `завтра, раз ${i}`, d: 1 })
  if (extras) {
    g.recordPromise({ text: 'когда-нибудь', d: null })
    g.recordPromise({ text: 'как Нуне из декрета выйдет', d: null, condition: nuneDekretOver })
  }
  g.S.day += 5
}
const pick = (g: Game) => g.rules.match({ event: 'PickScene' }, g.facts())?.name
const choose = async (g: Game, go: string) => { g.S.choices = null; const c = g.choices.find((x) => x.go === go); expect(c, go).toBeDefined(); await g.send(c!) }
const alik = (g: Game, from: number) => g.S.msgs.slice(from).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
const sys = (g: Game, from: number) => g.S.msgs.slice(from).flatMap((m) => (m.kind === 'sys' ? [m.text] : []))
const offersPrev = (g: Game) => { for (let i = 0; i < 20; i++) { g.S.choices = null; if (g.choices.some((c) => c.act === 'prev')) return true } return false }

describe('амнистия обещаний', () => {
  it('приходит при 5+ просроченных, один раз за партию; 4 — мало', async () => {
    const { game } = makeGame()
    journal(game, 4)
    expect(game.lateCount()).toBe(4)
    expect(holds(JournalForAmnesty, game.facts())).toBe(false)
    for (let i = 0; i < 30; i++) expect(pick(game)).not.toBe('Scene_amnesty')
    game.recordPromise({ text: 'завтра, пятое', d: 1 })
    game.S.day += 2
    expect(game.lateCount()).toBe(5)
    expect(holds(JournalForAmnesty, game.facts())).toBe(true)
    expect(pick(game)).toBe('Scene_amnesty')
    expect((await game.fire('PickScene'))?.name).toBe('Scene_amnesty')
    expect(game.S.scene).toMatchObject({ id: 'amnesty', node: 'offer' })
    game.S.choices = null
    expect(game.choices.map((c) => c.go)).toEqual(['yes', 'no'])
    await choose(game, 'no')
    expect(game.S.scene).toBeNull()
    game.S.day += 30 // перерыв сцен прошёл — а амнистия всё равно один раз
    for (let i = 0; i < 30; i++) expect(pick(game)).not.toBe('Scene_amnesty')
  })

  // Амнистия — для игрока, который не припоминает сроки: бот покрытия жмёт «вы обещали» и гасит просрочки,
  // поэтому у него порог — 2 партии из 24, и счёт по одному сиду падал от любого сдвига партии (#305).
  // Здесь игрок не припоминает и не грубит; замер: пик ≥ 5 в 18 из 24, сцена в 12 — пороги вдвое ниже.
  it('игрок, который не припоминает сроки, доходит до амнистии в заметной доле партий (#281, #305)', async () => {
    const forgetful = async (g: Game) => {
      if (g.S.ending) { await g.closeEnding(); return }
      if (g.battery.dead) { await g.battery.charge(); return }
      const job = g.S.msgs.find((m) => m.kind === 'job' && !m.answered)
      if (job) { await g.answerJob(job.id, false); return }
      const cs = g.choices.filter((c) => c.act !== 'prev' && c.tone !== 'rude')
      await g.send(cs[Math.floor(g.rng.random() * cs.length)] ?? g.choices[0])
    }
    const peaks: number[] = []
    let scenes = 0
    for (let seed = 1; seed <= 24; seed++) {
      const { game } = makeGame({ seed })
      let peak = 0
      for (let i = 0; i < 300 && !game.S.mem['payday.chain'] && !game.S.mem['endgame.active']; i++) {
        await forgetful(game)
        peak = Math.max(peak, game.lateCount())
      }
      peaks.push(peak)
      if (game.S.rules.once.Scene_amnesty) scenes++
    }
    expect(peaks.filter((p) => p >= 5).length, `peaks=${peaks.join(',')}`).toBeGreaterThanOrEqual(12)
    expect(scenes, `сцена амнистии в ${scenes} из 24`).toBeGreaterThanOrEqual(6)
  }, 300_000)

  it('после начала Дня выплаты не предлагается: журнал уже ни на что не влияет', () => {
    const { game } = makeGame()
    journal(game, 9)
    game.S.mem['payday.chain'] = 'сейф → «Нива» → хаш'
    for (let i = 0; i < 30; i++) expect(pick(game)).not.toBe('Scene_amnesty')
  })

  it('согласие: просроченные с датой помечены, «когда-нибудь» и событийные — нет; журнал, кнопка и досье видят одно', async () => {
    const { game } = makeGame()
    journal(game, 9)
    expect(offersPrev(game)).toBe(true)
    expect(holds(ThickJournal, game.facts())).toBe(true)
    await game.fire('PickScene')
    const from = game.S.msgs.length
    const count = game.S.promises.length
    const day = game.S.day // день амнистии — день выбора; ход потом сдвигает календарь
    const mood = game.S.mood
    await choose(game, 'yes')
    expect(game.S.ach.amnesty).toBeDefined() // согласие — ачивка и настроение (решение автора)
    expect(game.S.mood).toBe(mood + 1)
    const dated = game.S.promises.slice(0, 9)
    expect(dated.map((p) => [p.amnesty, p.asked])).toEqual(dated.map(() => [day, undefined]))
    expect(game.S.promises[9].t).toBe('когда-нибудь')
    expect(game.S.promises[10].condition).toBe(nuneDekretOver)
    expect([game.S.promises[9].amnesty, game.S.promises[10].amnesty]).toEqual([undefined, undefined])
    expect(game.S.promises.length).toBe(count + 1) // then: 'promise' — Алик сразу дал новое
    expect(game.S.promises[count].amnesty).toBeUndefined()
    expect(game.lateCount()).toBe(0)
    expect(holds(ThickJournal, game.facts())).toBe(false)
    expect(offersPrev(game)).toBe(false)
    expect(sys(game, from)).toContainEqual(expect.stringContaining('обнулено: 9'))
    expect(alik(game, from).join(' ')).toMatch(/по-братски/)
    const rows = viewOf(uiOf(game)).promises
    expect(rows.slice(0, 9).map((r) => [r.state, r.amnesty])).toEqual(rows.slice(0, 9).map(() => ['amnesty', day]))
    expect(rows[9]).toMatchObject({ state: 'someday', amnesty: null })
    expect(rows[count]).toMatchObject({ amnesty: null })
  })

  it('отказ — только шутка: журнал не тронут, нового обещания нет', async () => {
    const { game } = makeGame()
    journal(game, 9)
    await game.fire('PickScene')
    const before = JSON.stringify(game.S.promises)
    const from = game.S.msgs.length
    const mood = game.S.mood
    await choose(game, 'no')
    expect(JSON.stringify(game.S.promises)).toBe(before)
    expect(game.S.ach.amnesty).toBeUndefined() // отказ: ни ачивки, ни настроения (решение автора)
    expect(game.S.mood).toBe(mood)
    expect(game.lateCount()).toBe(9)
    expect(alik(game, from).join(' ')).toMatch(/По порядку/)
    expect(offersPrev(game)).toBe(true)
  })

  it('«первое по списку — «когда-нибудь»» звучит только при таком обещании в журнале', async () => {
    const said = { someday: 0, plain: 0 }
    for (let seed = 1; seed <= 12; seed++) {
      const { game } = makeGame({ seed })
      journal(game, 9, false)
      await game.fire('PickScene')
      const from = game.S.msgs.length
      await choose(game, 'no')
      expect(alik(game, from).join(' ')).not.toMatch(/когда-нибудь/)
      const { game: g2 } = makeGame({ seed })
      journal(g2, 9, true)
      await g2.fire('PickScene')
      const f2 = g2.S.msgs.length
      await choose(g2, 'no')
      if (/когда-нибудь/.test(alik(g2, f2).join(' '))) said.someday++
      else said.plain++
    }
    expect(said.someday).toBeGreaterThan(0)
  })

  it('«Коллекционер» не отзывается: записи не удаляются', async () => {
    const { game } = makeGame()
    journal(game, 18)
    expect(game.S.ach.promises20).toBeDefined()
    await game.fire('PickScene')
    await choose(game, 'yes')
    expect(game.S.ach.promises20).toBeDefined()
    expect(game.S.promises.length).toBe(21)
  })
})
