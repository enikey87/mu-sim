// Линия суда: каждая угроза — следующая ступень, заседание — сцена с выбором, потом апелляция и Страсбург.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../../test/helpers'
import { COURT, COURT_AFTER, COURT_LAWYER_AGAIN } from '../quests'
import { valueOf } from '../../engine/rules'
import { THREAT_AGAIN } from '../misc'
import type { Game } from '../../engine/game'

const threat = async (game: Game) => { game.S.offlineDays = 0; const n = game.S.msgs.length; const r = await game.fire('PlayerMessage', { tone: 'threat' }); return { r: r?.name, t: game.S.msgs.slice(n).map((m) => (m.kind === 'text' || m.kind === 'sys' ? m.text : '')) } }

describe('линия суда', () => {
  it('ступени по порядку: насмешка → юрист → претензия → заседание → апелляция → Страсбург → решение → «опять суд?»', async () => {
    const { game } = makeGame()
    expect((await threat(game)).r).toBe('Court_Start')
    expect(game.S.mem.court).toBe(1)
    for (const [stage, rule] of [[1, 'Court_Lawyer'], [2, 'Court_Step']] as const) {
      const { r, t } = await threat(game)
      expect(r).toBe(rule)
      for (const [, line] of COURT[stage]) expect(t).toContain(line)
    }
    expect(game.S.mem['intro.arsen']).toBe(true) // юрист Арсен вошёл в историю на ступени 1
    const hearing = await threat(game)
    expect(game.S.scene?.id).toBe('court')
    expect(hearing.t.some((x) => /повестка/.test(x))).toBe(true)
    game.S.choices = null
    const opt = game.choices.find((c) => c.go === 'screens')!
    await game.send(opt)
    expect(game.S.ach.court).toBeDefined()
    expect(game.S.mem['court.verdict']).toBe(2)
    for (const stage of [4, 5, 6]) {
      const { t } = await threat(game)
      for (const [, line] of COURT[stage]) expect(t).toContain(line)
    }
    expect(game.S.ach.strasbourg).toBeDefined()
    const after = await threat(game)
    expect(after.r).toBe('Court_After')
    expect([...COURT_AFTER.map(valueOf), ...THREAT_AGAIN.map(valueOf)]).toContain(after.t.at(-1))
    expect(game.S.mem['count.threat']).toBe(8)
  })
  it('Арсен уже писал (племянник) — на ступени 1 не представляется второй раз', async () => {
    const { game } = makeGame()
    await game.enterNode('nephew', 'start')
    game.S.scene = null
    game.S.mem.court = 1
    const { r, t } = await threat(game)
    expect(r).toBe('Court_Lawyer_Again')
    for (const [, line] of COURT_LAWYER_AGAIN) expect(t).toContain(line)
    expect(t.join(' ')).not.toMatch(/Здравствуйте, это Арсен/)
  })
  it('в разгар ссоры угроза — встречный иск (один раз), линия суда не сбивается', async () => {
    const { game } = makeGame()
    game.S.mem['rude.heat'] = 3
    expect((await threat(game)).r).toBe('Tone_Threat_Hot')
    expect((await threat(game)).r).toBe('Court_Start')
  })
  it('не судебная инстанция переводится в суд её же словами — в той ступени, которую вызвала', async () => {
    const { game } = makeGame()
    game.S.mem.court = 1
    game.S.mem['threat.claim'] = 'police'
    const { r, t } = await threat(game)
    expect(r).toBe('Court_Lawyer')
    expect(t[0]).toBe(`Полиция? Полиция сказала — это в суд. ${COURT[1][0][1]}`)
    expect(t).toContain(COURT[1][1][1]) // реплика Арсена не тронута
    game.S.mem.court = 2
    game.S.mem['threat.claim'] = 'tax'
    const step = await threat(game)
    expect(step.r).toBe('Court_Step')
    expect(step.t[0]).toBe(COURT[2][0][1]) // первая реплика ступени — Арсена, перевод её не касается
    expect(step.t[1]).toBe(`Налоговая? Налоговая сказала — это в суд. ${COURT[2][1][1]}`)
  })
  it('судебная угроза и угроза без инстанции ступеней не меняют', async () => {
    for (const claim of ['court', undefined]) {
      const { game } = makeGame()
      game.S.mem.court = 1
      if (claim) game.S.mem['threat.claim'] = claim
      const { t } = await threat(game)
      expect(t, String(claim)).toEqual(COURT[1].map(([, line]) => line))
      expect(game.S.mem['court.referral']).toBeUndefined()
    }
  })
  it('перевод звучит один раз на инстанцию: повтор молчит, другая инстанция — снова', async () => {
    const { game } = makeGame()
    game.S.mem.court = 1
    game.S.mem['threat.claim'] = 'police'
    expect((await threat(game)).t[0]).toMatch(/^Полиция\?/)
    game.S.mem['threat.claim'] = 'police'
    expect((await threat(game)).t).toEqual(COURT[2].map(([, line]) => line)) // вторая ступень — без повтора шутки
    game.S.mem['threat.claim'] = 'collectors'
    expect((await threat(game)).r).toBe('Court_Step') // ступень-заседание: сцена, перевода нет
    expect(game.S.scene?.id).toBe('court')
    expect(game.S.mem['court.referral']).toBe('police') // инстанция не зачтена — переведём её на следующей ступени
    game.S.choices = null
    await game.send(game.choices.find((c) => c.go === 'screens')!)
    game.S.mem['threat.claim'] = 'collectors'
    expect((await threat(game)).t[0]).toBe(`Коллекторы? Коллекторы сказали — это в суд. ${COURT[4][0][1]}`)
  })
  it('после письма Страсбурга в День выплаты — отдельный вердикт, не общая ступень', async () => {
    const { game } = makeGame()
    game.S.mem.court = 6
    game.S.mem.payday = 'strasbourg'
    const { r, t } = await threat(game)
    expect(r).toBe('Court_Verdict_Lettered')
    expect(t.join(' ')).toMatch(/Страсбург|письм/i)
  })
})
