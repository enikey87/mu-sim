// Бухгалтерия лжи: явная публикация утверждений, противоречия, «Поймать на лжи», воспоминания.
import { describe, it, expect } from 'vitest'
import { CLAIMS, LIE_GRANDPA, LIE_THIRD, LIE_NOCRED, LIE_OPEN } from './lies'
import { CLAIM_LEDGER, CONFLICTING, currentEpisode, openEpisodes, publishTransition } from './ledger'
import { makeGame, alikTexts, botTurn } from '../test/helpers'
import type { Game } from '../engine/game'
import type { ClaimKey } from './ids'
import { ARCS } from './arcs'
import { MEMORY } from './memory'
import { GRAND } from './payday'
import { caughtCount, phoneKarine } from './memkeys'
import { meet } from './world'
import { spec, test, resolver, valueOf } from '../engine/rules'
import { loadState, saveState } from '../engine/state'
import * as arcs from './arcs'
import * as endgame from './endgame'
import * as excuses from './excuses'
import * as legends from './legends'
import * as life from './life'
import * as misc from './misc'
import * as rude from './rude'
import * as scenes from './scenes'
import * as talk from './talk'
import * as world from './world'

const frag = (s: string) => s.replace(/[.!?…]+$/, '').slice(5, 25)
const oneOf = (arr: readonly string[], text: string) => arr.some((a) => text.includes(frag(a)))
/** Реплика с явной семантикой: текст не важен, журнал читает claims. */
const hear = (game: Game, claims: ClaimKey[], who?: string) =>
  game.alikMsg({ kind: 'text', from: 'alik', text: `реплика ${claims.join(',')}`, who }, claims)
async function catchLie(game: Game): Promise<string> {
  const c = game.buildChoices().find((x) => x.act === 'catchLie')!
  expect(c, 'кнопка «Поймать на лжи»').toBeDefined()
  const from = game.S.msgs.length
  await game.send(c)
  return alikTexts(game.S.msgs.slice(from)).join(' ')
}

/** Все ключи, которые контент явно публикует у своих реплик. */
function contentClaims(): Set<string> {
  const out = new Set<string>()
  const seen = new Set<unknown>()
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object' || seen.has(v)) return
    seen.add(v)
    const claims = (v as { claims?: unknown }).claims
    if (Array.isArray(claims)) for (const k of claims) out.add(String(k))
    for (const x of Object.values(v)) walk(x)
  }
  for (const m of [arcs, endgame, excuses, legends, life, misc, rude, scenes, talk, world]) walk({ ...m })
  return out
}

/** claims каждой реплики по отдельности — не склейка всех ключей контента. */
function contentClaimSets(): string[][] {
  const out: string[][] = []
  const seen = new Set<unknown>()
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object' || seen.has(v)) return
    seen.add(v)
    const claims = (v as { claims?: unknown }).claims
    if (Array.isArray(claims)) out.push(claims.map(String))
    for (const x of Object.values(v)) walk(x)
  }
  for (const m of [arcs, endgame, excuses, legends, life, misc, rude, scenes, talk, world]) walk({ ...m })
  return out
}

describe('утверждения', () => {
  it('каждое утверждение опубликовано хоть одной реальной репликой контента', () => {
    const published = contentClaims()
    for (const c of CLAIMS) expect(published.has(c.key), c.key).toBe(true)
  })
  it('реплика без разметки знания не создаёт, как бы похоже ни звучала', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в Дубае.' })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги у Ноя.' })
    expect(game.S.ledger.claims).toHaveLength(0)
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(false)
  })
  it('новая партия не пишет старые ключи бухгалтерии в память', async () => {
    const { game } = makeGame()
    hear(game, ['money_jar'])
    hear(game, ['money_dubai'])
    await catchLie(game)
    const legacy = Object.keys(game.S.mem).filter((k) => /^(said|saidLast|by|lie|caught)\./.test(k))
    expect(legacy).toEqual([])
  })
  it('одна реплика не публикует несовместимые версии сама с собой (#437)', () => {
    for (const claims of contentClaimSets()) {
      const bySubject = new Map<string, string>()
      for (const k of claims) {
        const p = CLAIM_LEDGER[k as ClaimKey]
        if (!p || !CONFLICTING.has(p.subject)) continue
        expect(bySubject.get(p.subject) ?? p.value, `реплика с claims [${claims.join(', ')}]`).toBe(p.value)
        bySubject.set(p.subject, p.value)
      }
    }
  })
})

