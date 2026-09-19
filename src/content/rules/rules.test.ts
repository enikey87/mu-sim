// Сценарии правил: именно те места, где в оригинале были нелогичные ответы.
import { describe, it, expect } from 'vitest'
import { makeGame, alikTexts } from '../../test/helpers'
import { spec } from '../../engine/rules'
import type { Game } from '../../engine/game'
import type { Choice, Ctx } from '../../engine/state'
import { D } from '../excuses'
import { ARCS, ARC_DONE } from '../arcs'
import { RUDE_AGAIN, SORRY_AGAIN, CONDOLE_REVIVED, PREV_MANY, PROMISE_NEVER, SWING } from '../misc'

const rel = { n: 'дядя Самвел', g: 'дяди Самвела' }
const choicesFor = (game: Game, ctx: Ctx | null) => { game.S.ctx = ctx; return game.buildChoices() }
const acts = (cs: Choice[]) => cs.map((c) => c.act)
/** Отправить реплику и вернуть новые тексты Алика. */
async function reply(game: Game, c: Choice): Promise<string[]> {
  const from = game.S.msgs.length
  await game.send(c)
  return alikTexts(game.S.msgs.slice(from))
}
const oneOf = (arr: readonly string[], text: string) => arr.some((a) => text.includes(a))
// у фраз могут быть обращение в начале и опечатки — ищем по ключевому фрагменту
const frag = (s: string) => s.replace(/[.!?…]+$/, '').slice(5, 25)

describe('варианты игрока (BuildChoices)', () => {
  it('после печального события — «Соболезную», никогда не «Поздравьте»', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { game } = makeGame({ seed })
      const a = acts(choicesFor(game, { rel, sad: true }))
      expect(a).not.toContain('congrats')
      expect(a.includes('condole') || a.includes('whyRel')).toBe(true)
    }
  })
  it('после радостного — поздравить или спросить, но не соболезновать', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { game } = makeGame({ seed })
      const a = acts(choicesFor(game, { rel, sad: false }))
      expect(a).not.toContain('condole')
    }
  })
  it('«Завтра» → «это когда?», «Брат, в пути» → «А подробнее?»', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { game } = makeGame({ seed })
      expect(acts(choicesFor(game, { type: 'short', s: 'Завтра.' }))).toContain('shortQ')
      const other = choicesFor(game, { type: 'short', s: 'Брат, в пути 🙏' })
      expect(acts(other)).toContain('short2')
      expect(acts(other)).not.toContain('shortQ')
      expect(other.map((c) => c.text).join()).not.toMatch(/«Брат»/)
    }
  })
  it('после грубости первым всегда предлагается помириться', () => {
    const { game } = makeGame()
    expect(choicesFor(game, { offended: true })[0].act).toBe('sorry')
  })
  it('на голосовое — «можно текстом?» или «это корова?», одна кнопка', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      const { game } = makeGame({ seed })
      const a = acts(choicesFor(game, { type: 'voice' })).filter((x) => x === 'voice' || x === 'voiceText')
      expect(a).toHaveLength(1)
      seen.add(a[0]!)
    }
    expect(seen).toEqual(new Set(['voice', 'voiceText']))
  })
  it('всегда есть общие реплики: вежливая и грубая; не больше 4 вариантов', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { game } = makeGame({ seed })
      const cs = choicesFor(game, { rel, when: 'завтра', constr: true, deleted: true, type: 'photo' })
      expect(cs.length).toBeLessThanOrEqual(4)
      expect(cs.some((c) => c.tone === 'polite' && !c.act)).toBe(true)
      expect(cs.some((c) => c.tone === 'rude')).toBe(true)
    }
  })
})

