// Линия суда: каждая угроза — следующая ступень, заседание — сцена с выбором, потом апелляция и Страсбург.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../../test/helpers'
import { classifyUserInput } from '../../engine/input'
import { COURT, COURT_AFTER, COURT_LAWYER_AGAIN, COURT_VERDICT_AFTER_LETTER } from '../quests'
import { ARCS } from '../arcs'
import { isOpen, valueOf } from '../../engine/rules'
import { THREAT_AGAIN } from '../misc'
import { courtVerdict, courtVerdictAt } from '../memkeys'
import { P_COURT, P_COURT_VERDICT } from './player-choice-pools'
import { COURT_VERDICT_B } from '../world'
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
  it('упоминание Арсена (бетон) — не «снова»: первое письмо юриста представляется (#1017)', async () => {
    const { game } = makeGame()
    await game.playEpisode(ARCS.beton.eps[3], 'beton') // «мой племянник Арсен изучил вопрос» — знакомство без письма
    expect(game.S.mem['intro.arsen'], 'упоминание не поставило знакомство — проверка пустеет').toBe(true)
    expect(game.S.mem['wrote.arsen'], 'упоминание не должно ставить «писал»').toBeUndefined()
    game.S.mem.court = 1
    const { r, t } = await threat(game)
    expect(r).toBe('Court_Lawyer')
    for (const [, line] of COURT[1]) expect(t).toContain(line)
    expect(t.join(' ')).toMatch(/Здравствуйте, это Арсен/)
    expect(t.join(' ')).not.toMatch(/Это снова Арсен/)
  })
  it('Арсен уже писал сам — на ступени 1 не представляется второй раз', async () => {
    const { game } = makeGame()
    // настоящее первое письмо: ступень 1 проходит штатно и штампует «писал» (#1017)
    game.S.mem.court = 1
    expect((await threat(game)).r).toBe('Court_Lawyer')
    expect(game.S.mem['wrote.arsen'], 'первое письмо Арсена не штампануло «писал»').toBe(true)
    game.S.mem.court = 1
    const { r, t } = await threat(game)
    expect(r).toBe('Court_Lawyer_Again')
    for (const [, line] of COURT_LAWYER_AGAIN) expect(t).toContain(line)
    expect(t.join(' ')).not.toMatch(/Здравствуйте, это Арсен/)
  })
  it('перевод звучит и на ветках: Арсен уже писал и вердикт после письма Страсбурга', async () => {
    // Court_Lawyer_Again: Арсен писал сам — письмо ставит и знакомство (#1017)
    const { game } = makeGame()
    game.S.mem['intro.arsen'] = true
    game.S.mem['wrote.arsen'] = true
    game.S.mem.court = 1
    game.S.mem['threat.claim'] = 'tax'
    const again = await threat(game)
    expect(again.r).toBe('Court_Lawyer_Again')
    expect(again.t[0]).toBe(`Налоговая? Налоговая сказала — это в суд. ${COURT_LAWYER_AGAIN[0][1]}`)
    // Court_Verdict_Lettered: ступень 6 и письмо Страсбурга в День выплаты
    const { game: g2 } = makeGame()
    g2.S.mem.court = 6
    g2.S.mem.payday = 'strasbourg'
    g2.S.mem['threat.claim'] = 'collectors'
    const lettered = await threat(g2)
    expect(lettered.r).toBe('Court_Verdict_Lettered')
    expect(lettered.t[0]).toBe(`Коллекторы? Коллекторы сказали — это в суд. ${COURT_VERDICT_AFTER_LETTER[0][1]}`)
  })

  it('без Court_Lawyer_Again при писавшем Арсене побеждает общая ступень', async () => {
    const { game } = makeGame()
    game.S.mem['intro.arsen'] = true
    game.S.mem['wrote.arsen'] = true
    game.S.mem.court = 1
    const again = game.rules.all.find((x) => x.name === 'Court_Lawyer_Again')!
    const when = again.when
    again.when = [{ key: '__never__', op: '==', value: true }]
    try {
      // Court_Lawyer закрыт wrote.arsen; без Again остаётся общая ступень
      expect((await threat(game)).r).toBe('Court_Step')
    } finally { again.when = when }
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
  it('без Court_Verdict_Lettered ступень 6 с письмом отвечает общая ступень', async () => {
    const { game } = makeGame()
    game.S.mem.court = 6
    game.S.mem.payday = 'strasbourg'
    const lettered = game.rules.all.find((x) => x.name === 'Court_Verdict_Lettered')!
    const when = lettered.when
    lettered.when = [{ key: '__never__', op: '==', value: true }]
    try {
      expect((await threat(game)).r).toBe('Court_Step')
    } finally { lettered.when = when }
  })
})

