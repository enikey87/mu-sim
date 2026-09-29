// Бухгалтерия лжи: типизированный журнал знаний — публикация, противоречия, переходы,
// сохранение и миграция старых ключей (docs/design/lie-ledger.md, задача #425).
import { describe, it, expect } from 'vitest'
import {
  freshLedger, publishClaim, publishTransition, publishRetraction, activeClaim,
  openEpisodes, currentEpisode, closeEpisode, migrateLedger, CLAIM_LEDGER,
} from './ledger'
import { CLAIMS } from './lies'
import { ARCS, ARC_DONE } from './arcs'
import { FINALES } from './finales'
import { LEGENDS } from './legends'
import { D } from './excuses'
import type { Said } from './fact'
import { makeGame, memStorage } from '../test/helpers'
import { SAVE_KEY, loadState, saveState } from '../engine/state'
import { grantPaid } from './memkeys'

const meta = { source: 'alik' as const, day: 1 }

describe('операции журнала', () => {
  it('одинаковое значение не конфликтует; активная версия — последняя публикация', () => {
    const l = freshLedger()
    publishClaim(l, 'money.location', 'foundation', meta)
    publishClaim(l, 'money.location', 'foundation', { ...meta, day: 3 })
    expect(l.claims).toHaveLength(2)
    expect(openEpisodes(l)).toHaveLength(0)
    expect(activeClaim(l, 'money.location')?.value).toBe('foundation')
  })
  it('разные значения без перехода — открытый эпизод; новейший открытый первым', () => {
    const l = freshLedger()
    publishClaim(l, 'money.location', 'foundation', meta)
    publishClaim(l, 'money.location', 'niva', { ...meta, day: 2 })
    const ep = openEpisodes(l)
    expect(ep).toHaveLength(1)
    expect([ep[0].a, ep[0].b].sort()).toEqual(['foundation', 'niva'])
    expect(currentEpisode(l)?.id).toBe(ep[0].id)
    publishClaim(l, 'grandpa.life', 'dead', { ...meta, day: 3 })
    publishClaim(l, 'grandpa.life', 'alive', { ...meta, day: 4 })
    expect(currentEpisode(l)?.subject).toBe('grandpa.life') // новейшее противоречие первым
  })
  it('известный переход — отрицательный контроль: обе версии без эпизода', () => {
    const l = freshLedger()
    publishTransition(l, 'money.location', 'foundation', 'niva', { ...meta, day: 2 })
    publishClaim(l, 'money.location', 'foundation', meta)
    publishClaim(l, 'money.location', 'niva', { ...meta, day: 5 })
    expect(openEpisodes(l)).toHaveLength(0)
  })
  it('переход, опубликованный после конфликта, закрывает эпизод как объяснённый', () => {
    const l = freshLedger()
    publishClaim(l, 'money.location', 'foundation', meta)
    publishClaim(l, 'money.location', 'niva', { ...meta, day: 2 })
    expect(openEpisodes(l)).toHaveLength(1)
    publishTransition(l, 'money.location', 'foundation', 'niva', { ...meta, day: 3 })
    expect(openEpisodes(l)).toHaveLength(0)
    expect(l.episodes[0].status).toBe('explained')
  })
  it('отзыв версии закрывает эпизоды с ней', () => {
    const l = freshLedger()
    publishClaim(l, 'grandpa.life', 'dead', meta)
    publishClaim(l, 'grandpa.life', 'alive', { ...meta, day: 2 })
    publishRetraction(l, 'grandpa.life', 'alive', { ...meta, day: 3 })
    expect(l.episodes[0].status).toBe('retracted')
  })
  it('отозванная активная версия не спорит со следующим местом, но новая публикация снова спорит', () => {
    const l = freshLedger()
    publishClaim(l, 'money.location', 'niva', meta)
    publishRetraction(l, 'money.location', 'niva', { ...meta, day: 2 })
    expect(activeClaim(l, 'money.location')).toBeUndefined()
    publishClaim(l, 'money.location', 'foundation', { ...meta, day: 3 })
    expect(openEpisodes(l)).toHaveLength(0)
    publishClaim(l, 'money.location', 'niva', { ...meta, day: 4 })
    expect(openEpisodes(l)).toHaveLength(1)
  })
  it('пойман — конкретный эпизод; повтор пары новыми сообщениями — новый эпизод', () => {
    const l = freshLedger()
    publishClaim(l, 'money.location', 'foundation', meta)
    publishClaim(l, 'money.location', 'niva', { ...meta, day: 2 })
    const first = l.episodes[0]
    expect(closeEpisode(l, first.id, 'caught')?.status).toBe('caught')
    publishClaim(l, 'money.location', 'foundation', { ...meta, day: 10 })
    publishClaim(l, 'money.location', 'niva', { ...meta, day: 11 })
    expect(openEpisodes(l)).toHaveLength(1)
    expect(openEpisodes(l)[0].id).not.toBe(first.id)
  })
  it('«всё перевёл» и «денег нет» — знания, а не противоречие одного предмета', () => {
    const l = freshLedger()
    publishClaim(l, 'money.sent', 'transferred', meta)
    publishClaim(l, 'money.none', 'gone', { ...meta, day: 2 })
    expect(openEpisodes(l)).toHaveLength(0)
    expect(activeClaim(l, 'money.sent')?.value).toBe('transferred')
  })
  it('источник сохраняется в записи', () => {
    const l = freshLedger()
    const rec = publishClaim(l, 'customer.payment', 'paid', { source: 'grant', day: 4 })
    expect(rec.source).toBe('grant')
  })
  it('каждое утверждение контента имеет типизированный смысл', () => {
    for (const c of CLAIMS) expect(CLAIM_LEDGER[c.key], c.key).toBeDefined()
  })
})