describe('реальный контент доходит до поимки', () => {
  it('серия «деньги в фундаменте» против серии Нуне «ключ от сейфа» — кнопка и ответ', async () => {
    const { game } = makeGame()
    await game.playEpisode(ARCS.beton.eps[0], 'beton')
    await game.playEpisode(ARCS.nune.eps[0], 'nune')
    const c = game.buildChoices().find((x) => x.act === 'catchLie')
    expect(c?.text).toMatch(/фундамент/)
    expect(c?.text).toMatch(/сейф/)
    await catchLie(game)
    expect(game.S.mem.caught).toBe(1)
  })
  it('опечатка и пузырь исправления не меняют смысл и не дублируют запись', async () => {
    const { game } = makeGame({ typos: true, hour: 3 })
    for (let i = 0; i < 40; i++) await game.say([{ t: 'Деньги в Дубае, брат.', claims: ['money_dubai'] }])
    expect(alikTexts(game.S.msgs).some((t) => t.startsWith('*')), 'хоть одна опечатка с исправлением').toBe(true)
    expect(game.S.ledger.claims).toHaveLength(40)
    expect(new Set(game.S.ledger.claims.map((c) => c.value))).toEqual(new Set(['dubai']))
    await game.say([{ t: 'Дньги у Ноя', claims: ['money_noah'] }])
    expect(await catchLie(game)).toBeTruthy()
  })
})

describe('партия бота', () => {
  it('бот сам слышит противоречие в контенте, видит постоянную кнопку и ловит Алика', async () => {
    const { game } = makeGame({ seed: 1 })
    let caught = 0
    for (let i = 0; i < 400 && !caught; i++) {
      const c = await botTurn(game)
      if (c?.act === 'catchLie') caught++
    }
    expect(caught, 'кнопка «Поймать на лжи» за 400 ходов').toBe(1)
    expect(game.S.ledger.episodes.some((e) => e.status === 'caught')).toBe(true)
    expect(game.S.ach.liar).toBeDefined()
  })
})

