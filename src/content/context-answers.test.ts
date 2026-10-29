// Пилот контекстных ответов (#1549): строка игрока, которая ссылается на живой факт, получает свою
// пару «вопрос ↔ ответ», а не философский пул и не следующую серию. Два подтверждённых промаха
// живого плейтеста оператора 29.10: колёсный вопрос («Никогда — это тоже срок») и конвертный
// (рекорд свадьбы вместо конвертов).
import { describe, it, expect, vi } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import { LEGENDS } from './legends'
import { ARCS } from './arcs'
import { WHEELS, WHEELS_ASK, type When } from './excuses'
import { PROMISE_NEVER, WHEELS_NEVER } from './misc'
import { valueOf, type Entry } from '../engine/rules'
import { P_KONVERTY } from './rules/player-choice-pools'
import { KONVERTY_B } from './world'
import type { Game } from '../engine/game'

/** Самый длинный кусок шаблона без подстановок — по нему строка пула узнаётся в украшенном ответе. */
const chunk = (line: string): string => line.split(/\{\w+\}/).map((s) => s.replace(/^[\s.,!?…—«»]+|[\s.,!?…—«»]+$/g, '')).sort((a, b) => b.length - a.length)[0].toLowerCase()
const from = (pool: readonly Entry<string>[], text: string): boolean => pool.map(valueOf).some((line) => text.toLowerCase().includes(chunk(line)))

/** Алик обещает ровно срок `w` настоящим путём клятвы. */
async function said(w: When, seed = 1): Promise<Game> {
  const { game } = makeGame({ seed })
  vi.spyOn(game.X, 'promise').mockImplementation(() => ({ text: `${w.t} — отдам`, ...w }))
  await game.promiseLine()
  return game
}

/** Кнопка срока, которую правила собирают на этой доске. */
const button = (g: Game, rule: string) => {
  const r = g.rules.collect({ event: 'BuildChoices' }, g.facts()).find((x) => x.name === rule)
  expect(r, `нет кнопки ${rule}`).toBeDefined()
  return r!.offer!(g.rules.ctx(g, r!, { event: 'BuildChoices' }, g.facts()))
}

describe('колёсный вопрос «Нивы» (#1549, промах №11)', () => {
  it('кнопка — та самая строка, и arg помечает пару; ответ про колёса, а не философия «никогда»', async () => {
    const game = await said(LEGENDS.niva_back.until)
    const c = button(game, 'Opt_When_never')
    expect(c?.text, 'колёсная строка — единственная подходящая под этот срок').toContain(WHEELS_ASK)
    expect(c?.arg, 'пара ищется по строке вопроса').toBe('wheels')
    const n = game.S.msgs.length
    await game.send(c!)
    const answer = alikTexts(game.S.msgs.slice(n)).join(' ')
    expect(WHEELS_NEVER.some((l) => answer.includes(l.replace('{t}', WHEELS))), `ответ не про колёса: ${answer}`).toBe(true)
    expect(answer.toLowerCase(), 'вопрос про колёса ответил философский пул').not.toMatch(/никогда/)
    expect(from(PROMISE_NEVER, answer), `«Никогда — это тоже срок» на колёсный вопрос: ${answer}`).toBe(false)
  })

  it('негативный контроль: упрёк про сам срок по-прежнему получает пул «никогда», не колёсный ответ', async () => {
    const game = await said(LEGENDS.wedding.until)
    const c = button(game, 'Opt_When_never')
    expect(c?.arg, 'колёсной строки тут нет').not.toBe('wheels')
    const n = game.S.msgs.length
    await game.send(c!)
    const answer = alikTexts(game.S.msgs.slice(n)).join(' ')
    expect(from(PROMISE_NEVER, answer), `упрёк про срок без ответа пула: ${answer}`).toBe(true)
    expect(WHEELS_NEVER.some((l) => answer.includes(l)), 'колёсный ответ на чужой срок').toBe(false)
  })

  it('гейт держится не случайным розыгрышем: 12 нажатий колёсной кнопки — ни одного ответа из пула «никогда»', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const game = await said(LEGENDS.niva_back.until, seed)
      const c = button(game, 'Opt_When_never')
      expect(c?.arg, `сид ${seed}: кнопка не помечена парой`).toBe('wheels')
      const n = game.S.msgs.length
      await game.send(c!)
      const answer = alikTexts(game.S.msgs.slice(n)).join(' ')
      expect(from(PROMISE_NEVER, answer), `сид ${seed}: ${answer}`).toBe(false)
      expect(WHEELS_NEVER.some((l) => from([l.replace('{t}', WHEELS)], answer)), `сид ${seed}: ответ не из колёсного пула: ${answer}`).toBe(true)
    }
  })

  it('пулы не пересекаются: общий «никогда» не содержит колёсных строк, колёсный — философии', () => {
    const never = PROMISE_NEVER.map(valueOf).join('\n')
    const wheels = WHEELS_NEVER.join('\n')
    expect(wheels).not.toContain('Никогда — это тоже срок')
    for (const line of WHEELS_NEVER) expect(line, line).toMatch(/колёс|рассрочк/)
    expect(never).not.toMatch(/рассрочк/i)
  })
})

