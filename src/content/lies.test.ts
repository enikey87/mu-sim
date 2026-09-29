// Бухгалтерия лжи: распознавание утверждений, противоречия, «Поймать на лжи», воспоминания.
import { describe, it, expect } from 'vitest'
import { CLAIMS, conflicts, pairKey, LIE_GRANDPA, LIE_THIRD, LIE_NOCRED, LIE_OPEN } from './lies'
import { currentEpisode, openEpisodes, publishTransition } from './ledger'
import { makeGame, alikTexts } from '../test/helpers'
import type { Game } from '../engine/game'
import { D } from './excuses'
import { ARCS } from './arcs'
import { valueOf } from '../engine/rules'
import { loadState, saveState } from '../engine/state'

const frag = (s: string) => s.replace(/[.!?…]+$/, '').slice(5, 25)
const oneOf = (arr: readonly string[], text: string) => arr.some((a) => text.includes(frag(a)))
async function catchLie(game: Game): Promise<string> {
  const c = game.buildChoices().find((x) => x.act === 'catchLie')!
  expect(c, 'кнопка «Поймать на лжи»').toBeDefined()
  const from = game.S.msgs.length
  await game.send(c)
  return alikTexts(game.S.msgs.slice(from)).join(' ')
}

describe('утверждения', () => {
  it('каждое утверждение встречается в реальном контенте игры', () => {
    const all = JSON.stringify([D, ARCS]) + [
      'Я Алику всё заплатил ещё в марте.', // реплика Гранта в сцене «заказчик»
    ].join()
    for (const c of CLAIMS) expect(c.re.test(all), c.key).toBe(true)
  })
  it('противоречия: разные места для денег, явные пары; одно и то же — не противоречие', () => {
    expect(conflicts('money_jar', 'money_dubai')).toBe(true)
    expect(conflicts('sent', 'no_money')).toBe(true)
    expect(conflicts('no_money', 'sent')).toBe(true)
    expect(conflicts('money_jar', 'money_jar')).toBe(false)
    expect(conflicts('beton', 'money_jar')).toBe(false)
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'))
  })
})

