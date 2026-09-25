// Легенда денег: серия ставит её, сроки и ходы Алика продолжают линию, хор не противоречит, финал закрывает.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { ARCS } from './arcs'
import { LEGENDS, CHORUS_LEGEND } from './legends'
import { spec, lintLines } from '../engine/rules'
import type { Game } from '../engine/game'

const texts = (g: Game, n: number) => g.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' ? [m.text] : []))

describe('легенда денег', () => {
  it('каждая легенда из серий существует, у каждой есть срок и реплики', () => {
    for (const [id, a] of Object.entries(ARCS)) for (const ep of a.eps) if (ep.legend) expect(LEGENDS[ep.legend], `${id}: ${ep.legend}`).toBeDefined()
    for (const [id, l] of Object.entries(LEGENDS)) {
      expect(l.until.t.length, id).toBeGreaterThan(5)
      expect(l.lines.length, id).toBeGreaterThan(0)
      expect(lintLines('LEG_' + id, l.lines)).toEqual([])
    }
    for (const lines of Object.values(CHORUS_LEGEND)) for (const l of lines) expect(LEGENDS[String(spec(l).when?.find((c) => c.key === 'legend')?.value)]).toBeDefined()
  })
  it('«малыш проглотил ключ» → срок «как ключ выйдет», а не обычная клятва на понедельник', async () => {
    const { game } = makeGame()
    game.S.arcs.nune = { i: 3, last: -99 }
    const n = game.S.msgs.length
    await game.playArc('nune')
    expect(game.legend()).toBe('safe_baby')
    const t = texts(game, n)
    expect(t[0]).toMatch(/проглотил ключ/)
    expect(t[1]).toMatch(/как ключ выйдет/)
    expect(game.S.promises.at(-1)?.t).toMatch(/как ключ выйдет/)
  })
  it('пока легенда жива, ход Алика продолжает её линию', async () => {
    const { game } = makeGame()
    game.setLegend('safe_baby', 'nune')
    Object.assign(game.S.arcs, { nune: { i: 4, last: game.S.day }, niva: { i: 1, last: game.S.day } }) // сериалы уже идут
    let got = false
    for (let i = 0; i < 60 && !got; i++) {
      game.S.stats.sent += 3
      game.setLegend('safe_baby', 'nune') // серии других сериалов по дороге ставят свои легенды
      const n = game.S.msgs.length
      if ((await game.fire('AlikTurn'))?.name === 'Turn_Legend') got = texts(game, n).some((x) => LEGENDS.safe_baby.lines.map((l) => spec(l).t).includes(x))
      game.S.scene = null
    }
    expect(got).toBe(true)
  })
  // #179: срок легенды — шутка, пока звучит редко; раньше каждый путь клялся по-своему
  const vows = (g: Game, until: string): number => g.S.msgs.filter((m) => m.kind === 'text' && m.from === 'alik' && m.text.includes(until)).length

  it('срок легенды звучит не чаще, чем раз в 8 сообщений игрока (#179)', async () => {
    const { game } = makeGame({ seed: 5 })
    game.setLegend('safe_baby', 'nune')
    const until = LEGENDS.safe_baby.until
    const at: number[] = []
    for (let i = 0; i < 120; i++) {
      game.S.stats.sent += 1
      const n = game.S.msgs.length
      await game.excuseTurn() // самый настойчивый путь: раньше он клялся каждый ход
      if (vows(game, until) > 0 && game.S.msgs.slice(n).some((m) => m.kind === 'text' && m.from === 'alik' && m.text.includes(until))) at.push(game.S.stats.sent)
      game.S.scene = null
    }
    expect(at.length, 'ни одной клятвы за 120 ходов — проверка была бы пустой').toBeGreaterThan(2)
    expect(Math.min(...at.slice(1).map((s, i) => s - at[i]))).toBeGreaterThanOrEqual(8)
  })

  it('на паузе клятва легенды молчит, а отмазка звучит (#179)', async () => {
    const { game } = makeGame()
    game.setLegend('safe_baby', 'nune')
    game.S.day += 3 // легенда не сегодняшняя: обязательной клятвы нет
    let n = game.S.msgs.length
    await game.excuseTurn()
    expect(vows(game, LEGENDS.safe_baby.until)).toBe(1) // перерыв прошёл — клятва
    n = game.S.msgs.length
    await game.excuseTurn()
    expect(vows(game, LEGENDS.safe_baby.until)).toBe(1) // пауза: второй клятвы нет
    expect(texts(game, n).length).toBeGreaterThan(0) // но отмазка жива
  })

  it('ход Алика по линии легенды подчиняется той же паузе (#179)', async () => {
    const { game } = makeGame()
    game.setLegend('safe_baby', 'nune')
    game.S.day += 3
    game.S.arcs = { nune: { i: 4, last: game.S.day } } // сериалы уже идут: свои легенды не ставят
    await game.excuseTurn() // клятва сразу после заведения легенды — дальше пауза
    let lines = 0
    for (let i = 0; i < 60 && lines < 2; i++) {
      game.S.stats.sent += 3
      const n = game.S.msgs.length
      const r = await game.fire('AlikTurn')
      if (r?.name !== 'Turn_Legend') { game.S.scene = null; continue }
      const said = texts(game, n)
      if (!said.some((t) => LEGENDS.safe_baby.lines.map((l) => spec(l).t).includes(t))) { game.S.scene = null; continue }
      lines++
      // сразу после строки легенды клятвы быть не должно: пауза не прошла
      expect(said.filter((t) => t.includes(LEGENDS.safe_baby.until))).toEqual([])
      game.S.scene = null
    }
    expect(lines).toBeGreaterThan(1)
  })

  it('в пачке «пока тебя не было» срок легенды тоже под паузой (#179)', async () => {
    const { game } = makeGame()
    game.setLegend('safe_baby', 'nune')
    game.S.day += 3
    await game.excuseTurn() // клятва — дальше пауза
    const n = game.S.msgs.length
    await game.awayMsg('excuse')
    expect(game.S.msgs.slice(n).filter((m) => m.kind === 'text' && m.text.includes(LEGENDS.safe_baby.until))).toEqual([])
    expect(game.S.msgs.length).toBeGreaterThan(n) // пачка не молчит
  })

  it('повторный срок легенды звучит, но в журнал второй раз не пишется (#179)', async () => {
    const { game } = makeGame()
    game.setLegend('safe_baby', 'nune')
    const until = LEGENDS.safe_baby.until
    const inJournal = () => game.S.promises.filter((p) => p.t.includes(until)).length
    game.S.stats.sent += 100
    await game.excuseTurn()
    expect(inJournal()).toBe(1)
    game.S.stats.sent += 100
    await game.excuseTurn()
    expect(vows(game, until)).toBe(2) // сказал ещё раз
    expect(inJournal()).toBe(1) // но это не новая запись
  })

  it('проходная серия ту же легенду гейт клятвы не открывает (#246)', async () => {
    const { game } = makeGame()
    await game.playArc('samvel') // ep0: wedding + обязательная клятва
    const until = LEGENDS.wedding.until
    expect(vows(game, until)).toBe(1)
    const at = game.S.mem.legendPromiseAt
    await game.playArc('samvel') // ep1: без своей легенды — возвращает wedding
    expect(game.legend()).toBe('wedding')
    expect(game.S.mem.legendPromiseAt).toBe(at) // гейт не сброшен
    const n = vows(game, until)
    await game.excuseTurn() // пауза ещё не прошла
    expect(vows(game, until)).toBe(n)
  })

  // NC #246: setLegend всегда открывал гейт — проходная серия снова клялась бы сразу
  it('NC: повторный setLegend той же id гейт не открывает (#246)', () => {
    const { game } = makeGame()
    game.setLegend('wedding', 'samvel')
    const opened = game.S.mem.legendPromiseAt
    game.S.stats.sent += 3
    game.setLegend('wedding', 'samvel')
    expect(game.S.mem.legendPromiseAt).toBe(opened)
    game.setLegend('niva_stuck', 'niva') // смена — открывает
    expect(game.S.mem.legendPromiseAt).toBe(game.S.stats.sent - 8)
  })

  it('повтор клятвы не в журнал у всех 30 легенд, в т.ч. без condition (#246)', async () => {
    for (const [id, spec] of Object.entries(LEGENDS)) {
      const { game } = makeGame({ seed: 1 })
      game.setLegend(id, 'nune')
      const until = spec.until
      const inJournal = () => game.S.promises.filter((p) =>
        spec.condition ? p.condition === spec.condition : p.t.includes(until)).length
      game.S.stats.sent += 100
      await game.excuseTurn()
      expect(inJournal(), id).toBe(1)
      game.S.stats.sent += 100
      await game.excuseTurn()
      expect(vows(game, until), id).toBeGreaterThanOrEqual(2)
      expect(inJournal(), id).toBe(1)
    }
  })

  it('хор не противоречит легенде: Нуне про сейф, а не «денег нет»', () => {
    const { game } = makeGame()
    game.setLegend('safe_baby', 'nune')
    expect(game.line('CH_nune', [...CHORUS_LEGEND.nune, 'Я в декрете, но всё слышу. Денег нет.'])).toMatch(/ключ в ребёнке/)
  })
  it('новая серия меняет легенду; финал сериала её закрывает, чужую — нет', async () => {
    const { game } = makeGame()
    game.S.arcs.nune = { i: 4, last: -99 }
    await game.playArc('nune')
    expect(game.legend()).toBe('safe_wrongkey')
    await game.playArc('nune') // финал «мы должны всем»
    expect(game.legend()).toBeUndefined()
    game.setLegend('grant', 'grant')
    game.setLegend(null, 'nune')
    expect(game.legend()).toBe('grant')
  })
  it('серия без своей легенды возвращает легенду своего сериала', async () => {
    const { game } = makeGame()
    await game.playArc('samvel') // «третий день, я тамада» → wedding
    game.setLegend('grant', 'grant')
    await game.playArc('samvel') // «десятый день» — снова свадьба
    expect(game.legend()).toBe('wedding')
  })
  it('легенда стареет через 30 дней', () => {
    const { game } = makeGame()
    game.setLegend('beton_money', 'beton')
    game.S.day += 31
    expect(game.legend()).toBeUndefined()
  })
  it('противоречие легенде ловится: «деньги в сейфе», потом «деньги в Дубае»', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Маленький Алик проглотил ключ от сейфа. Ждём.' })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в Дубае.' })
    expect(game.S.mem['lie.old']).toBe('money_safe')
  })
})