describe('публикация путём игры', () => {
  it('показанная реплика публикует утверждение: предмет, значение, источник, день, сообщение', () => {
    const { game } = makeGame()
    expect(game.S.ledger.claims).toHaveLength(0)
    const msg = game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в Дубае, брат.' }, ['money_dubai'])
    expect(game.S.ledger.claims).toHaveLength(1)
    const rec = game.S.ledger.claims[0]
    expect(rec).toMatchObject({ subject: 'money.location', value: 'dubai', source: 'alik', day: game.S.day, msgId: msg.id })
  })
  it('реплика без разметки и смена мира без сообщения знания не создают', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в Дубае.' }) // похожие слова без claims
    game.setLegend('Деньги после свадьбы', 'samvel') // мир изменился за кадром
    expect(game.S.ledger.claims).toHaveLength(0)
    expect(openEpisodes(game.S.ledger)).toHaveLength(0)
  })
  it('две несовместимые услышанные версии — открытый эпизод', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в Дубае.' }, ['money_dubai'])
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги у Ноя.' }, ['money_noah'])
    const eps = openEpisodes(game.S.ledger, 'money.location')
    expect(eps).toHaveLength(1)
    expect([eps[0].a, eps[0].b].sort()).toEqual(['dubai', 'noah'])
  })
  it('слова другого персонажа записываются его источником', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', who: 'nune', text: 'Деньги в сейфе, ключ у меня.' }, ['money_safe'])
    expect(game.S.ledger.claims[0].source).toBe('nune')
  })
  it('callback-кандидат появляется только после услышанного утверждения и типизирован в журнале', () => {
    const { game } = makeGame()
    expect(game.callbackCandidate()).toBeUndefined()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Бетон обиделся и не застывает.' }, ['beton'])
    expect(game.S.ledger.claims[0]).toMatchObject({ subject: 'beton.mood', value: 'offended' })
    game.S.day += 11
    expect(game.callbackCandidate()?.key).toBe('beton')
  })
})

