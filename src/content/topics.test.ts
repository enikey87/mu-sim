// Ответы по теме, «Это корова?» только сразу после «Мууу», реплики по стадии игры.
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { valueOf } from '../engine/rules'
import { needs } from './world'
import { TOPICS, P_RUDE_BLOCKED, P_RUDE_POLITE, TOPIC_OBSESSED, P_NIGHT } from './topics'
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
      game.alikMsg({ kind: 'text', from: 'alik', text, topical: true })
      expect(game.topicOfLast(), text).toBe(k)
    }
  })
  it('тема — только из последних реплик самого Алика после сообщения игрока', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Бетон обиделся.', topical: true })
    game.push({ kind: 'text', from: 'me', text: 'Ясно.' })
    expect(game.topicOfLast()).toBeUndefined()
    game.alikMsg({ kind: 'text', from: 'alik', who: 'karine', text: 'Бетон, бетон…', topical: true })
    expect(game.topicOfLast()).toBeUndefined()
  })
  it('игроку предлагается реплика по теме, Алик отвечает из своего пула темы', async () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Бетон обиделся и не застывает.', topical: true })
    let c
    for (let i = 0; i < 30 && !c; i++) c = fresh(game).find((x) => x.act === 'topic')
    expect(String(c!.arg)).toMatch(/^beton:\d$/)
    expect(TOPICS.beton.p.map(valueOf).some((p) => c!.text.includes(p.slice(0, 15)))).toBe(true)
    const from = game.S.msgs.length
    await game.send(c!)
    const said = game.S.msgs.slice(from).filter((m) => m.kind === 'text' && m.from === 'alik').map((m) => (m.kind === 'text' ? m.text : ''))
    // ответ — парный именно этому вопросу
    const i = Number(String(c!.arg).split(':')[1])
    expect(said).toContain(TOPICS.beton.a[i])
  })
  it('третий вопрос про одну тему — Алик замечает (один раз)', async () => {
    const { game } = makeGame()
    const ask = async (i: number) => { const n = game.S.msgs.length; await game.fire('PlayerSays', { intent: 'topic', arg: `beton:${i}` }); return game.S.msgs.slice(n).map((m) => (m.kind === 'text' ? m.text : '')).join(' ') }
    await ask(0); await ask(1)
    expect(await ask(2)).toMatch(/бетон/)
    expect(game.S.mem['topic.beton']).toBe(0) // счётчик сброшен, тема заглушена на 20 дней
    expect(game.topicMuted('beton')).toBe(true)
    game.S.mem.topicRun = 0
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Бетон опять не застывает.', topical: true })
    expect(game.topicOfLast()).toBeUndefined() // «больше не скажу» — и игроку не предлагается
    game.S.day += 20
    expect(game.topicOfLast()).toBe('beton')
    expect(TOPIC_OBSESSED.map(valueOf).some((t) => game.S.msgs.some((m) => m.kind === 'text' && m.text.includes(t.split('{n}')[1].slice(0, 12))))).toBe(true)
  })
  it('тема — только из отмазок, серий и ответов по теме, не из реакций на крик и извинения', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Прощаю. У нас с тобой как у меня с бетоном — ссоримся и миримся.' })
    expect(game.topicOfLast()).toBeUndefined()
  })
  it('конкретный вопрос — только если Алик это сказал: «Какой ещё ковчег?» не на археологов', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Нашли древний кувшин, приехали археологи.', topical: true })
    for (let i = 0; i < 40; i++) {
      const c = fresh(game).find((x) => x.act === 'topic')
      if (c) expect(c.text).not.toMatch(/ковчег|Урарту|Тигран/)
    }
  })
  it('дважды подряд про одну тему — третий раз не предлагается', async () => {
    const { game } = makeGame()
    for (const i of [0, 1]) await game.send({ text: 'q', tone: 'neutral', act: 'topic', arg: `food:${i}` })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Ем хаш.', topical: true })
    expect(game.topicOfLast()).toBeUndefined()
    await game.send({ text: 'Алик, привет', tone: 'polite' }) // другая реплика — серия прервалась
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Ем хаш.', topical: true })
    expect(game.topicOfLast()).toBe('food')
  })
  it('новая сцена сбрасывает старый контекст («что вы удалили?»)', async () => {
    const { game } = makeGame()
    game.S.ctx = { deleted: true }
    await game.enterNode('meet', game.scenes.meet.start)
    expect(game.S.ctx?.deleted).toBeUndefined()
  })
  it('слова Алика снимают «ответь на стикер»', async () => {
    const { game } = makeGame()
    game.S.ctx = { type: 'sticker' }
    expect(offered(game, (c) => c.act === 'stickerQ')).toBe(true)
    await game.say(['Все деньги ушли на свадьбу Бориса.'])
    expect(game.S.ctx?.type).toBeUndefined()
    expect(offered(game, (c) => c.act === 'stickerQ' || /стикер/i.test(c.text))).toBe(false)
  })
  it('ночью и вечером пятницы нейтральная реплика знает время', () => {
    const night = makeGame({ hour: 3 }).game
    let hit = false
    for (let i = 0; i < 20 && !hit; i++) hit = fresh(night).some((c) => c.tone === 'neutral' && P_NIGHT.some((p) => c.text.includes(p)))
    expect(hit).toBe(true)
  })
  it('клятвы и сроки — не тема: «Клянусь лавашом» не делает разговор про еду', () => {
    const { game } = makeGame()
    game.recordPromise({ text: 'как бетон застынет', d: null })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Клянусь лавашом, как бетон застынет — всё отдам.', topical: true })
    expect(game.topicOfLast()).toBeUndefined()
  })
  it('срок целиком — не тема: «После обеда…» не предлагает поесть', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Санкции, брат. Против меня лично.', topical: true })
    game.recordPromise({ text: 'после обеда, но не сегодняшнего — рассчитаюсь до копейки', d: 1 })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'После обеда, но не сегодняшнего — рассчитаюсь до копейки.', topical: true })
    expect(game.topicOfLast()).toBe('customs')
    expect(offered(game, (c) => c.act === 'topic' && String(c.arg).startsWith('food:'))).toBe(false)
    expect(offered(game, (c) => /поесть\?|ЕШЬ МЕНЬШЕ|Приятного аппетита|Вы всё время едите/i.test(c.text))).toBe(false)
  })
  it('срок — не тема и при повторном вызове: шаблон срока кэширован, поиск не продолжается с прошлого места', () => {
    const { game } = makeGame()
    game.recordPromise({ text: 'после обеда, но не сегодняшнего — рассчитаюсь до копейки', d: 1 })
    game.alikMsg({ kind: 'text', from: 'alik', text: 'После обеда, но не сегодняшнего — рассчитаюсь до копейки.', topical: true })
    for (let i = 0; i < 3; i++) expect(game.topicOfLast(), `вызов ${i + 1}`).toBeUndefined()
  })
  it('поздравить — только если повод праздничный', () => {
    const { game } = makeGame()
    game.S.ctx = { rel: { n: 'тёща' } as never, festive: false }
    expect(offered(game, (c) => c.act === 'congrats')).toBe(false)
    game.S.ctx = { rel: { n: 'тёща' } as never, festive: true }
    expect(offered(game, (c) => c.act === 'congrats')).toBe(true)
  })
  it('реплика с требованием «Борис есть» не звучит до первой серии его сериала', () => {
    const { game } = makeGame()
    const pool = [needs('boris')('Передайте Борису привет.'), 'Все сыты.']
    for (let i = 0; i < 10; i++) expect(game.draw('T_BORIS', pool)).toBe('Все сыты.')
    game.S.arcs.boris = { i: 1, last: 0 }
    const seen = new Set<string>()
    for (let i = 0; i < 10; i++) seen.add(game.draw('T_BORIS', pool))
    expect(seen.size).toBe(2)
  })
  it('после серии сериала вопрос про сериал важнее темы', () => {
    const { game } = makeGame()
    game.alikMsg({ kind: 'text', from: 'alik', text: 'Борис заболел. Съел смету.', topical: true })
    game.S.ctx = { arc: 'boris' }
    game.S.arcs.boris = { i: 2, last: game.S.day - 1 } // серия была вчера — сегодня по вопросу будет новая
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