describe('поймать на лжи', () => {
  it('противоречие → кнопка «Поймать» первой → Алик выкручивается; та же пара новыми сообщениями ловится снова', async () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги лежат в банке. В трёхлитровой, с огурцами.' })
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(false) // пока нечему противоречить
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Брат, деньги в Дубае у двоюродного брата.' })
    const cs = game.buildChoices()
    expect(cs[0].act).toBe('catchLie')
    expect(cs[0].text).toMatch(/огурц/)
    expect(cs[0].text).toMatch(/Дубае/)
    const reply = await catchLie(game)
    expect(oneOf(LIE_OPEN, reply) || /огурц|Дуба/.test(reply)).toBe(true)
    expect(game.S.mem.caught).toBe(1)
    expect(game.S.ach.liar).toBeDefined()
    expect(openEpisodes(game.S.ledger)).toHaveLength(0)
    // та же пара новыми утверждениями — новый эпизод
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги лежат в банке. В трёхлитровой, с огурцами.' })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в Дубае, я же говорил.' })
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(true)
  })
  it('поймать можно и посреди сцены — это её прерывает', async () => {
    const { game } = makeGame()
    await game.enterNode('card', 'ask')
    expect(game.S.scene).not.toBeNull()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги лежат в банке. В трёхлитровой, с огурцами.' })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги у Ноя.' })
    const cs = game.buildChoices()
    expect(cs[0].act).toBe('catchLie')
    expect(cs.slice(1).every((c) => c.scene === 'card')).toBe(true)
    await game.send(cs[0])
    expect(game.S.scene).toBeNull()
    expect(game.S.mem.caught).toBe(1)
  })
  it('обычная реплика не закрывает эпизод — кнопка остаётся', async () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Джан, дедушка перед смертью сказал: не плати.' })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Дедушка опять не умер.' })
    expect(currentEpisode(game.S.ledger)?.subject).toBe('grandpa.life')
    game.S.choices = null
    await game.send({ text: 'Алик, привет', tone: 'neutral' })
    expect(currentEpisode(game.S.ledger)?.subject).toBe('grandpa.life')
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(true)
  })
  it('эпизод переживает 15/30/100 дней и сохранение', () => {
    const { game, storage } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги лежат в банке. В трёхлитровой, с огурцами.' })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в фундаменте, брат.' })
    const id = currentEpisode(game.S.ledger)!.id
    for (const days of [15, 30, 100]) {
      game.S.day += days
      game.syncLieMem()
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
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги лежат в банке. В трёхлитровой, с огурцами.' })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги у Ноя.' })
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
    game.syncLieMem()
    game.S.choices = null
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(true)
  })
  it('два открытых эпизода разбираются по одному без потери второго', async () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги лежат в банке. В трёхлитровой, с огурцами.' })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в Дубае.' })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Джан, дедушка перед смертью сказал: не плати.' })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Дедушка опять не умер.' })
    expect(openEpisodes(game.S.ledger)).toHaveLength(2)
    expect(currentEpisode(game.S.ledger)?.subject).toBe('grandpa.life') // новейший первым
    await catchLie(game)
    expect(openEpisodes(game.S.ledger)).toHaveLength(1)
    expect(currentEpisode(game.S.ledger)?.subject).toBe('money.location')
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(true)
  })
  it('известный переход закрывает эпизод; смена мира без сообщения — нет', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги лежат в банке. В трёхлитровой, с огурцами.' })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в Дубае.' })
    expect(openEpisodes(game.S.ledger)).toHaveLength(1)
    game.setLegend('Деньги после свадьбы', 'samvel')
    expect(openEpisodes(game.S.ledger)).toHaveLength(1)
    publishTransition(game.S.ledger, 'money.location', 'bank', 'dubai', { source: 'alik', day: game.S.day })
    game.syncLieMem()
    game.S.choices = null
    expect(openEpisodes(game.S.ledger)).toHaveLength(0)
    expect(game.buildChoices().some((c) => c.act === 'catchLie')).toBe(false)
  })
  it('про дедушку — свой ответ', async () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Джан, дедушка перед смертью сказал: не плати.' })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Дедушка опять не умер. Отмечаем.' })
    expect(oneOf(LIE_GRANDPA, await catchLie(game))).toBe(true)
  })
  it('третий раз — признание, четвёртый — «мне никто не верит»', async () => {
    const { game } = makeGame()
    const places = ['Деньги в Дубае.', 'Деньги у Ноя.', 'Деньги у жены, жена у мамы.', 'Деньги в криптокошельке.', 'Деньги на пароме в Батуми.']
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги лежат в банке. В трёхлитровой, с огурцами.' })
    const replies: string[] = []
    for (const p of places.slice(0, 4)) {
      game.alikMsg({ kind: 'text', from: 'alik', text: p })
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
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Заказчик Грант мне не платит.' })
    game.alikMsg({ kind: 'text', from: 'alik', who: 'grant', text: 'Молодой человек, я Алику всё заплатил ещё в марте.' })
    expect(game.S.mem['lie.kind']).toBe('customer')
    expect(game.S.mem['lie.alikOld']).toBe(true) // прошлую версию сказал сам Алик — «вы же говорили» уместно
  })
  it('версию сказал не Алик — игрок не приписывает её ему', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', who: 'nune', text: 'Деньги в сейфе, ключ у меня.' })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Деньги в фундаменте, брат.' })
    expect(game.S.mem['lie.old']).toBeDefined()
    expect(game.S.mem['lie.alikOld']).toBe(false)
    const text = game.buildChoices().find((c) => c.act === 'catchLie')!.text
    expect(text).not.toMatch(/вы же говорили/)
  })
})

describe('Алик сам вспоминает своё враньё', () => {
  it('через 10 дней возвращается к утверждению и продолжает историю', async () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Бетон обиделся и не застывает.' })
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
    game.alikMsg({ kind: 'text', from: 'alik', who: 'garik', text: 'Скажи, что бетон обиделся, — всегда работает 😂' })
    expect(game.S.mem['said.beton']).toBeDefined()
    expect(game.S.mem['by.beton']).toBe('garik')
    game.S.day += 11
    expect(game.callbackCandidate()).toBeUndefined()
  })
})