describe('конвертный вопрос свадьбы Самвела (#1549, промах №6)', () => {
  const withEnvelopes = () => {
    const { game } = makeGame()
    game.S.mem['heard.samvel_envelopes'] = true
    game.S.mem['intro.samvel'] = true
    game.S.mem['intro.tamada'] = true
    game.S.ctx = { arc: 'samvel' }
    return game
  }
  const offer = (g: Game) => g.rules.collect({ event: 'BuildChoices' }, g.facts()).find((r) => r.name === 'Opt_Konverty')

  it('до легенды конвертов кнопки нет: факт — единственный вход', () => {
    const { game } = makeGame()
    game.S.ctx = { arc: 'samvel' }
    expect(offer(game), 'оффер открыт без факта конвертов').toBeUndefined()
  })

  it('после легенды кнопка собирается, а вопрос ушёл из пула «как там» (серия рекорда больше не отвечает)', () => {
    const game = withEnvelopes()
    const r = offer(game)
    expect(r, 'оффера нет под живым фактом').toBeDefined()
    expect(ARCS.samvel.follow.map((e) => valueOf(e)), 'вопрос остался в follow — его перехватит ответ серией').not.toContain(valueOf(P_KONVERTY[0]))
    const c = r!.offer!(game.rules.ctx(game, r!, { event: 'BuildChoices' }, game.facts()))
    expect(c?.act).toBe('konverty')
    expect(c?.text).toBe(valueOf(P_KONVERTY[0]))
  })

  it('ответ — пара к строке: конверты у Самвела, без Книги рекордов и чужих фактов', async () => {
    const game = withEnvelopes()
    const r = offer(game)!
    const c = r.offer!(game.rules.ctx(game, r, { event: 'BuildChoices' }, game.facts()))!
    const n = game.S.msgs.length
    await game.send(c)
    const answer = alikTexts(game.S.msgs.slice(n)).join(' ')
    expect(answer, `ответ не из пары: ${answer}`).toContain(valueOf(KONVERTY_B[Number(c.arg)]))
    expect(answer.toLowerCase()).toContain('конверт')
    expect(answer.toLowerCase(), 'ответ серией про рекорд вернулся').not.toMatch(/рекорд|книг/)
  })

  it('в блоке конвертный вопрос стоит вместо обычного «как там», а после показа уступает его окну', async () => {
    const game = withEnvelopes()
    game.S.day = 30
    game.S.arcs.samvel = { i: 1, last: 20 } // серия может двигаться вопросом — рядом живёт обычная кнопка «как там»
    expect(game.facts()['ctx.arcCanAdvance'], 'проверка не про тот кадр: обычная кнопка не собирается').toBe(true)
    game.S.choices = null
    const first = game.choices.filter((c) => c.topic === 'arc:samvel')
    expect(first.map((c) => c.act), 'две кнопки об одном или вопрос без ответа').toEqual(['konverty'])
    await game.send(first[0])
    const next = game.choices.filter((c) => c.topic === 'arc:samvel')
    expect(next.length, 'окно пары не закрыло кнопку').toBeLessThanOrEqual(1)
    expect(next.map((c) => c.act), 'вопрос с ответом вернулся в блок раньше окна').not.toContain('konverty')
  })

  it('у каждой строки вопроса есть ответ того же номера', () => {
    expect(KONVERTY_B.length).toBe(P_KONVERTY.length)
    for (const a of KONVERTY_B) expect(valueOf(a)).toMatch(/конверт/i)
  })
})