describe('вежливый путь в суд (#1435)', () => {
  /** Официальные обращения без крика: классификатор держит их вежливым тоном, а дело двигает каждое второе. */
  const FORMAL = [
    'Будьте добры, официально уведомляю: мой юрист готовит документы.',
    'Направляю досудебную претензию в суд, пожалуйста.',
  ]
  const send = async (game: Game, text: string): Promise<void> => { game.S.offlineDays = 0; await game.send(text) }
  const say = async (game: Game): Promise<void> => send(game, FORMAL[game.S.stats.sent % FORMAL.length])

  it('официальное обращение — вежливый тон при смысле «угроза судом»', () => {
    for (const text of FORMAL) expect(classifyUserInput(text), text).toMatchObject({ category: 'threat', tone: 'polite' })
    // отклик на отправку — тот же, что у устной угрозы: по смыслу это угроза, меняется только регистр
    expect(makeGame().game.feelFor({ text: FORMAL[0], tone: 'polite', category: 'threat' })).toBe('shake')
  })

  it('ступень за два обращения: первое канцелярия регистрирует, второе двигает дело', async () => {
    const { game } = makeGame()
    await send(game, FORMAL[0])
    expect(game.S.mem.court, 'первое обращение сдвинуло дело — медленный путь не медленный').toBeUndefined()
    expect(game.S.mem['court.polite'], 'первое обращение не занесено в журнал').toBe(true)
    await send(game, FORMAL[0])
    expect(game.S.mem.court).toBe(1)
    expect(game.S.mem['court.polite'], 'второе обращение не закрыло журнал').toBe(false)
    expect(game.S.mem['count.threat'], 'официальное обращение не считается угрозой судом').toBe(2)
    expect(game.S.ach.threat, 'ачивка «Правосудие» не выдана за официальное обращение').toBeDefined()
  })

  it('вежливая партия доходит до заседания и до «Настоящих денег», не рвя серию вежливости', async () => {
    const { game } = makeGame()
    // партия: официальные обращения, пока не откроется заседание (сцена court — это ступень 3, court = 4)
    for (let i = 0; i < 24 && game.S.scene?.id !== 'court'; i++) await say(game)
    expect(game.S.scene?.id, 'вежливые обращения не довели дело до заседания').toBe('court')
    expect(game.S.mem.court).toBe(4)
    expect(game.S.ach.court, 'заседание ещё не пройдено — проверка раньше времени').toBeUndefined()
    await game.send(game.choices.find((c) => c.go === 'screens')!)
    expect(game.S.ach.court, 'вердикт заседания не получен').toBeDefined()
    expect(game.S.politeStreak, 'официальное обращение рвёт серию вежливости').toBeGreaterThanOrEqual(8)
    for (let i = 0; i < 4 && !game.S.ach.saint; i++) await send(game, 'Спасибо, Алик, жду решения.')
    expect(game.S.ach.saint, 'серия вежливости не дожила до «Святого»').toBeDefined()
    expect((await game.fire('PaydayOutcome'))?.name, 'вежливая партия не дошла до «Настоящих денег»').toBe('Payday_real')
  })
})

