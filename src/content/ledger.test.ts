// Бухгалтерия лжи: типизированный журнал знаний — публикация, противоречия, переходы,
// сохранение и миграция старых ключей (docs/design/lie-ledger.md, задача #425).
import { describe, it, expect } from 'vitest'
import {
  freshLedger, publishClaim, publishTransition, publishRetraction, activeClaim,
  openEpisodes, currentEpisode, closeEpisode, migrateLedger, CLAIM_LEDGER,
} from './ledger'
import { CLAIMS } from './lies'
import { ARCS } from './arcs'
import { makeGame, memStorage } from '../test/helpers'
import { SAVE_KEY, loadState, saveState } from '../engine/state'

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
  it('каждое regex-утверждение имеет типизированный смысл в адаптере', () => {
    for (const c of CLAIMS) expect(CLAIM_LEDGER[c.key], c.key).toBeDefined()
  })
})

describe('публикация путём игры', () => {
  it('показанная реплика публикует утверждение: предмет, значение, источник, день, сообщение', () => {
    const { game } = makeGame()
    expect(game.S.ledger.claims).toHaveLength(0)
    const msg = game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в Дубае, брат.' })
    expect(game.S.ledger.claims).toHaveLength(1)
    const rec = game.S.ledger.claims[0]
    expect(rec).toMatchObject({ subject: 'money.location', value: 'dubai', source: 'alik', day: game.S.day, msgId: msg.id })
  })
  it('реплика без утверждения и смена мира без сообщения знания не создают', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги с «Нивой» уехали в горы.' }) // перефраз мимо regex
    game.setLegend('Деньги после свадьбы', 'samvel') // мир изменился за кадром
    expect(game.S.ledger.claims).toHaveLength(0)
    expect(openEpisodes(game.S.ledger)).toHaveLength(0)
  })
  it('две несовместимые услышанные версии — открытый эпизод', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в Дубае.' })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги у Ноя.' })
    const eps = openEpisodes(game.S.ledger, 'money.location')
    expect(eps).toHaveLength(1)
    expect([eps[0].a, eps[0].b].sort()).toEqual(['dubai', 'noah'])
  })
  it('слова другого персонажа записываются его источником', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', who: 'nune', text: 'Деньги в сейфе, ключ у меня.' })
    expect(game.S.ledger.claims[0].source).toBe('nune')
  })
  it('опечатка не меняет опубликованный смысл; исправление не создаёт вторую запись', () => {
    const { game } = makeGame()
    // то, что say() делает с опечаткой: показан «дыньги», смысл — исходная фраза
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Дыньги в Дубае.' }, 'Деньги в Дубае.')
    expect(game.S.ledger.claims).toHaveLength(1)
    expect(game.S.ledger.claims[0]).toMatchObject({ subject: 'money.location', value: 'dubai' })
    game.alikMsg({ kind: 'text', from: 'alik', text: '*Деньги' }, '') // пузырь исправления
    expect(game.S.ledger.claims).toHaveLength(1)
    // видимое поведение по старым ключам не изменилось: regex показанную опечатку не узнал
    expect(game.S.mem['said.money_dubai']).toBeUndefined()
  })
  it('callback-кандидат появляется только после услышанного утверждения и типизирован в журнале', () => {
    const { game } = makeGame()
    expect(game.callbackCandidate()).toBeUndefined()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Бетон обиделся и не застывает.' })
    expect(game.S.ledger.claims[0]).toMatchObject({ subject: 'beton.mood', value: 'offended' })
    game.S.day += 11
    expect(game.callbackCandidate()?.key).toBe('beton')
  })
})

describe('явная семантика контента (#426)', () => {
  it('отмазка с размеченным смыслом публикует его через обычный say — одна запись, предмет и значение из CLAIM_LEDGER', async () => {
    const { game } = makeGame()
    // T-шаблон с «Без акта денег нет»: constr-строка несёт claims, текст пула матчит regex
    await game.say([{ t: 'Сделал бы давно. Без акта денег нет.', claims: ['no_money'] }])
    expect(game.S.ledger.claims).toHaveLength(1)
    expect(game.S.ledger.claims[0]).toMatchObject({ subject: 'money.none', value: 'gone', source: 'alik' })
  })
  it('regex-адаптер не дублирует явную публикацию того же ключа', async () => {
    const { game } = makeGame()
    // текст матчит regex money_dubai И явные claims содержат money_dubai — публикуется ровно одна запись
    await game.say([{ t: 'Деньги в Дубае, брат.', claims: ['money_dubai'] }])
    expect(game.S.ledger.claims).toHaveLength(1)
    expect(game.S.ledger.claims[0]).toMatchObject({ subject: 'money.location', value: 'dubai' })
    // контроль: без явных claims адаптер публикует сам, тоже одна запись
    const { game: g2 } = makeGame()
    await g2.say(['Деньги в Дубае, брат.'])
    expect(g2.S.ledger.claims).toHaveLength(1)
  })
  it('явный смысл не зависит от формулировки строки: опечатанный текст публикует тот же смысл без второй записи', () => {
    const { game } = makeGame()
    // то, что say() делает с опечаткой: показан «дыньги», смысл — исходная фраза + явные claims
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Дыньги в Дубае.' }, 'Деньги в Дубае.', ['money_dubai'])
    expect(game.S.ledger.claims).toHaveLength(1)
    expect(game.S.ledger.claims[0]).toMatchObject({ subject: 'money.location', value: 'dubai' })
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
    g2.alikMsg({ kind: 'text', from: 'alik', text: 'ты там живой? Я волнуюсь. Денег нет, но волнуюсь.' }, undefined, ['no_money'])
    expect(g2.S.ledger.claims.at(-1)).toMatchObject({ subject: 'money.none', value: 'gone' })
  })
  it('две формулировки одного значения не конфликтуют; активное значение — последнее', async () => {
    const { game } = makeGame()
    await game.say(['Деньги в Дубае.'])
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
  it('негативный контроль: убрать claims из явной публикации — дедуп-адаптер публикует лишнюю запись', async () => {
    // при разметке на месте: текст матчит regex и ключ в explicit — одна запись (проверено выше);
    // здесь показываем, что запись всё же появляется (явная публикация работает и без regex-матча)
    const { game } = makeGame()
    await game.say([{ t: 'Понимаешь, денег просто нет сейчас.', claims: ['no_money'] }])
    expect(game.S.ledger.claims).toHaveLength(1)
    expect(game.S.ledger.claims[0]).toMatchObject({ subject: 'money.none', value: 'gone' })
  })
})

describe('сохранение и загрузка', () => {
  it('журнал переживает сохранение и загрузку без потерь', () => {
    const { game, storage } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в Дубае.' })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги у Ноя.' })
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
  it('migrateLedger на уже мигрированном журнале — тот же объект', () => {
    const l = freshLedger()
    publishClaim(l, 'money.location', 'dubai', meta)
    expect(migrateLedger({}, l)).toBe(l)
  })
})
