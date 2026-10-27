// Лестница грубости: ступени по температуре ссоры, боковые ветки, извинения, финал.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../../test/helpers'
import type { Game } from '../../engine/game'
import type { Facts } from '../../engine/rules'
import type { Msg } from '../../engine/state'
import * as T from '../rude'
import { HEAT, blockLifted, coldWar } from '../memkeys'
import { valueOf, spec, during, isOpen, saidText, type Entry } from '../fact'
import { P_VIA_BORIS, P_VIA_KARINE, P_VIA_MAMA } from './player-choice-pools'
import { D } from '../excuses'
import { IDLE } from '../life'

const texts = (game: Game, from: number) => game.S.msgs.slice(from).map((m) => (m.kind === 'text' || m.kind === 'sys' ? m.text : m.kind === 'sticker' ? m.e : ''))
const whos = (game: Game, from: number) => game.S.msgs.slice(from).filter((m): m is Extract<Msg, { kind: 'text' }> => m.kind === 'text').map((m) => m.who ?? 'alik')
const fireFacts = async (game: Game, facts: Facts) => { const n = game.S.msgs.length; const r = await game.fire('PlayerMessage', facts); return { r: r?.name, n } }
const fire = (game: Game, tone: string) => fireFacts(game, { tone })
const says = async (game: Game, intent: string) => { const n = game.S.msgs.length; const r = await game.fire('PlayerSays', { intent }); return { r: r?.name, n } }
const heat = (game: Game, h: number) => { game.S.mem[HEAT] = h }
const fresh = (game: Game) => { game.S.choices = null; return game.choices }
const offered = (game: Game) => { for (let i = 0; i < 20; i++) if (fresh(game).some((c) => c.act === 'moo')) return true; return false }
const all = (pool: readonly Entry<T.Said>[]) => pool.map(valueOf).map(([, t]) => t)

