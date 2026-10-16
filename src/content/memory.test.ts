// Память Алика: реплики с условиями звучат, когда событие было, и один раз; важное — раньше общего.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import type { Game } from '../engine/game'
import { MEMORY } from './memory'
import { LEGENDS } from './legends'
import { RUDE_AGAIN, SORRY_AGAIN } from './misc'
import { lintLines, spec } from '../engine/rules'
import { ARCS } from './arcs'
import { FINALES } from './finales'

const remembered = (game: Game) => game.lines.eligible('MEMORY', MEMORY, game.lineFacts()).map((p) => p.text)

async function choose(game: Game, go: string) {
  game.S.choices = null
  const c = game.choices.find((x) => x.go === go)
  expect(c, go).toBeTruthy()
  await game.send(c!)
}

describe('память Алика', () => {

  it('Арсен не «поступает» и не «выпускается» после дела: он на втором курсе (#831, #842)', () => {
    // биография Арсена названа легендой суда: «фактически — не знает, он на втором курсе»
    const law = LEGENDS.beton_law
    const lawText = [...law.lines.map((l) => spec(l).t), ...(law.talk ?? []).flat()].join(' ')
    expect(lawText, 'легенда о втором курсе пропала — проверка пустеет').toMatch(/второ[йм] курс/i)
    const arsenal = MEMORY.filter((e) => /юрфак/.test(spec(e).t)).map((e) => spec(e).t)
    expect(arsenal.length, 'строка про юрфак не найдена — проверка пустеет').toBeGreaterThan(0)
    for (const t of arsenal) {
      expect(t, `«${t}» подаёт поступление как следствие дела`).not.toMatch(/поступил/i)
      // диплом за месяцы после второго курса — противоречие самому себе
      expect(t, `«${t}» объявляет учёбу законченной, а Арсен на втором курсе`).not.toMatch(/доучил|закончил|выпустил|получил диплом/i)
    }
    // и наоборот: незавершённость названа прямо
    expect(arsenal.join(' '), 'нет формулировки про незаконченную учёбу').toMatch(/досдаёт|учится/i)
  })

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

describe('память не объявляет новый случай (#587)', () => {
  it('после квеста козы она не снова на крыше', async () => {
    const { game } = makeGame()
    await game.enterNode('q_goat', 'ask')
    await choose(game, 'climb')
    expect(game.S.ach.q_goat).toBeDefined()
    game.nextDay(1)
    const goat = remembered(game).find((t) => /коз/i.test(t))
    expect(goat).toBeTruthy()
    expect(goat).not.toMatch(/опять на крыше/)
  })

  it('после фото плитки заказов не больше трёх', async () => {
    const { game } = makeGame()
    await game.enterNode('q_photo', 'ask')
    await choose(game, 'send')
    expect(game.S.ach.q_photo).toBeDefined()
    game.nextDay(1)
    const photo = remembered(game).find((t) => /реклам/.test(t))
    expect(photo).toBeTruthy()
    const n = photo!.match(/(\S+)\s+заказ/)
    if (n) expect(['три', '3']).toContain(n[1])
    expect(photo).not.toMatch(/десять/)
  })

  it('Размик и банк не говорят «опять», пока второго раза нет', async () => {
    const { game: razmik } = makeGame()
    while ((razmik.S.arcs.razmik?.i ?? 0) < ARCS.razmik.eps.length) {
      razmik.S.day += 5
      await razmik.playArc('razmik')
    }
    expect(razmik.S.mem['finale.razmik']).toBe('default')
    razmik.nextDay(1)
    const down = remembered(razmik).filter((t) => /Размик/.test(t))
    expect(down.some((t) => /внизу/.test(t))).toBe(true)
    expect(down.join(' ')).not.toMatch(/опять/)

    const { game } = makeGame()
    await game.playFinale('alik_death', FINALES.alik_death.find((f) => f.id === 'will')!)
    expect(game.S.mem['finale.alik_death']).toBe('will')
    game.nextDay(1)
    const bank = remembered(game).find((t) => /наследник/.test(t))
    expect(bank).toBeTruthy()
    expect(bank).not.toMatch(/опять/)
  })

  it('квест один раз: «Нива» не вернулась, чайник не списан вторично, курс не вырос, налоговая не звонила снова', async () => {
    const { game: niva } = makeGame()
    await niva.playArc('niva')
    await niva.enterNode('q_niva', 'ask')
    await choose(niva, 'push')
    niva.nextDay(1)
    const drove = remembered(niva).find((t) => /толкал/.test(t))
    expect(drove).toBeTruthy()
    expect(drove).not.toMatch(/вернулась/)

    const { game: kettle } = makeGame()
    await kettle.enterNode('q_lottery', 'ask')
    await choose(kettle, 'draw')
    kettle.nextDay(1)
    const burned = remembered(kettle).find((t) => /Чайник/.test(t))
    expect(burned).toBeTruthy()
    expect(burned).not.toMatch(/ещё раз/)

    const { game: coin } = makeGame()
    await coin.enterNode('q_crypto', 'ask')
    await choose(coin, 'rate')
    await choose(coin, 'hodl')
    const rate = remembered(coin).find((t) => /Лаваш-коин/.test(t))
    expect(rate).toBeTruthy()
    expect(rate).not.toMatch(/вырос|с сыром/)

    const { game: tax } = makeGame()
    await tax.enterNode('q_witness', 'ask')
    await choose(tax, 'truth')
    tax.nextDay(1)
    const witness = remembered(tax).find((t) => /свидетел/.test(t))
    expect(witness).toBeTruthy()
    expect(witness).not.toMatch(/звонила/)
  })
})

describe('строка про «Ниву» не утверждает, что она сейчас едет (#603)', () => {
  // «едет» — любое текущее движение: находка «До сих пор едет» и её варианты
  const notDriving = /едет|в пути|на ходу/i

  it('гейт при арке 0–1 серии: строка в пуле и без утверждения «едет»', async () => {
    // квест «толкнуть» требует легенду niva_stuck первой серии («не заводится») — дальше «уехала сама» арка не дошла
    const { game } = makeGame()
    await game.playArc('niva')
    await game.enterNode('q_niva', 'ask')
    await choose(game, 'push')
    game.nextDay(1)
    const drove = remembered(game).find((t) => /толкал/.test(t))
    expect(drove).toBeTruthy()
    expect(drove).not.toMatch(notDriving)
  })

  it('гейт при арке до серии возврата (arc.niva = 6): строка в пуле и без утверждения «едет»', async () => {
    const { game } = makeGame()
    while ((game.S.arcs.niva?.i ?? 0) < 6) {
      game.S.day += 5
      await game.playArc('niva')
    }
    expect(game.S.arcs.niva?.i).toBe(6)
    await game.enterNode('q_niva', 'ask')
    await choose(game, 'push')
    game.nextDay(1)
    const drove = remembered(game).find((t) => /толкал/.test(t))
    expect(drove).toBeTruthy()
    expect(drove).not.toMatch(notDriving)
  })
})