describe('рассказанные переходы и отзывы (#436)', () => {
  const catchChoice = (game: ReturnType<typeof makeGame>['game']) =>
    game.buildChoices().some((c) => c.act === 'catchLie')

  it('«Нива» с деньгами возвращается пустой, затем конверт падает в фундамент: кнопки нет', async () => {
    const { game, storage } = makeGame()
    for (const ep of ARCS.niva.eps.slice(0, 6)) await game.playEpisode(ep, 'niva')
    expect(game.S.ledger.claims.some((c) => c.value === 'niva')).toBe(true)
    expect(game.S.ledger.transitions).toContainEqual(expect.objectContaining({ subject: 'money.location', from: 'niva', to: null }))
    await game.playEpisode(ARCS.beton.eps[0], 'beton')
    expect(game.S.ledger.claims.some((c) => c.value === 'foundation')).toBe(true)
    expect(openEpisodes(game.S.ledger)).toHaveLength(0)
    expect(catchChoice(game)).toBe(false)
    game.save()
    const { game: loaded } = makeGame({ storage })
    expect(loaded.S.ledger.transitions).toHaveLength(game.S.ledger.transitions.length)
    expect(catchChoice(loaded)).toBe(false)
  })

  it('отзыв «деньги в Ниве» сам по себе разрешает следующую версию', async () => {
    const { game } = makeGame()
    for (const ep of ARCS.niva.eps.slice(0, 6)) await game.playEpisode(ep, 'niva')
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в сейфе.' }, ['money_safe'])
    expect(catchChoice(game)).toBe(false)
    expect(openEpisodes(game.S.ledger)).toHaveLength(0)
  })

  it('объяснение конверта связывает любую услышанную активную версию с фундаментом', async () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в сейфе.' }, ['money_safe'])
    await game.playEpisode(ARCS.beton.eps[0], 'beton')
    expect(catchChoice(game)).toBe(false)
    expect(game.S.ledger.transitions).toContainEqual(expect.objectContaining({ subject: 'money.location', from: 'safe', to: 'foundation' }))
    expect(openEpisodes(game.S.ledger)).toHaveLength(0)
  })

  it('подписанный акт после «Грант не платит» объясняет оплату', async () => {
    const { game } = makeGame()
    await game.playEpisode(ARCS.grant.eps[0], 'grant')
    await game.playEpisode(ARCS.rubik.eps[7], 'rubik')
    expect(catchChoice(game)).toBe(false)
    expect(game.S.ledger.claims.map((c) => c.value)).toContain('owes')
    expect(game.S.ledger.claims.map((c) => c.value)).toContain('paid')
    expect(game.S.ledger.transitions).toContainEqual(expect.objectContaining({ subject: 'customer.payment', from: 'owes', to: 'paid' }))
    expect(openEpisodes(game.S.ledger, 'customer.payment')).toHaveLength(0)
  })

  it('акт подтверждает мартовскую оплату, не закрывая уже раскрытую ложь (#450)', async () => {
    const { game } = makeGame()
    await game.playEpisode(ARCS.grant.eps[0], 'grant')
    await game.enterNode('customer', 'ask')
    expect(game.S.mem[grantPaid]).toBeUndefined()
    await game.enterNode('customer', 'call')
    const episode = openEpisodes(game.S.ledger, 'customer.payment')[0]
    expect(episode).toBeDefined()
    expect(catchChoice(game)).toBe(true)
    expect(game.S.mem[grantPaid]).toBe(true)
    const from = game.S.msgs.length
    await game.playEpisode(ARCS.rubik.eps[7], 'rubik')
    expect(game.S.msgs.slice(from).some((m) => m.kind === 'text' && m.text.includes('Теперь и бумага'))).toBe(true)
    expect(game.S.ledger.transitions.filter((t) => t.subject === 'customer.payment')).toHaveLength(0)
    expect(openEpisodes(game.S.ledger, 'customer.payment').map((e) => e.id)).toContain(episode.id)
    expect(catchChoice(game)).toBe(true)
  })

  it('частный финал акта тоже не закрывает мартовское противоречие (#450)', async () => {
    const { game } = makeGame()
    await game.playEpisode(ARCS.grant.eps[0], 'grant')
    await game.enterNode('customer', 'ask')
    await game.enterNode('customer', 'call')
    game.S.ach.wife = game.S.day
    const episode = openEpisodes(game.S.ledger, 'customer.payment')[0]
    expect(episode).toBeDefined()

    await game.playFinale('rubik', FINALES.rubik.find((f) => f.id === 'karine')!)
    expect(game.S.ledger.transitions.filter((t) => t.subject === 'customer.payment')).toHaveLength(0)
    expect(openEpisodes(game.S.ledger, 'customer.payment').map((e) => e.id)).toContain(episode.id)
    expect(catchChoice(game)).toBe(true)
  })

  it('частный финал сообщает новую оплату как переход и запоминает её (#450)', async () => {
    const { game } = makeGame()
    await game.playEpisode(ARCS.grant.eps[0], 'grant')
    game.S.ach.wife = game.S.day
    expect(game.S.mem[grantPaid]).toBeUndefined()

    await game.playFinale('rubik', FINALES.rubik.find((f) => f.id === 'karine')!)
    expect(game.S.ledger.transitions).toContainEqual(expect.objectContaining({ subject: 'customer.payment', from: 'owes', to: 'paid' }))
    expect(openEpisodes(game.S.ledger, 'customer.payment')).toHaveLength(0)
    expect(game.S.mem[grantPaid]).toBe(true)
  })

  it('звонок Гранту о платеже в марте остаётся противоречием без подписанного акта', async () => {
    const { game } = makeGame()
    await game.enterNode('customer', 'ask')
    await game.enterNode('customer', 'call')
    expect(game.S.ledger.claims.map((c) => c.value)).toEqual(['owes', 'paid'])
    expect(game.S.ledger.transitions).toHaveLength(0)
    expect(catchChoice(game)).toBe(true)
  })

  it('готовая реплика и строка легенды сообщают пустой бардачок после показа', async () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в «Ниве».' }, ['money_niva'])
    await game.say([ARC_DONE.niva[0]])
    expect(game.S.ledger.transitions).toHaveLength(1)
    const line = game.linePicked('LEG_niva_back', LEGENDS.niva_back.lines, { filter: (s) => s.t.includes('Бардачок проверил') })!
    await game.say([{ t: line.text, claims: line.spec.claims ?? [] }])
    expect(game.S.ledger.transitions).toHaveLength(2)
    expect(game.S.ledger.transitions[1]).toMatchObject({ from: 'niva', to: null })
  })

  it('системная строка публикует переход с источником и id показанного сообщения', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Грант не платит.' }, ['customer_owes'])
    const text = 'Грант подписал акт и заплатил.'
    const msg = game.sys(text)
    game.noteSaidClaims({ t: text, claims: [{ move: { from: 'customer_owes', to: 'customer_paid' } }, 'customer_paid'] }, msg.id, 'grant')
    expect(game.S.ledger.transitions).toContainEqual(expect.objectContaining({ source: 'grant', msgId: msg.id, from: 'owes', to: 'paid' }))
    expect(game.S.ledger.claims.at(-1)).toMatchObject({ source: 'grant', msgId: msg.id, value: 'paid' })
    expect(catchChoice(game)).toBe(false)
  })

  it('переход разных предметов отвергается как ошибка разметки', () => {
    const { game } = makeGame()
    expect(() => game.noteClaims([{ move: { from: 'money_niva', to: 'customer_paid' } }])).toThrow(/разными предметами/)
    expect(game.S.ledger.transitions).toHaveLength(0)
  })

  it('частные финалы отзывают версии денег, которые игрок увидел вынутыми или опровергнутыми', async () => {
    const { game } = makeGame()
    await game.playEpisode(ARCS.beton.eps[0], 'beton')
    await game.playFinale('beton', FINALES.beton.find((f) => f.id === 'opened')!)
    expect(game.S.ledger.transitions).toContainEqual(expect.objectContaining({ from: 'foundation', to: null, source: 'grant' }))

    const { game: nuneGame } = makeGame()
    await nuneGame.playEpisode(ARCS.beton.eps[0], 'beton')
    await nuneGame.playFinale('beton', FINALES.beton.find((f) => f.id === 'ledger')!)
    expect(nuneGame.S.ledger.transitions).toContainEqual(expect.objectContaining({ from: 'foundation', to: null, source: 'nune' }))

    const { game: nivaGame } = makeGame()
    await nivaGame.playEpisode(ARCS.niva.eps[0], 'niva')
    await nivaGame.playFinale('niva', FINALES.niva.find((f) => f.id === 'chose')!)
    expect(nivaGame.S.ledger.transitions).toContainEqual(expect.objectContaining({ from: 'niva', to: null, source: 'alik' }))
  })

  it('частный финал Рубика тоже объясняет расчёт Гранта', async () => {
    const { game } = makeGame()
    await game.playEpisode(ARCS.grant.eps[0], 'grant')
    await game.playFinale('rubik', FINALES.rubik.find((f) => f.id === 'karine')!)
    expect(game.S.ledger.claims.some((c) => c.value === 'paid')).toBe(true)
    expect(game.S.ledger.transitions).toContainEqual(expect.objectContaining({ from: 'owes', to: 'paid' }))
    expect(catchChoice(game)).toBe(false)
  })

  it('легендарная отмазка рассказывает, как сейф оказался в стене', async () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в сейфе.' }, ['money_safe'])
    const line = (D.LEGENDARY as Said[]).find((x) => typeof x === 'object' && typeof x.t === 'string' && x.t.includes('сейф замуровали'))
    if (!line) throw new Error('легендарная строка про замурованный сейф отсутствует')
    await game.say([line])
    expect(game.S.ledger.transitions).toContainEqual(expect.objectContaining({ from: 'safe', to: 'wall' }))
    expect(catchChoice(game)).toBe(false)
  })
})