describe('поймать на лжи', () => {
  it('противоречие → кнопка «Поймать» первой → Алик выкручивается; та же пара новыми сообщениями ловится снова', async () => {
    const { game } = makeGame()
    hear(game, ['money_jar'])
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(false) // пока нечему противоречить
    hear(game, ['money_dubai'])
    const cs = game.buildChoices()
    expect(cs[0].act).toBe('catchLie')
    expect(cs[0].text).toMatch(/огурц/)
    expect(cs[0].text).toMatch(/Дубае/)
    const reply = await catchLie(game)
    expect(oneOf(LIE_OPEN, reply) || /огурц|Дуба/.test(reply)).toBe(true)
    expect(game.S.mem.caught).toBe(1)
    expect(game.S.ach.liar).toBeDefined()
    expect(openEpisodes(game.S.ledger)).toHaveLength(0)
    // ответ Алика пересказывает обе версии, но сам их не публикует — ни новой записи, ни нового эпизода
    expect(game.S.ledger.claims).toHaveLength(2)
    // та же пара новыми утверждениями — новый эпизод
    hear(game, ['money_jar'])
    hear(game, ['money_dubai'])
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(true)
  })
  it('одинаковые значения — не противоречие', () => {
    const { game } = makeGame()
    hear(game, ['money_dubai'])
    hear(game, ['money_dubai'])
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(false)
  })
  it('поймать можно и посреди сцены — это её прерывает', async () => {
    const { game } = makeGame()
    await game.enterNode('card', 'ask')
    expect(game.S.scene).not.toBeNull()
    hear(game, ['money_jar'])
    hear(game, ['money_noah'])
    const cs = game.buildChoices()
    expect(cs[0].act).toBe('catchLie')
    expect(cs.slice(1).every((c) => c.scene === 'card')).toBe(true)
    await game.send(cs[0])
    expect(game.S.scene).toBeNull()
    expect(game.S.mem.caught).toBe(1)
  })
  it('обычная реплика не закрывает эпизод — кнопка остаётся', async () => {
    const { game } = makeGame()
    hear(game, ['grandpa_dead'])
    hear(game, ['grandpa_alive'])
    expect(currentEpisode(game.S.ledger)?.subject).toBe('grandpa.life')
    game.S.choices = null
    await game.send({ text: 'Алик, привет', tone: 'neutral' })
    expect(currentEpisode(game.S.ledger)?.subject).toBe('grandpa.life')
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(true)
  })
  it('эпизод переживает 15/30/100 дней и сохранение', () => {
    const { game, storage } = makeGame()
    hear(game, ['money_jar'])
    hear(game, ['money_foundation'])
    const id = currentEpisode(game.S.ledger)!.id
    for (const days of [15, 30, 100]) {
      game.S.day += days
      game.S.choices = null
      expect(game.buildChoices().some((c) => c.act === 'catchLie'), `${days} дней`).toBe(true)
      expect(currentEpisode(game.S.ledger)?.id).toBe(id)
    }
    saveState(storage, game.S)
    const loaded = loadState(storage)!
    expect(openEpisodes(loaded.ledger)).toHaveLength(1)
    expect(openEpisodes(loaded.ledger)[0].id).toBe(id)
  })
  it('в блоке и «смерти» кнопка скрыта без потери эпизода и возвращается после', () => {
    const { game } = makeGame()
    hear(game, ['money_jar'])
    hear(game, ['money_noah'])
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(true)
    game.S.mem.blocked = true
    game.S.choices = null
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(false)
    expect(openEpisodes(game.S.ledger)).toHaveLength(1)
    delete game.S.mem.blocked
    game.S.mem.alik_dead = true
    game.S.choices = null
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(false)
    expect(openEpisodes(game.S.ledger)).toHaveLength(1)
    delete game.S.mem.alik_dead
    game.S.choices = null
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(true)
  })
  it('два открытых эпизода разбираются по одному без потери второго', async () => {
    const { game } = makeGame()
    hear(game, ['money_jar'])
    hear(game, ['money_dubai'])
    hear(game, ['grandpa_dead'])
    hear(game, ['grandpa_alive'])
    expect(openEpisodes(game.S.ledger)).toHaveLength(2)
    expect(currentEpisode(game.S.ledger)?.subject).toBe('grandpa.life') // новейший первым
    await catchLie(game)
    expect(openEpisodes(game.S.ledger)).toHaveLength(1)
    expect(currentEpisode(game.S.ledger)?.subject).toBe('money.location')
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(true)
  })
  it('известный переход закрывает эпизод; смена мира без сообщения — нет', () => {
    const { game } = makeGame()
    hear(game, ['money_jar'])
    hear(game, ['money_dubai'])
    expect(openEpisodes(game.S.ledger)).toHaveLength(1)
    game.setLegend('Деньги после свадьбы', 'samvel')
    expect(openEpisodes(game.S.ledger)).toHaveLength(1)
    publishTransition(game.S.ledger, 'money.location', 'bank', 'dubai', { source: 'alik', day: game.S.day })
    game.S.choices = null
    expect(openEpisodes(game.S.ledger)).toHaveLength(0)
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(false)
  })
  it('про дедушку — свой ответ', async () => {
    const { game } = makeGame()
    hear(game, ['grandpa_dead'])
    hear(game, ['grandpa_alive'])
    expect(game.facts().lieKind).toBe('grandpa')
    expect(oneOf(LIE_GRANDPA, await catchLie(game))).toBe(true)
  })
  it('третий раз — признание, четвёртый — «мне никто не верит»', async () => {
    const { game } = makeGame()
    const places: ClaimKey[] = ['money_dubai', 'money_noah', 'money_wife', 'money_crypto']
    hear(game, ['money_jar'])
    const replies: string[] = []
    for (const p of places) {
      hear(game, [p])
      game.S.offlineDays = 0
      replies.push(await catchLie(game))
    }
    // начало фразы: дальше может быть опечатка Алика («борат»)
    expect(oneOf(LIE_THIRD.map(valueOf).map((x) => x.slice(0, 12)), replies[2]), replies[2]).toBe(true)
    expect(oneOf(LIE_NOCRED.map(valueOf).map((x) => x.slice(0, 12)), replies[3]), replies[3]).toBe(true)
    expect(game.S.ach.liar3).toBeDefined()
  })
  it('противоречие от другого персонажа: Грант «всё заплатил»', () => {
    const { game } = makeGame()
    hear(game, ['customer_owes'])
    hear(game, ['customer_paid'], 'grant')
    expect(game.facts().lieKind).toBe('customer')
    expect(game.facts().lieAlikOld).toBe(true) // прошлую версию сказал сам Алик — «вы же говорили» уместно
  })
  it('версию сказал не Алик — игрок не приписывает её ему', () => {
    const { game } = makeGame()
    hear(game, ['money_safe'], 'nune')
    hear(game, ['money_foundation'])
    expect(game.facts().lieOpen).toBe(true)
    expect(game.facts().lieAlikOld).toBe(false)
    const text = game.buildChoices().find((c) => c.act === 'catchLie')!.text
    expect(text).not.toMatch(/вы же говорили/)
  })
})

