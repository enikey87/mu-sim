// Бухгалтерия лжи: типизированный журнал знаний — публикация, противоречия, переходы,
// сохранение и миграция старых ключей (docs/design/lie-ledger.md, задача #425).
import { describe, it, expect } from 'vitest'
import {
  freshLedger, publishClaim, publishTransition, publishRetraction, activeClaim,
  openEpisodes, currentEpisode, closeEpisode, migrateLedger, CLAIM_LEDGER,
} from './ledger'
import { CLAIMS } from './lies'
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