describe('явная семантика контента (#426)', () => {
  it('отмазка с размеченным смыслом публикует его через обычный say — одна запись, предмет и значение из CLAIM_LEDGER', async () => {
    const { game } = makeGame()
    // T-шаблон с «Без акта денег нет»: constr-строка несёт claims
    await game.say([{ t: 'Сделал бы давно. Без акта денег нет.', claims: ['no_money'] }])
    expect(game.S.ledger.claims).toHaveLength(1)
    expect(game.S.ledger.claims[0]).toMatchObject({ subject: 'money.none', value: 'gone', source: 'alik' })
  })
  it('один ключ реплики — одна запись; без разметки — ни одной', async () => {
    const { game } = makeGame()
    await game.say([{ t: 'Деньги в Дубае, брат.', claims: ['money_dubai'] }])
    expect(game.S.ledger.claims).toHaveLength(1)
    expect(game.S.ledger.claims[0]).toMatchObject({ subject: 'money.location', value: 'dubai' })
    const { game: g2 } = makeGame()
    await g2.say(['Деньги в Дубае, брат.'])
    expect(g2.S.ledger.claims).toHaveLength(0)
  })
  it('другой говорящий публикует своим источником (групповой чат Нуне)', async () => {
    const { game } = makeGame()
    await game.say([{ w: 'nune', t: 'Ключ от сейфа у меня. Не отдам.', claims: ['money_safe'] }])
    expect(game.S.ledger.claims).toHaveLength(1)
    expect(game.S.ledger.claims[0]).toMatchObject({ subject: 'money.location', value: 'safe', source: 'nune' })
  })
  it('эпизод сериала публикует размеченные заявления (дедушка жив; ключ у Нуне — её источником)', async () => {
    const { game } = makeGame()
    await game.playEpisode(ARCS.grandpa.eps[0], 'grandpa')
    expect(game.S.ledger.claims.at(-1)).toMatchObject({ subject: 'grandpa.life', value: 'alive', source: 'alik' })
    const { game: g2 } = makeGame()
    await g2.playEpisode(ARCS.nune.eps[1], 'nune')
    expect(g2.S.ledger.claims.at(-1)).toMatchObject({ subject: 'money.location', value: 'safe', source: 'nune' })
  })
  it('закрытый гейт серии ничего не публикует (невыбранная ветка)', async () => {
    const { game } = makeGame()
    // первая ветка серии nune[1] — для незнакомого игрока; после знакомства гейт закрыт и open() её отсекает
    const gated = ARCS.nune.eps[1].m[0]
    game.S.mem['met.nune'] = true
    expect(game.open([gated])).toHaveLength(0)
    const before = game.S.ledger.claims.length
    await game.say(game.open(ARCS.nune.eps[1].m))
    expect(game.S.ledger.claims.length).toBe(before + 1) // звучит только открытая ветка — одна запись
  })
  it('пачка отсутствия: awayMsg с размеченной IDLE-строкой публикует «денег нет»', async () => {
    const { game } = makeGame()
    game.rules.add({ name: 'Test_AwayText', event: 'AlikAway', when: [], specificity: 50, respond: ({ game }) => game.awayMsg('text') })
    const before = game.S.ledger.claims.length
    await game.fire('AlikAway')
    // IDLE публикует claims только из строки «…Денег нет, но волнуюсь.» — с сидом 1 пачка может взять другую;
    // в любом случае записей больше не становится, если claims не было, и ровно одна — если была
    const added = game.S.ledger.claims.slice(before)
    expect(added.length).toBeLessThanOrEqual(1)
    if (added.length) expect(added[0]).toMatchObject({ subject: 'money.none', value: 'gone' })
    // детерминированная проверка самой строки пула через прямую доставку
    const { game: g2 } = makeGame()
    g2.alikMsg({ kind: 'text', from: 'alik', text: 'ты там живой? Я волнуюсь. Денег нет, но волнуюсь.' }, ['no_money'])
    expect(g2.S.ledger.claims.at(-1)).toMatchObject({ subject: 'money.none', value: 'gone' })
  })
  it('две формулировки одного значения не конфликтуют; активное значение — последнее', async () => {
    const { game } = makeGame()
    await game.say([{ t: 'Деньги в Дубае.', claims: ['money_dubai'] }])
    await game.say([{ t: 'Смотри: деньги в Дубае, всё на месте.', claims: ['money_dubai'] }])
    expect(openEpisodes(game.S.ledger, 'money.location')).toHaveLength(0)
    expect(activeClaim(game.S.ledger, 'money.location')?.value).toBe('dubai')
  })
  it('sys-строка сцены публикует заявление со своим источником (Грант: «всё заплатил»)', async () => {
    const { game } = makeGame()
    await game.enterNode('customer', 'call')
    const rec = game.S.ledger.claims.find((c) => c.subject === 'customer.payment')
    expect(rec).toMatchObject({ value: 'paid', source: 'grant' })
    const last = game.S.msgs.at(-1)
    expect(last?.kind === 'sys' ? last.text : '').toMatch(/Заказчик: «Я Алику всё заплатил|заплатил дважды/)
  })
  it('разметка определяет смысл, а не слова: строка без «денег нет» публикует его явно', async () => {
    const { game } = makeGame()
    await game.say([{ t: 'Понимаешь, пусто у меня сейчас.', claims: ['no_money'] }])
    expect(game.S.ledger.claims).toHaveLength(1)
    expect(game.S.ledger.claims[0]).toMatchObject({ subject: 'money.none', value: 'gone' })
  })

})