describe('лестница грубости: ступени', () => {
  it('угроза насилием ускоряет ссору на две ступени и не запускает суд', async () => {
    const { game } = makeGame()
    const { r, n } = await fireFacts(game, { tone: 'rude', category: 'violent-threat' })
    expect(r).toBe('Tone_ViolentThreat')
    expect(T.VIOLENT_THREAT.map(valueOf)).toContain(texts(game, n).at(-1))
    expect(game.facts()[HEAT]).toBe(2)
    expect(game.S.mem['count.violence']).toBe(1)
    expect(game.S.mem['count.rude']).toBe(1)
    expect(game.S.mem['count.threat']).toBeUndefined()
    expect(game.S.ach.court).toBeUndefined()
  })
  it('завуалированное запугивание нагревает ссору и получает отдельный ответ', async () => {
    const { game } = makeGame()
    const { r, n } = await fireFacts(game, { tone: 'rude', category: 'intimidation' })
    expect(r).toBe('Tone_Intimidation')
    expect(T.INTIMIDATION.map(valueOf)).toContain(texts(game, n).at(-1))
    expect(game.facts()[HEAT]).toBe(1)
    expect(game.S.mem['count.intimidation']).toBe(1)
    expect(game.S.mem['count.rude']).toBe(1)
  })
  it('блок важнее отдельной реакции на угрозу', async () => {
    const { game } = makeGame()
    game.S.mem.blocked = true
    expect((await fireFacts(game, { tone: 'rude', category: 'violent-threat' })).r).toBe('Rude_WhileBlocked')
  })
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
    game.S.mem['intro.karine'] = true // Карине уже появилась (иначе некому писать вместо Алика)
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
    // все трое уже появились — иначе некому из них заговорить вместо Алика
    Object.assign(game.S.mem, { 'intro.arsen': true, 'intro.karine': true, 'intro.samvel': true })
    heat(game, 1)
    const seen = new Set<string>()
    for (let i = 0; i < 3; i++) {
      heat(game, 1)
      const { r, n } = await fire(game, 'rude')
      expect(r).toMatch(/^Rude_Family_/)
      const who = r!.replace('Rude_Family_', '')
      expect(whos(game, n)[0]).toBe(who)
      const pool = T.RUDE_FAMILY[who].map(valueOf)
      expect(pool).toContain(texts(game, n).find((t) => pool.includes(t)))
      seen.add(who)
    }
    expect(seen.size).toBe(3) // все трое по очереди: каждый на перерыве 4 дня
    expect(game.S.offlineDays).toBe(0)
    expect(game.S.ctx?.offended).toBe(true) // можно извиниться
  })
  it('пока Самвел сам не писал, в его пуле уместна только реплика знакомства', () => {
    const { game } = makeGame()
    const eligible = game.lines.eligible('RF_samvel', T.RUDE_FAMILY.samvel, game.lineFacts())
    expect(eligible.map((p) => p.text)).toEqual(['Мальчик, я Самвел. На моего племянника кричу только я. Встань в очередь, она с 1987 года.'])
  })
  it('Арсен называет сумму долга только пока долг договорный (#1293)', () => {
    const { game } = makeGame()
    const line = 'Я посчитал: на ваши крики дядя тратит 40 минут в день. Это 240 часов в год. Столько же, сколько он вам должен. Совпадение?'
    const open = () => game.lines.eligible('RF_arsen', T.RUDE_FAMILY.arsen, game.lineFacts()).map((p) => p.text)
    // шутка сравнивает 240 часов с 240 000 договора — на старте она верна
    expect(open(), 'на договорном долге шутки нет').toContain(line)
    expect(game.adjustDebt(29650), 'долг не сдвинулся — проверка пустеет').toBe(true)
    expect(game.S.debt, 'акт и допработы не доехали до долга').toBe(269650)
    expect(open(), 'реплика называет устаревшую сумму').not.toContain(line)
    expect(open().length, 'пул Арсена опустел').toBeGreaterThan(0)
  })
  it('голосовое от Самвела и альтернативный отправитель «Нива» уместны только после знакомства', () => {
    const { game } = makeGame()
    const open = (pool: readonly Entry<T.Said>[], match: string) => pool.filter((e) => isOpen(e, game.lineFacts())).map(valueOf).some(([, t]) => saidText(t).includes(match))
    expect(open(T.RUDE_CALLS_VOICE, 'Это Самвел')).toBe(false)
    expect(open(T.RUDE_ALT, 'Пишу с «Нивы»')).toBe(false)
    game.S.mem['intro.samvel'] = true
    game.S.mem['intro.niva'] = true
    expect(open(T.RUDE_CALLS_VOICE, 'Это Самвел')).toBe(true)
    expect(open(T.RUDE_ALT, 'Пишу с «Нивы»')).toBe(true)
  })
  it('Карине забрала телефон до конца дня: назавтра с первой реплики снова отвечает Алик', async () => {
    const { game } = makeGame()
    game.rules.applyOps([during('phone.karine', 1)], {})
    expect((await fire(game, 'neutral')).r).toBe('Phone_Karine_PlayerMessage')
    game.nextDay(1)
    expect((await fire(game, 'neutral')).r).not.toMatch(/Karine/)
  })
  it('пока телефон у Карине, реакций Алика на сообщения нет', async () => {
    const { game } = makeGame()
    const mine: Msg[] = []
    for (let i = 0; i < 30; i++) {
      game.S.mem['phone.karine'] = true
      const n = game.S.msgs.length
      await game.send('Алик, извините, есть новости?')
      mine.push(game.S.msgs[n])
    }
    expect(mine.some((m) => m.kind === 'text' && m.react)).toBe(false)
  })
  it('S2 — пропущенные от мамы и голосовое с расшифровкой', async () => {
    const { game } = makeGame()
    heat(game, 2)
    const { r, n } = await fire(game, 'rude')
    expect(r).toBe('Rude_Calls')
    const t = texts(game, n)
    expect(t[0]).toMatch(/[Мм]ам[аы] Алика/) // пул: «Мама Алика (n)» и «от мамы Алика: n»
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
    // не доходит и вежливое, и «Мууу»
    const p = await fire(game, 'polite')
    expect(p.r).toBe('Tone_WhileBlocked')
    expect(texts(game, p.n)[0]).toBe(T.NOT_DELIVERED)
    const m = await says(game, 'moo')
    expect(m.r).toBe('Says_WhileBlocked')
    expect(texts(game, m.n)[0]).toBe(T.NOT_DELIVERED)
    game.nextDay(4)
    await game.afterTurn()
    expect(game.S.mem.blocked).toBeUndefined()
  })
  it('тихое истечение блока: первый доставленный ход несёт разблокировку (#1050)', async () => {
    const { game } = makeGame()
    heat(game, 3)
    expect((await fire(game, 'rude')).r).toBe('Rude_Block')
    expect(game.S.mem.blocked).toBe(true)
    game.nextDay(4) // срок вышел сам: ни посредника, ни суда
    expect(game.S.mem.blocked).toBeUndefined()
    expect(game.S.mem[blockLifted], 'движок не пометил тихое снятие блока').toBe(true)
    const n = game.S.msgs.length
    await game.send('Алик, привет.')
    const t = texts(game, n)
    expect(t, 'разблокировка молчит').toContain(T.BLOCK_LIFTED_SYS)
    expect(t, 'реплики разблокировки нет').toContain(T.BLOCK_LIFTED_LINE)
    expect(game.S.mem[blockLifted], 'метка не потреблена первым ходом').toBeUndefined()
    const n2 = game.S.msgs.length
    await game.send('Ещё раз привет.')
    expect(texts(game, n2), 'нарратив повторяется').not.toContain(T.BLOCK_LIFTED_SYS)
    // посредник снимает блок раньше срока — тихого снятия нет, и метки тоже
    const { game: g2 } = makeGame()
    heat(g2, 3)
    await fire(g2, 'rude')
    g2.S.mem['intro.karine'] = true
    const arg = fresh(g2).find((c) => c.act === 'via')!.arg
    await says(g2, 'sorry')
    await g2.fire('PlayerSays', { intent: 'via', arg })
    expect(g2.S.mem.blocked, 'посредник не снял блок — проверка пустеет').toBe(false)
    g2.nextDay(4)
    expect(g2.S.mem[blockLifted], 'посредник оставил метку тихого снятия').toBeUndefined()
  })
  it('в блоке извинение не доставлено — только через посредника; до Бориса это Карине, посредник разблокирует', async () => {
    const { game } = makeGame()
    heat(game, 3)
    await fire(game, 'rude')
    game.S.mem['intro.karine'] = true // Карине уже писала — через незнакомого посредника не извиняются
    const via = fresh(game).find((c) => c.act === 'via')!
    expect(via.arg).toBe('karine')
    const s = await says(game, 'sorry')
    expect(s.r).toBe('Says_sorry_blocked_karine')
    expect(texts(game, s.n)[0]).toBe(T.NOT_DELIVERED)
    const n = game.S.msgs.length
    expect((await game.fire('PlayerSays', { intent: 'via', arg: via.arg }))?.name).toBe('Says_via_karine')
    expect(game.S.mem.blocked).toBe(false)
    expect(texts(game, n)).toContain('Алик Воздухонесян разблокировал вас')
    expect(game.rules.match({ event: 'AlikTurn' }, game.facts())?.name).not.toBe('Turn_Blocked')
  })
  it('в блоке Карине подсказывает посредника один раз: второе извинение просто не доставлено', async () => {
    const { game } = makeGame()
    game.S.mem.blocked = true
    expect((await says(game, 'sorry')).r).toBe('Says_sorry_blocked_karine')
    const again = await says(game, 'sorry')
    expect(again.r).toBe('Says_sorry_blocked_hinted')
    expect(texts(game, again.n)).not.toContain(T.KARINE_HINT)
  })
  it('посредник — лучший из тех, кто есть: Борис, если он уже в истории; мама, если Карине ушла к Рубику', async () => {
    const { game } = makeGame()
    game.S.mem.blocked = true
    game.S.arcs.boris = { i: 4, last: 0 } // Борис уже пишет сам
    expect(fresh(game).find((c) => c.act === 'via')?.arg).toBe('boris')
    expect((await says(game, 'sorry')).r).toBe('Says_sorry_blocked_boris')
    delete game.S.arcs.boris
    game.S.mem['finale.rubik'] = 'karine'
    expect(fresh(game).find((c) => c.act === 'via')?.arg).toBe('mama')
    expect((await says(game, 'sorry')).r).toBe('Says_sorry_blocked')
  })
  it('кнопка посредника обращается к посреднику, без украшения «Алик, …» (#512)', async () => {
    const setups: Array<[string, readonly Entry<string>[], (g: Game) => void]> = [
      ['boris', P_VIA_BORIS, (g) => { g.S.arcs.boris = { i: 4, last: 0 } }],
      ['karine', P_VIA_KARINE, (g) => { g.S.mem['intro.karine'] = true }],
      ['mama', P_VIA_MAMA, () => { /* мама — запасной посредник всегда */ }],
    ]
    for (const [arg, pool, setup] of setups) {
      const { game } = makeGame()
      setup(game)
      // украшение вешается на повтор уже отправленного: шлём кнопку, снова в блоке — и следующий вариант снова дословный
      for (let i = 0; i < pool.length + 2; i++) {
        game.S.mem.blocked = true
        const via = fresh(game).find((c) => c.act === 'via')
        expect(via?.arg).toBe(arg)
        expect(pool.map(valueOf), via?.text).toContain(via?.text)
        await game.send(via!)
      }
    }
  })
  // #1275: посредник — единственный готовый выход из блока (#880), поэтому его пул не молчит, но и не
  // возвращает строку дословно через ход: показанное живёт по окну повтора (#824), а исчерпанный в окне
  // пул отдаёт самую давнюю открытую строку как есть — без суффикса-хвоста, это лейбл (#1270).
  // Плейтест 114/115: «Попросить маму Алика передать извинения» на 333 и 344, «Борис, передай Алику…» на 746 и 840.
  it('пул посредника живёт по окну повтора: свежая строка не повторяется, фолбэк — самая давняя', async () => {
    const setups: Array<[string, readonly Entry<string>[], (g: Game) => void]> = [
      ['boris', P_VIA_BORIS, (g) => { g.S.arcs.boris = { i: 4, last: 0 } }],
      ['karine', P_VIA_KARINE, (g) => { g.S.mem['intro.karine'] = true }],
      ['mama', P_VIA_MAMA, () => { /* мама — запасной посредник всегда */ }],
    ]
    for (const [arg, pool, setup] of setups) {
      const { game } = makeGame()
      setup(game)
      const lines = pool.map(valueOf)
      const shown: string[] = []
      const lastShow = new Map<string, number>()
      for (let i = 0; i < 15; i++) {
        // одна сборка — один ход блока: кнопку увидели, пауза окна пошла (штамп при сборке вариантов)
        game.S.stats.sent += 1
        game.S.mem.blocked = true
        const via = fresh(game).find((c) => c.act === 'via')
        expect(via, `${arg}, сборка ${i + 1}: слот via не пуст`).toBeTruthy()
        expect(via!.arg).toBe(arg)
        // строка пула как есть: лейбл-обращение к посреднику, без «Алик, …» (#512) и без хвоста (#1270)
        expect(lines, `${arg}, сборка ${i + 1}: «${via!.text}» — строка пула`).toContain(via!.text)
        // дословный повтор внутри окна законен только как фолбэк: между двумя показами строки
        // обязаны прозвучать все остальные открытые строки пула, иначе это обход окна (#1078)
        const prev = lastShow.get(via!.text)
        if (prev !== undefined) {
          expect([...new Set(shown.slice(prev + 1))].sort(), `${arg}, сборка ${i + 1}: «${via!.text}» вернулась раньше остальных строк пула`)
            .toEqual(lines.filter((t) => t !== via!.text).sort())
        }
        lastShow.set(via!.text, i)
        shown.push(via!.text)
      }
      // свежая фаза: до исчерпания пула каждая строка показана по одному разу
      expect([...new Set(shown.slice(0, lines.length))], `${arg}: строки пула показаны свежими`).toEqual(expect.arrayContaining(lines))
      // пятнадцать сборок длиннее окна не отпускают — значит, подряд идёт фолбэк по кругу, а не случайная строка
      expect(new Set(shown).size, `${arg}: пул не отдаёт строку дважды, пока есть непоказанная`).toBe(lines.length)
    }
  })
  it('S4 — семейный суд в группе (один раз): прелюдия, голосование, приговор — 10 дней вежливости', async () => {
    const { game } = makeGame()
    game.S.arcs.boris = { i: 4, last: 0 } // Борис уже пишет — он свидетель в суде
    game.S.arcs.nune = { i: 1, last: 0 } // и Нуне уже в декрете
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
    expect(T.POLITE_RUDE.map((e) => spec(e).t)).toContain(texts(game, t.n).at(-1))
    const n = game.S.msgs.length
    expect((await game.fire('AlikTurn'))?.name).toBe('Turn_Polite')
    expect(texts(game, n).some((x) => T.POLITE_TURN.includes(x))).toBe(true)
    game.nextDay(10)
    await game.afterTurn()
    expect(game.S.mem.polite).toBeUndefined()
  })
  it('вендетта: 15-й крик за игру и ни одного извинения — один раз; потом окрашивает ходы (#742)', async () => {
    const { game } = makeGame()
    game.S.mem['count.rude'] = 14 // 15-й крик: счётчик в условии читается до remember текущего
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
  it('вендетта объявляется на 15-м крике — числе из шпаргалки (#742)', async () => {
    const { game } = makeGame()
    for (let i = 1; i <= 14; i++) {
      const { r } = await fire(game, 'rude')
      expect(r, `крик ${i} не объявляет вендетту`).not.toBe('Rude_Vendetta')
      expect(game.S.mem['count.rude'], `счётчик после ${i}-го крика`).toBe(i)
    }
    expect((await fire(game, 'rude')).r).toBe('Rude_Vendetta')
    expect(game.S.mem.vendetta).toBe(true)
  })
  it('вендетта объявляется при холодной ссоре: 15 криков без единого извинения, жар не нужен', async () => {
    const { game } = makeGame()
    heat(game, 0)
    game.S.mem['count.rude'] = 14 // 15-й крик
    expect((await fire(game, 'rude')).r).toBe('Rude_Vendetta')
  })
  it('хоть раз извинился — вендетты не будет', async () => {
    const { game } = makeGame()
    heat(game, 5)
    Object.assign(game.S.mem, { 'count.rude': 15, 'count.sorry': 1 })
    expect((await fire(game, 'rude')).r).not.toBe('Rude_Vendetta')
  })
  it('14-й крик вендетты не объявляет: она на 15-м, как и обещает шпаргалка (#742)', async () => {
    const { game } = makeGame()
    heat(game, 0)
    game.S.mem['count.rude'] = 13 // 14-й крик: счётчик в условии читается до remember текущего
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
    game.S.mem['intro.karine'] = true // одна из реплик холодной войны про Карине — она к этому времени уже писала
    const got: string[] = []
    for (let i = 0; i < 200 && got.length < T.COLD_WAR.length; i++) {
      game.S.stats.sent += 3
      game.S.ctx = { offended: true } // пересланное / стикер между ними меняют контекст — игрок всё ещё молчит обиженно
      const n = game.S.msgs.length
      if ((await game.fire('AlikIdle'))?.name === 'Idle_ColdWar') got.push(...texts(game, n).filter((t) => T.COLD_WAR.map(valueOf).includes(t)))
    }
    expect(got).toEqual(T.COLD_WAR.map(valueOf))
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
      if (r === 'Tone_MissRude') { missed = true; expect(T.MISS_RUDE.map(spec).map((l) => l.t)).toContain(texts(game, n)[0]) }
    }
    expect(missed, rs.join(',')).toBe(true)
    expect(game.S.ach.habit).toBeDefined()
  })
})

