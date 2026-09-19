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
      expect(l.until.length, id).toBeGreaterThan(5)
      expect(l.lines.length, id).toBeGreaterThan(0)
      expect(lintLines('LEG_' + id, l.lines)).toEqual([])
    }
    for (const lines of Object.values(CHORUS_LEGEND)) for (const l of lines) expect(LEGENDS[String(spec(l).when?.[0].value)]).toBeDefined()
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
      const n = game.S.msgs.length
      if ((await game.fire('AlikTurn'))?.name === 'Turn_Legend') got = texts(game, n).some((x) => LEGENDS.safe_baby.lines.map((l) => spec(l).t).includes(x))
      game.S.scene = null
    }
    expect(got).toBe(true)
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
    game.setLegend('beton', 'beton')
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