describe('окно отклика на вердикт суда (#1058)', () => {
  const text = (e: unknown): string => { const v = valueOf(e as never); return typeof v === 'string' ? v : (v as { t: string }).t }
  const low = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

  it.each([['debt', 1], ['screens', 2], ['moo', 3]] as const)('узел %s: вердикт штампует ход, кнопка в блоке, окно три хода, ответ потребляет', async (node, verdict) => {
    const { game } = makeGame()
    const button = () => { game.S.choices = null; return game.buildChoices().find((c) => c.act === 'courtVerdict') }
    expect(button(), 'до вердикта кнопки нет').toBeUndefined()
    await game.enterNode('court', node)
    expect(game.S.mem[courtVerdict], 'вердикт не записан — проверка пустеет').toBe(verdict)
    const at = Number(game.S.mem[courtVerdictAt])
    expect(Number.isFinite(at), 'вердикт не штампанул ход события').toBe(true)
    expect(at, 'штамп не на ходу вердикта').toBe(game.S.stats.sent)
    expect(button(), 'на ходу вердикта кнопки нет').toBeTruthy()
    const texts = new Set<string>()
    for (let i = 0; i < 60; i++) { const b = button(); if (b) texts.add(b.text) }
    const pool = P_COURT_VERDICT.map(text)
    expect(texts.size, 'пул окна не прозвучал — проверка пустеет').toBeGreaterThan(0)
    for (const t of texts) expect(pool.some((p) => t.includes(p) || t.includes(low(p))), `кнопка не из пула: ${t}`).toBe(true)
    game.S.stats.sent = at + 3
    expect(button(), 'третий ход после вердикта — ещё окно').toBeTruthy()
    game.S.stats.sent = at + 4
    expect(button(), 'вне окна — кнопки нет').toBeUndefined()
    game.S.stats.sent = at
    const n = game.S.msgs.length
    await game.fire('PlayerSays', { intent: 'courtVerdict' })
    const said = game.S.msgs.slice(n).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : []))
    const answers = COURT_VERDICT_B.map(text)
    expect(said.some((t) => answers.some((p) => t.includes(p))), `ответ не из пула события: ${said.join(' | ')}`).toBe(true)
    expect(game.S.mem[courtVerdictAt], 'ответ не потребил окно').toBeUndefined()
    expect(button(), 'после ответа окно закрыто').toBeUndefined()
  })
})

describe('«Передайте Арсену: я готов» (#1211)', () => {
  const READY = 'Передайте Арсену: я готов.'
  const NEIGHBOR = 'Увидимся в суде, Алик.'
  const line = P_COURT.find((l) => valueOf(l) === READY)!
  const drawn = (game: Game, key: string): Set<string> => {
    const out = new Set<string>()
    for (let i = 0; i < P_COURT.length * 4; i++) out.add(game.draw(key, P_COURT))
    return out
  }

  it('после знакомства без роли юриста строки нет; после ступени юриста — есть, соседи на месте', async () => {
    const { game } = makeGame()
    await game.playEpisode(ARCS.beton.eps[3], 'beton')
    expect(game.S.mem['intro.arsen'], 'проверка не про тот путь: Арсена нет').toBe(true)
    expect(game.S.mem['wrote.arsen'], 'упоминание не должно быть письмом юриста').toBeUndefined()
    game.S.mem.court = 1
    expect(isOpen(line, game.lineFacts()), 'строка открыта до роли юриста').toBe(false)
    const before = drawn(game, 'P_COURT_1211_before')
    expect(before.has(READY), 'колода отдала строку до роли').toBe(false)
    expect(before.has(NEIGHBOR), 'пул пуст — негатив ничего не доказывает').toBe(true)
    expect(before.has('Я нашёл юриста. Настоящего, с дипломом.'), 'соседняя строка закрылась').toBe(true)

    const { r, t } = await threat(game)
    expect(r, 'ступень юриста не прозвучала — позитив пустой').toBe('Court_Lawyer')
    expect(t.join(' ')).toMatch(/юрист Алика/)
    expect(game.S.mem.court).toBe(2)
    expect(isOpen(line, game.lineFacts()), 'строка закрыта после роли юриста').toBe(true)
    const after = drawn(game, 'P_COURT_1211_after')
    expect(after.has(READY), 'колода не отдала строку после роли').toBe(true)
    expect(after.has(NEIGHBOR), 'соседняя строка пропала').toBe(true)
    expect(after.has('Я нашёл юриста. Настоящего, с дипломом.'), 'соседняя строка пропала').toBe(true)
  })
})