describe('ответы Алика (PlayerSays)', () => {
  it('на «можно текстом?» Алик не отвечает про корову', async () => {
    for (let seed = 1; seed <= 15; seed++) {
      const { game } = makeGame({ seed })
      game.S.ctx = { type: 'voice' }
      const t = await reply(game, { text: 'Алик, можно текстом?', tone: 'neutral', act: 'voiceText' })
      expect(t.join(' ')).not.toMatch(/коров|мычан|Мууу|прораб\./i)
      expect(oneOf(D.VOICE_A, t.join(' '))).toBe(true)
    }
  })
  it('соболезнование, когда покойник «встал» — отдельный ответ', async () => {
    const { game } = makeGame()
    game.S.ctx = { rel, sad: true, revived: true }
    const t = await reply(game, { text: 'Соболезную…', tone: 'polite', act: 'condole' })
    expect(oneOf(CONDOLE_REVIVED.map(frag), t.join(' '))).toBe(true)
  })
  it('обычное соболезнование — благодарность и «не время»', async () => {
    const { game } = makeGame()
    game.S.ctx = { rel, sad: true }
    const t = await reply(game, { text: 'Соболезную…', tone: 'polite', act: 'condole' })
    expect(oneOf(D.CONDOLE_A, t.join(' '))).toBe(true)
  })
  it('пока Алик «пропал», на вопрос он отвечает только вернувшись', async () => {
    const { game } = makeGame()
    game.S.offlineDays = 4
    const day = game.S.day
    game.S.ctx = { type: 'photo' }
    const t = await reply(game, { text: 'Это же баран.', tone: 'neutral', act: 'photo' })
    expect(game.S.day).toBeGreaterThanOrEqual(day + 4)
    expect(oneOf(D.BACK_A, t[0])).toBe(true)
    expect(game.S.offlineDays).toBe(0)
  })
  it('извинение работает и во время пропажи и сокращает её', async () => {
    const { game } = makeGame()
    game.S.offlineDays = 9
    game.S.ctx = { offended: true }
    const t = await reply(game, { text: 'Мир? 🙏', tone: 'polite', act: 'sorry' })
    expect(oneOf(D.SORRY_A, t.join(' '))).toBe(true)
    expect(game.S.offlineDays).toBe(0)
  })
  it('память: третье извинение подряд — Алик это замечает', async () => {
    const { game } = makeGame()
    for (let i = 0; i < 2; i++) { await reply(game, { text: 'Прости', tone: 'polite', act: 'sorry' }); game.S.stats.sent += 10 }
    const t = await reply(game, { text: 'Прости ещё раз', tone: 'polite', act: 'sorry' })
    expect(oneOf(SORRY_AGAIN.map((l) => frag(spec(l).t)), t.join(' '))).toBe(true)
    expect(game.S.ach.memory).toBeDefined()
  })
  it('качели: третий «мир» за 6 ходов — Алика укачало, ссора не остывает', async () => {
    const { game } = makeGame()
    for (let i = 0; i < 2; i++) await reply(game, { text: 'Прости', tone: 'polite', act: 'sorry' })
    game.S.mem['rude.heat'] = 1 // на высокой температуре своё правило лестницы («только очно: хаш…»)
    const t = await reply(game, { text: 'Прости ещё раз', tone: 'polite', act: 'sorry' })
    expect(oneOf(SWING.map(frag), t.join(' ')), t.join(' | ')).toBe(true)
    expect(game.S.mem['rude.heat']).toBe(1)
  })
  it('сериал закончился — финальный ответ этого сериала, а не «без новостей»', async () => {
    const { game } = makeGame()
    game.S.arcs.boris = { i: ARCS.boris.eps.length, last: 0 }
    const t = await reply(game, { text: 'Как там Борис?', tone: 'polite', act: 'arc', arg: 'boris' })
    expect(oneOf(ARC_DONE.boris.map(frag), t.join(' '))).toBe(true)
  })
  it('сериал не закончился — следующая серия', async () => {
    const { game } = makeGame()
    game.S.arcs.beton = { i: 1, last: game.S.day - 2 }
    const t = await reply(game, { text: 'Как бетон?', tone: 'polite', act: 'arc', arg: 'beton' })
    expect(t.join(' ')).toMatch(/Место отметили/)
    expect(game.S.arcs.beton.i).toBe(2)
  })
  it('на вопрос назавтра после серии — следующая серия, второй вопрос в тот же день — «пока без новостей»', async () => {
    const { game } = makeGame()
    game.S.arcs.beton = { i: 1, last: game.S.day - 1 }
    const ask = () => game.fire('PlayerSays', { intent: 'arc', arg: 'beton' })
    await ask()
    expect(game.S.arcs.beton.i).toBe(2)
    await ask()
    expect(game.S.arcs.beton.i).toBe(2)
  })
  it('много просроченных обещаний — Алик предлагает «начать с чистого листа»', async () => {
    const { game } = makeGame()
    for (let i = 0; i < 6; i++) game.S.promises.push({ t: `завтра ${i}`, made: 100, due: 101 })
    const t = await reply(game, { text: 'Вы обещали…', tone: 'neutral', act: 'prev', arg: 0 })
    expect(oneOf(PREV_MANY.map(frag), t.join(' '))).toBe(true)
    expect(game.S.promises[0].asked).toBe(true)
  })
  it('переспросить срок «когда-нибудь» — честный ответ', async () => {
    const { game } = makeGame()
    game.S.ctx = { when: 'когда Арарат вернут', whenNever: true }
    const t = await reply(game, { text: 'Точно?', tone: 'neutral', act: 'promiseCheck', arg: 'когда Арарат вернут' })
    expect(oneOf(PROMISE_NEVER.map(frag), t.join(' '))).toBe(true)
  })
  it('переспросить обычный срок — клятва и тот же срок', async () => {
    const { game } = makeGame()
    game.S.ctx = { when: 'в среду утром' }
    const t = await reply(game, { text: 'Точно?', tone: 'neutral', act: 'promiseCheck', arg: 'в среду утром' })
    expect(t.join(' ').toLowerCase()).toContain('в среду утром')
  })
})