describe('сохранение и загрузка', () => {
  it('журнал переживает сохранение и загрузку без потерь', () => {
    const { game, storage } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в Дубае.' }, ['money_dubai'])
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги у Ноя.' }, ['money_noah'])
    saveState(storage, game.S)
    const loaded = loadState(storage)!
    expect(JSON.stringify(loaded.ledger)).toBe(JSON.stringify(game.S.ledger))
    expect(openEpisodes(loaded.ledger, 'money.location')).toHaveLength(1)
  })
})

describe('миграция старых сохранений', () => {
  const legacyStorage = (mem: Record<string, unknown>) => {
    const storage = memStorage()
    storage.data[SAVE_KEY] = JSON.stringify({ msgs: [], nextId: 1, mem })
    return storage
  }

  it('три старых местонахождения без lie.* остаются знаниями без кнопки', () => {
    const storage = legacyStorage({
      'said.money_niva': 5,
      'said.money_jar': 150,
      'said.money_safe': 60,
    })
    const { game } = makeGame({ storage })
    expect(game.S.ledger.claims.map((c) => [c.claimKey, c.day])).toEqual([
      ['money_niva', 5], ['money_safe', 60], ['money_jar', 150],
    ])
    expect(game.S.ledger.episodes).toHaveLength(0)
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(false)
  })

  it('caughtPair без lie.* и нечисловой saidLast не создают эпизод; said остаётся запасным днём', () => {
    const storage = legacyStorage({
      'said.money_jar': 12, 'saidLast.money_jar': 'неизвестно',
      'said.money_dubai': 14,
      'caught.money_dubai|money_jar': true,
    })
    const { game } = makeGame({ storage })
    expect(game.S.ledger.claims.map((c) => [c.claimKey, c.day])).toEqual([
      ['money_jar', 12], ['money_dubai', 14],
    ])
    expect(game.S.ledger.episodes).toHaveLength(0)
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(false)
  })

  it('незакрытая пара grandpa после загрузки даёт ровно одну кнопку, поимка её закрывает', async () => {
    const storage = legacyStorage({
      'said.grandpa_dead': 3, 'said.grandpa_alive': 20,
      'lie.old': 'grandpa_dead', 'lie.new': 'grandpa_alive',
    })
    const { game } = makeGame({ storage })
    expect(openEpisodes(game.S.ledger)).toHaveLength(1)
    const choice = game.buildChoices().find((c) => c.act === 'catchLie')
    expect(choice).toBeDefined()
    await game.send(choice!)
    expect(openEpisodes(game.S.ledger)).toHaveLength(0)
    game.save()
    const { game: loaded } = makeGame({ storage })
    expect(loaded.S.ledger.episodes).toHaveLength(1)
    expect(loaded.buildChoices().some((c) => c.act === 'catchLie')).toBe(false)
  })

  it('последняя услышанная версия остаётся активной независимо от порядка ключей', () => {
    const storage = legacyStorage({
      'said.money_jar': 5, 'saidLast.money_jar': 50,
      'said.money_dubai': 20,
      'lie.old': 'money_jar', 'lie.new': 'money_dubai',
      'caught.money_dubai|money_jar': true,
    })
    const { game } = makeGame({ storage })
    expect(game.S.ledger.claims.map((c) => [c.claimKey, c.day])).toEqual([
      ['money_dubai', 20], ['money_jar', 50],
    ])
    expect(activeClaim(game.S.ledger, 'money.location')?.value).toBe('bank')
    expect(game.S.ledger.episodes).toHaveLength(1)
    expect(game.S.ledger.episodes[0].status).toBe('caught')
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в банке.' }, ['money_jar'])
    expect(openEpisodes(game.S.ledger)).toHaveLength(0)
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(false)
  })

  it('saidLast/by переносятся в знания; незакрытый lie — в открытый эпизод', () => {
    const storage = legacyStorage({
      'said.money_jar': 100, 'saidLast.money_jar': 105, 'by.money_jar': 'nune',
      'said.money_dubai': 200, 'saidLast.money_dubai': 200,
      'lie.old': 'money_jar', 'lie.new': 'money_dubai',
    })
    const l = loadState(storage)!.ledger
    expect(l.claims).toHaveLength(2)
    const jar = l.claims.find((c) => c.claimKey === 'money_jar')!
    expect(jar).toMatchObject({ subject: 'money.location', value: 'bank', source: 'nune', day: 105 })
    expect(jar.msgId).toBeUndefined()
    const eps = openEpisodes(l, 'money.location')
    expect(eps).toHaveLength(1)
    expect([eps[0].a, eps[0].b].sort()).toEqual(['bank', 'dubai'])
  })
  it('caughtPair закрывает только перенесённый эпизод', () => {
    const storage = legacyStorage({
      'said.money_jar': 100, 'saidLast.money_jar': 100,
      'said.money_dubai': 105, 'saidLast.money_dubai': 105,
      'lie.old': 'money_jar', 'lie.new': 'money_dubai',
      'caught.money_dubai|money_jar': true,
    })
    const l = loadState(storage)!.ledger
    expect(l.episodes).toHaveLength(1)
    expect(l.episodes[0].status).toBe('caught')
    // новые эпизоды той же пары журналу не запрещены
    publishClaim(l, 'money.location', 'bank', { source: 'alik', day: 300 })
    publishClaim(l, 'money.location', 'dubai', { source: 'alik', day: 301 })
    expect(openEpisodes(l, 'money.location')).toHaveLength(1)
  })
  it('повторная загрузка не дублирует записи', () => {
    const storage = legacyStorage({
      'said.money_jar': 100, 'saidLast.money_jar': 100,
      'said.money_dubai': 105, 'saidLast.money_dubai': 105,
    })
    const first = loadState(storage)!
    storage.data[SAVE_KEY] = JSON.stringify(first)
    const second = loadState(storage)!
    expect(second.ledger.claims).toHaveLength(first.ledger.claims.length)
    expect(second.ledger.episodes).toHaveLength(first.ledger.episodes.length)
  })
  it('повреждённое и неполное legacy-состояние не ломает загрузку и не создаёт ложного противоречия', () => {
    const storage = legacyStorage({
      'said.money_safe': 'давно', // не число — пропускаем
      'said.unknown_claim': 10, // неизвестный ключ — пропускаем
      'said.sent': 50, 'saidLast.sent': 50,
      'said.no_money': 60, 'saidLast.no_money': 60,
      'caught.no_money|sent': true, // по новым правилам пары нет — закрывать нечего
      'lie.old': 'grandpa_dead', // без lie.new — эпизода нет
    })
    const l = loadState(storage)!.ledger
    expect(l.claims.map((c) => c.claimKey).sort()).toEqual(['no_money', 'sent'])
    expect(l.episodes).toHaveLength(0)
  })
  it('старая партия продолжается на новом состоянии: поимка, сохранение, повторная загрузка', async () => {
    const storage = legacyStorage({
      'said.money_jar': 100, 'saidLast.money_jar': 100,
      'said.money_dubai': 105, 'saidLast.money_dubai': 105,
      'lie.old': 'money_jar', 'lie.new': 'money_dubai', 'lie.kind': 'money', 'lie.alikOld': true,
    })
    const { game } = makeGame({ storage })
    game.S.day = 110
    expect(game.facts()['heard.money_jar']).toBe(true)
    expect(game.callbackCandidate()?.key).toBe('money_jar') // мигрированное знание кормит воспоминания
    const c = game.buildChoices().find((x) => x.act === 'catchLie')
    expect(c?.text).toMatch(/огурц/)
    await game.send(c!)
    expect(openEpisodes(game.S.ledger)).toHaveLength(0)
    game.save()
    const { game: again } = makeGame({ storage })
    expect(again.S.ledger.claims).toHaveLength(game.S.ledger.claims.length)
    expect(openEpisodes(again.S.ledger)).toHaveLength(0)
    // старые lie.* остались в памяти как есть, но кнопку не возвращают
    expect(again.buildChoices().some((x) => x.act === 'catchLie')).toBe(false)
  })
  it('migrateLedger на уже мигрированном журнале — тот же объект', () => {
    const l = freshLedger()
    publishClaim(l, 'money.location', 'dubai', meta)
    expect(migrateLedger({}, l)).toBe(l)
    const mem = {
      'said.money_jar': 2, 'said.money_dubai': 3,
      'lie.old': 'money_jar', 'lie.new': 'money_dubai',
    }
    const storage = legacyStorage(mem)
    storage.data[SAVE_KEY] = JSON.stringify({ msgs: [], nextId: 1, mem, ledger: l })
    const { game } = makeGame({ storage })
    expect(game.S.ledger.claims).toHaveLength(1)
    expect(game.S.ledger.episodes).toHaveLength(0)
  })
})
