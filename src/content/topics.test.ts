// Ответы по теме, «Это корова?» только сразу после «Мууу», реплики по стадии игры.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { TOPICS, P_RUDE_BLOCKED, P_RUDE_POLITE } from './topics'
import { D } from './excuses'
import type { Game } from '../engine/game'

const fresh = (game: Game) => { game.S.choices = null; return game.choices }
const offered = (game: Game, pred: (c: ReturnType<Game['buildChoices']>[number]) => boolean, tries = 30) => {
  for (let i = 0; i < tries; i++) if (fresh(game).some(pred)) return true
  return false
}

describe('ответ по теме', () => {
  it('каждая тема узнаётся и у неё есть реплики игрока и ответы Алика', () => {
    for (const [k, t] of Object.entries(TOPICS)) {
      expect(t.p.length, k).toBeGreaterThanOrEqual(4)
      expect(t.a.length, k).toBeGreaterThanOrEqual(4)
    }
    const { game } = makeGame()
    const cases: Record<string, string> = {
      beton: 'Бетон обиделся.', niva: '«Нива» не заводится.', wedding: 'У Самвела свадьба.', bank: 'Банк на обеде.', ram: 'Баран заболел.',
      food: 'Ем хаш.', relative: 'Тётя приехала.', customs: 'Таможня не пропускает.', history: 'Это ещё Урарту решило.', cosmic: 'НАСА забрало деньги.',
    }
    for (const [k, text] of Object.entries(cases)) {
      game.alikMsg({ kind: 'text', from: 'alik', text })
      expect(game.topicOfLast(), text).toBe(k)
    }
  })
  it('тема — только из последних реплик самого Алика после сообщения игрока', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Бетон обиделся.' })
    game.push({ kind: 'text', from: 'me', text: 'Ясно.' })
    expect(game.topicOfLast()).toBeUndefined()
    game.alikMsg({ kind: 'text', from: 'alik', who: 'karine', text: 'Бетон, бетон…' })
    expect(game.topicOfLast()).toBeUndefined()
  })
  it('игроку предлагается реплика по теме, Алик отвечает из своего пула темы', async () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Бетон обиделся и не застывает.' })
    let c
    for (let i = 0; i < 30 && !c; i++) c = fresh(game).find((x) => x.act === 'topic')
    expect(c!.arg).toBe('beton')
    expect(TOPICS.beton.p.some((p) => c!.text.includes(p.slice(0, 15)))).toBe(true)
    const from = game.S.msgs.length
    await game.send(c!)
    const said = game.S.msgs.slice(from).filter((m) => m.kind === 'text' && m.from === 'alik').map((m) => (m.kind === 'text' ? m.text : ''))
    expect(said.some((t) => TOPICS.beton.a.some((a) => t.includes(a.slice(0, 20))))).toBe(true)
  })
  it('после серии сериала вопрос про сериал важнее темы', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Борис заболел. Съел смету.' })
    game.S.ctx = { arc: 'boris' }
    game.S.arcs.boris = { i: 2, last: game.S.day }
    expect(offered(game, (c) => c.act === 'topic')).toBe(false)
    expect(offered(game, (c) => c.act === 'arc')).toBe(true)
  })
})

describe('«Мууу» и корова', () => {
  it('«Это корова?» — только сразу после «Мууу»; следующий ход — уже нет', async () => {
    const { game } = makeGame()
    const cow = (c: { tone: string; text: string }) => c.tone === 'cow' && D.P_COW.some((p: string) => c.text.includes(p.slice(0, 10)))
    expect(offered(game, cow)).toBe(false)
    game.moo()
    expect(offered(game, cow)).toBe(true)
    await game.send({ text: 'Алик, добрый день', tone: 'polite' })
    expect(offered(game, cow)).toBe(false)
  })
})

describe('общие реплики по стадии игры', () => {
  it('в блоке и в вежливом режиме — свои грубые реплики', () => {
    const { game } = makeGame()
    game.S.mem.blocked = true
    expect(P_RUDE_BLOCKED).toContain(fresh(game).find((c) => c.tone === 'rude')!.text)
    game.S.mem.blocked = false
    game.S.mem.polite = true
    expect(P_RUDE_POLITE).toContain(fresh(game).find((c) => c.tone === 'rude')!.text)
  })
})
