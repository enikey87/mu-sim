// Память Алика: реплики с условиями звучат, когда событие было, и один раз; важное — раньше общего.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { MEMORY } from './memory'
import { RUDE_AGAIN, SORRY_AGAIN } from './misc'
import { lintLines, spec } from '../engine/rules'

describe('память Алика', () => {
  it('пулы без пустых реплик и повторов', () => {
    expect([...lintLines('MEMORY', MEMORY), ...lintLines('RUDE_AGAIN', RUDE_AGAIN), ...lintLines('SORRY_AGAIN', SORRY_AGAIN)]).toEqual([])
  })
  it('ничего не было — Алику нечего вспомнить', () => {
    const { game } = makeGame()
    expect(game.line('MEMORY', MEMORY)).toBeNull()
  })
  it('был квест «хаш» — Алик его вспоминает, один раз и не в тот же день («тогда» — о прошлом)', () => {
    const { game } = makeGame()
    game.S.ach.q_hash = game.S.day
    expect(game.line('MEMORY', MEMORY)).toBeNull()
    game.S.ach.q_hash = game.S.day - 1
    expect(game.line('MEMORY', MEMORY)).toMatch(/хаш/)
    expect(game.line('MEMORY', MEMORY)).toBeNull()
  })
  it('конкретное событие важнее общей статистики', () => {
    const { game } = makeGame()
    game.S.day = 301 // «триста дней» — приоритет 0
    game.S.ach.court = 190 // суд — приоритет 1
    game.S.mem['intro.judge'] = true // судья представился на заседании
    expect(game.line('MEMORY', MEMORY)).toMatch(/Судья Ашот/)
    expect(game.line('MEMORY', MEMORY)).toMatch(/Триста дней/)
  })
  it('крик после суда — Алик вспоминает суд (приоритет над обычными)', () => {
    const { game } = makeGame()
    game.S.mem.court = 5
    game.S.mem['intro.judge'] = true
    expect(game.line('RUDE_AGAIN', RUDE_AGAIN)).toMatch(/суде/)
  })
  it('«уже сказано» переживает перезагрузку', () => {
    const { game, storage } = makeGame()
    game.S.ach.q_goat = 190
    game.line('MEMORY', MEMORY)
    game.save()
    const again = makeGame({ storage }).game
    expect(again.line('MEMORY', MEMORY)).toBeNull()
  })
  it('«Борис до сих пор пишет тебе» — только когда Борис уже писал сам', () => {
    const { game } = makeGame()
    game.S.ach.blocked = 180
    game.S.arcs.boris = { i: 1, last: 0 }
    expect(game.line('MEMORY', MEMORY)).toBeNull()
    game.S.arcs.boris = { i: 4, last: 0 }
    expect(game.line('MEMORY', MEMORY)).toMatch(/Борис/)
  })
  it('у каждой реплики памяти есть условие', () => {
    for (const l of MEMORY) expect(spec(l).when?.length, spec(l).t).toBeGreaterThan(0)
  })
})