// Холодная война: режим после вендетты. Факт `coldWar` ставит сама Вендетта, снимает принятое
// извинение; пока он стоит, грубость, требования и инициативы Алика говорят из холодных пулов,
// а тёплые обращения («брат», «джан», «сынок») недоступны. Проверяется механизм, а не один текст:
// тот же крик до вендетты идёт обычной лестницей, после — холодным пулом.
describe('холодная война после вендетты', () => {
  // обращения тёплых пулов — то, чего в режиме быть не должно (ADDR из excuses.ts + родня)
  const WARM = /брат|джан|сынок|дорог|ахпер|родн[оа]|братишк|золот/i
  const coldPool = new Set(T.COLD_WAR_ALL.map((e) => valueOf(e)))
  const initiatives = T.COLD_WAR_INITIATIVE.map((e) => valueOf(e))
  const vendetta = async (game: Game): Promise<void> => {
    game.S.mem[HEAT] = 1
    game.S.mem['count.rude'] = 14 // 15-й крик
    expect((await fire(game, 'rude')).r).toBe('Rude_Vendetta')
    expect(game.S.mem[coldWar], 'вендетта не поставила режим').toBe(true)
  }

  it('до вендетты режима нет: тот же крик идёт обычной лестницей', async () => {
    const { game } = makeGame()
    expect(game.S.mem[coldWar]).toBeUndefined()
    expect((await fire(game, 'rude')).r).toBe('Tone_Rude')
  })
  it('на грубость — холодный пул, тёплых обращений нет ни в одной реплике', async () => {
    const { game } = makeGame()
    await vendetta(game)
    for (let i = 0; i < 8; i++) {
      const { r, n } = await fire(game, 'rude')
      expect(r, `крик ${i + 1} в режиме`).toBe('ColdWar_Rude')
      const said = texts(game, n).filter(Boolean)
      expect(said.some((t) => coldPool.has(t)), said.join(' | ')).toBe(true)
      for (const t of said) expect(t).not.toMatch(WARM)
    }
  })
  it('обычный пул холодной войны не содержит тёплых обращений — иначе режим обещает больше, чем даёт', () => {
    for (const t of [...coldPool, ...initiatives]) expect(t).not.toMatch(WARM)
  })
  it('требование (не крик) в режиме — тоже из холодного пула', async () => {
    const { game } = makeGame()
    await vendetta(game)
    const { r, n } = await fireFacts(game, { tone: 'neutral', category: 'request' })
    expect(r).toBe('ColdWar_Request')
    expect(coldPool.has(texts(game, n).at(-1)!)).toBe(true)
  })
  it('инициативы Алика в режиме формальные: расписания и документы, не «ты поел?»', async () => {
    const { game } = makeGame()
    await vendetta(game)
    for (let i = 0; i < 3; i++) {
      game.S.ctx = null
      const n = game.S.msgs.length
      expect((await game.fire('AlikIdle'))?.name).toBe('ColdWar_Idle')
      const said = texts(game, n)
      expect(initiatives, said.join(' | ')).toEqual(expect.arrayContaining(said.filter((t) => initiatives.includes(t))))
      for (const t of said) expect(t).not.toMatch(WARM)
    }
  })
  it('пачка «пока тебя не было» в режиме — те же формальные строки', async () => {
    const { game } = makeGame()
    await vendetta(game)
    const n = game.S.msgs.length
    expect((await game.fire('AlikAway'))?.name).toBe('ColdWar_Away')
    expect(initiatives).toContain(texts(game, n).at(-1))
  })
  it('блок не отменяется режимом: в чёрном списке сообщение по-прежнему не доставлено', async () => {
    const { game } = makeGame()
    await vendetta(game)
    game.S.mem.blocked = true
    expect((await fire(game, 'rude')).r).toBe('Rude_WhileBlocked')
  })
  it('тёплые обращения заменены формальными в том же слоте ADDR: украшение и IDLE', async () => {
    const { game } = makeGame()
    const has = (pool: readonly string[], s: string) => pool.some((a) => s.startsWith(a + ',') || s.startsWith(a + '!'))
    // до вендетты слот тёплый — иначе проверка ниже ничего не доказывает
    expect(has(D.ADDR, String(game.alikDecor('проверка')))).toBe(true)
    await vendetta(game)
    for (let i = 0; i < 6; i++) {
      const decor = String(game.alikDecor('проверка'))
      expect(has(D.ADDR_COLD, decor), decor).toBe(true)
      const said = saidText(game.addrSaidLine('IDLE', IDLE))
      expect(has(D.ADDR_COLD, said), said).toBe(true)
    }
  })
  it('извинение возвращает обычный режим: следующий крик идёт лестницей, а не холодным пулом', async () => {
    const { game } = makeGame()
    await vendetta(game)
    heat(game, 0) // ссора остыла — извинение принимается текстом, без ритуала
    expect((await says(game, 'sorry')).r).toMatch(/^Says_sorry/)
    expect(game.S.mem[coldWar], 'принятое извинение не сняло режим').toBe(false)
    const after = await fire(game, 'rude')
    expect(after.r).not.toBe('ColdWar_Rude')
  })
  it('ритуал примирения (хаш) тоже снимает режим', async () => {
    const { game } = makeGame()
    await vendetta(game)
    heat(game, 3) // извинение после серии криков — только ритуалом
    expect((await says(game, 'sorry')).r).toBe('Says_sorry_ritual')
    await game.send(fresh(game).find((c) => c.go === 'hash')!)
    expect(game.S.mem[coldWar]).toBe(false)
  })
  it('мир кончает режим: встречный иск и «Мууу» — мир целиком, а не половина', async () => {
    const a = makeGame().game
    await vendetta(a)
    heat(a, 2)
    expect((await fire(a, 'threat')).r).toBe('Tone_Threat_Hot')
    expect(a.S.mem[coldWar], 'встречный иск оставил режим').toBe(false)
    const b = makeGame().game
    await vendetta(b)
    heat(b, 1)
    expect((await says(b, 'moo')).r).toBe('Says_moo_peace')
    expect(b.S.mem[coldWar], '«Мууу»-мир оставил режим').toBe(false)
  })
  it('в режиме Алик не скучает по крику: «привыкание» молчит', async () => {
    const { game } = makeGame()
    await vendetta(game)
    heat(game, 0)
    game.S.mem['count.rude'] = 15
    expect((await fire(game, 'polite')).r).not.toBe('Tone_MissRude')
  })
})