describe('тон сообщения (PlayerMessage)', () => {
  it('грубость — обида и пропажа; крик после остывания ссоры — Алик помнит', async () => {
    const { game } = makeGame()
    const rude: Choice = { text: 'АЛИК!!! Хватит врать!!!', tone: 'rude' }
    const first = await reply(game, rude)
    expect(game.S.offlineDays).toBeGreaterThan(0)
    expect(game.S.offlineDays).toBeLessThanOrEqual(2) // обида больше не перематывает игру на недели
    expect(first.length).toBeGreaterThan(0)
    for (let i = 0; i < 2; i++) { game.S.offlineDays = 0; game.nextDay(21); await game.afterTurn(); await reply(game, rude) }
    expect(game.S.mem['count.rude']).toBe(3)
    game.S.offlineDays = 0
    game.nextDay(21)
    await game.afterTurn()
    const fourth = await reply(game, rude)
    expect(oneOf(RUDE_AGAIN.map((l) => frag(spec(l).t)), fourth.join(' '))).toBe(true)
  })
  it('угроза судом — насмешка, дальше линия суда: юрист, претензия', async () => {
    const { game } = makeGame()
    const t1 = await reply(game, { text: 'Я иду в суд!', tone: 'rude' })
    expect(oneOf(D.THREAT_A, t1.join(' '))).toBe(true)
    expect(game.S.ach.threat).toBeDefined()
    game.S.offlineDays = 0
    const t2 = game.S.msgs.length
    await game.send({ text: 'Пишу заявление!!', tone: 'rude' })
    expect(game.S.msgs.slice(t2).some((m) => m.kind === 'text' && m.who === 'arsen')).toBe(true)
    expect(game.S.mem.court).toBe(2)
  })
  it('вопрос про корову', async () => {
    const { game } = makeGame()
    const t = await reply(game, { text: 'Это корова мычит?', tone: 'cow' })
    expect(oneOf(D.COW_A, t.join(' ')) || oneOf(D.COW_B, t.join(' '))).toBe(true)
  })
})

describe('Алик пишет сам (AlikIdle)', () => {
  it('посреди сцены не перебивает — только уведомление телефона', async () => {
    const { game } = makeGame()
    game.S.scene = { id: 'deathbed', node: 'ask', vars: {} }
    const n = game.S.msgs.length
    await game.fire('AlikIdle')
    expect(game.S.msgs.length).toBe(n)
    expect(game.notif).not.toBeNull()
  })
  it('в обычном режиме пишет сам', async () => {
    let wrote = 0
    for (let seed = 1; seed <= 20; seed++) {
      const { game } = makeGame({ seed })
      const n = game.S.msgs.length
      await game.fire('AlikIdle')
      if (game.S.msgs.length > n) wrote++
    }
    expect(wrote).toBeGreaterThan(10)
  })
})

describe('ход Алика (AlikTurn): веса как в оригинале', () => {
  it('частоты действий близки к заданным', () => {
    const { game } = makeGame({ seed: 5 })
    const f = { ...game.facts(), sent: 20, arcAvailable: true, arcsStarted: 3, mood: 5 } // сериалы уже идут — без «первого сериала»
    const n: Record<string, number> = {}
    const N = 6000
    for (let i = 0; i < N; i++) { const r = game.rules.match({ event: 'AlikTurn' }, f)!.name; n[r] = (n[r] ?? 0) + 1 }
    const p = (k: string) => (n[k] ?? 0) / N
    expect(p('Turn_Excuse')).toBeGreaterThan(0.12)
    expect(p('Turn_Quest')).toBeGreaterThan(0.08)
    expect(p('Turn_Excuse')).toBeLessThan(0.42)
    expect(p('Turn_Arc')).toBeGreaterThan(0.1)
    expect(p('Turn_Scene')).toBeGreaterThan(0.09)
    expect(p('Turn_Group')).toBeGreaterThan(0.01)
  })
  it('недоступное отсекается условиями', () => {
    const { game } = makeGame({ seed: 5 })
    const f = { ...game.facts(), sent: 0, arcAvailable: false }
    for (let i = 0; i < 1000; i++) expect(['Turn_Scene', 'Turn_Arc', 'Turn_Group', 'Turn_Wrong']).not.toContain(game.rules.match({ event: 'AlikTurn' }, f)!.name)
  })
})