describe('пути публикации claims (#437)', () => {
  it('ход Алика по легенде публикует её claims', async () => {
    const { game } = makeGame()
    game.setLegend('safe_nune', 'nune')
    let heard = false
    for (let i = 0; i < 60 && !heard; i++) {
      game.S.stats.sent += 3
      game.setLegend('safe_nune', 'nune') // серии других сериалов по дороге ставят свои легенды
      if ((await game.fire('AlikTurn'))?.name === 'Turn_Legend')
        heard = game.S.ledger.claims.some((c) => c.claimKey === 'money_safe' && c.source === 'alik')
      game.S.scene = null
    }
    expect(heard).toBe(true)
  })
  it('бит легенды между ходами тоже публикует claims', async () => {
    const { game } = makeGame()
    game.setLegend('safe_nune', 'nune')
    game.S.arcs.beton = { i: 1, last: game.S.day } // сериал сегодня уже был: биты сериалов молчат, остаётся Beat_Legend
    let heard = false
    for (let i = 0; i < 100 && !heard; i++) {
      game.S.stats.sent += 5 // перерыв Beat_Legend — 5 ходов
      if ((await game.fire('StoryBeat'))?.name === 'Beat_Legend')
        heard = game.S.ledger.claims.some((c) => c.claimKey === 'money_safe' && c.source === 'alik')
    }
    expect(heard).toBe(true)
  })
  it('хор публикует claims со своим источником, а не от имени Алика', async () => {
    const { game } = makeGame()
    game.rules.applyOps(meet('nune'), {})
    game.setLegend('safe_nune', 'nune')
    let heard = false
    for (let i = 0; i < 60 && !heard; i++) {
      game.S.stats.sent += 13 // перерыв хора — 12 ходов
      if ((await game.fire('Mentioned', {}, { target: 'nune' }))?.name === 'Chorus_nune')
        heard = game.S.ledger.claims.some((c) => c.claimKey === 'money_safe' && c.source === 'nune')
    }
    expect(heard).toBe(true)
  })
  it('реплики под heard.money_jar звучат только после услышанной банки', () => {
    const { game } = makeGame()
    game.S.mem[caughtCount] = 1 // второе условие реплики памяти
    const mem = MEMORY.find((l) => spec(l).t.includes('не в банке с огурцами'))!
    const grand = GRAND.place.find((l) => spec(l).t.includes('банке с огурцами'))!
    // isOpen смотрит только Gated; условия обычной строки проверяем по одному через резолвер досок
    const open = (l: (typeof MEMORY)[number]) => {
      const f = resolver(game.rules.hub, { event: 'line' }, game.facts())
      return (spec(l).when ?? []).every((c) => test(c, f))
    }
    expect(open(mem)).toBe(false)
    expect(open(grand)).toBe(false)
    hear(game, ['money_jar'])
    expect(open(mem)).toBe(true)
    expect(open(grand)).toBe(true)
  })
  it('телефон у Карине и офлайн скрывают кнопку без потери эпизода и возвращают её', () => {
    const { game } = makeGame()
    hear(game, ['money_jar'])
    hear(game, ['money_noah'])
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(true)
    game.S.mem[phoneKarine] = true
    game.S.choices = null
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(false)
    expect(openEpisodes(game.S.ledger)).toHaveLength(1)
    delete game.S.mem[phoneKarine]
    game.S.offlineDays = 3
    game.S.choices = null
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(false)
    expect(openEpisodes(game.S.ledger)).toHaveLength(1)
    game.S.offlineDays = 0
    game.S.choices = null
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(true)
  })
})

describe('Алик сам вспоминает своё враньё', () => {
  it('через 10 дней возвращается к утверждению и продолжает историю', async () => {
    const { game } = makeGame()
    hear(game, ['beton'])
    expect(game.callbackCandidate()).toBeUndefined()
    game.S.day += 11
    expect(game.callbackCandidate()?.key).toBe('beton')
    expect(game.facts().callbackReady).toBe(true)
    const from = game.S.msgs.length
    await game.callback()
    const t = alikTexts(game.S.msgs.slice(from)).join(' ')
    expect(t).toMatch(/бетон обиделся/i)
    expect(game.S.ach.memory).toBeDefined()
    expect(game.callbackCandidate()).toBeUndefined() // второй раз не вспоминает
  })
  it('версию из чата родственника себе не приписывает', () => {
    const { game } = makeGame()
    hear(game, ['beton'], 'garik')
    expect(game.S.ledger.claims[0]).toMatchObject({ subject: 'beton.mood', source: 'garik' })
    game.S.day += 11
    expect(game.callbackCandidate()).toBeUndefined()
  })
  it('неразмеченная строка про бетон воспоминания не заводит', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Бетон обиделся и не застывает.' })
    game.S.day += 11
    expect(game.callbackCandidate()).toBeUndefined()
  })
})
