import { describe, it, expect } from 'vitest'
import { makeGame, memStorage, alikTexts } from '../test/helpers'
import { manualClock } from './clock'
import { Game } from './game'
import { seededRng } from './rng'
import { SAVE_KEY } from './state'
import { ARCS } from '../content/arcs'

describe('Game: начало и ход', () => {
  it('новая игра: вступление, 184-й день, 3–4 варианта реплик', () => {
    const { game } = makeGame()
    expect(game.S.msgs.map((m) => m.kind)).toEqual(['sep', 'text', 'text', 'sys', 'sep'])
    expect(game.S.day).toBe(184)
    expect(game.choices.length).toBeGreaterThanOrEqual(3)
    expect(game.choices.length).toBeLessThanOrEqual(4)
    expect(game.choices.some((c) => c.tone === 'rude')).toBe(true)
  })
  it('вежливая реплика: Алик отвечает, счётчики и сохранение обновляются', async () => {
    const { game, storage } = makeGame()
    const polite = game.choices.find((c) => c.tone === 'polite')!
    const n = game.S.msgs.length
    await game.send(polite)
    const fresh = game.S.msgs.slice(n)
    expect(fresh[0]).toMatchObject({ kind: 'text', from: 'me', text: polite.text })
    expect(fresh.some((m) => 'from' in m && m.from === 'alik') || game.S.ctx?.type === 'reactOnly').toBe(true)
    expect(game.S.stats.sent).toBe(1)
    expect(game.S.ach.first).toBeDefined()
    expect(game.busy).toBe(false)
    expect(JSON.parse(storage.data[SAVE_KEY]).stats.sent).toBe(1)
  })
  it('свой текст классифицируется по тону', () => {
    const { game } = makeGame()
    expect(game.classify('АЛИК!!!')).toBe('rude')
    expect(game.classify('Я иду в СУД!!!')).toBe('threat')
    expect(game.classify('Это корова мычит?')).toBe('cow')
    expect(game.classify('Здравствуйте, извините')).toBe('polite')
    expect(game.classify('ну что там')).toBe('neutral')
  })
  it('пустое сообщение и повторная отправка во время ответа игнорируются', async () => {
    const { game } = makeGame()
    await game.send('   ')
    expect(game.S.stats.sent).toBe(0)
    const p = game.send('Алик, привет')
    await game.send('Второе')
    await p
    expect(game.S.stats.sent).toBe(1)
  })
  it('реплики игрока не повторяются', async () => {
    const { game } = makeGame({ seed: 3 })
    const mine: string[] = []
    for (let i = 0; i < 80; i++) {
      const c = game.choices.find((x) => x.tone === 'polite' && !x.act) ?? game.choices[0]
      // короткие кнопки сцен («Сбер», «Алик…») по замыслу не перефразируются — их не считаем
      if (!(c.scene && c.text.length <= 8)) mine.push(c.text)
      game.S.offlineDays = 0
      await game.send(c)
      if (game.dead) await game.charge()
    }
    expect(new Set(mine).size).toBe(mine.length)
  })
  it('терпение кончается — «полежал на полу»', async () => {
    const { game } = makeGame()
    game.S.patience = 1
    await game.send('Алик, привет')
    expect(game.S.patience).toBe(5)
    expect(game.S.ach.floor).toBeDefined()
  })
  it('после 25 сообщений у Алика аватарка-баран', async () => {
    const { game } = makeGame()
    game.S.stats.sent = 24
    await game.send('Алик, привет')
    expect(game.S.ram).toBe(true)
  })
})

describe('Game: допработа', () => {
  it('согласие — долг растёт, кнопки исчезают; отказ — настроение падает', async () => {
    const { game } = makeGame()
    await game.job()
    const job = game.S.msgs.findLast((m) => m.kind === 'job')!
    const debt = game.S.debt
    await game.answerJob(job.id, true)
    expect(game.S.debt).toBeGreaterThan(debt)
    expect(job.kind === 'job' && job.answered).toBe(true)
    await game.answerJob(job.id, true) // повторно — ничего
    expect(game.S.ach.fence).toBeDefined()
    await game.job()
    const job2 = game.S.msgs.findLast((m) => m.kind === 'job')!
    const mood = game.S.mood
    await game.answerJob(job2.id, false)
    expect(game.S.mood).toBe(mood - 1)
  })
})

describe('Game: батарея', () => {
  it('разряд — «телефон сел», отправка блокируется; зарядка — пачка непрочитанных', async () => {
    const { game } = makeGame()
    game.S.battery = 1
    game.S.stats.sent = 3
    await game.send('Алик, привет')
    expect(game.dead).toBe(true)
    expect(game.S.ach.dead).toBeDefined()
    await game.send('ещё')
    expect(game.S.stats.sent).toBe(4)
    const n = game.S.msgs.length
    await game.charge()
    expect(game.dead).toBe(false)
    expect(game.busy).toBe(false)
    expect(game.S.battery).toBe(100)
    expect(game.S.msgs.slice(n).some((m) => m.kind === 'sys' && m.unread)).toBe(true)
    expect(game.unread).toBeGreaterThan(0)
    await game.send('Алик, привет')
    expect(game.unread).toBe(0)
  })
  it('на 15% — уведомление о низком заряде', () => {
    const { game } = makeGame()
    game.S.battery = 16
    game.drain(1)
    expect(game.notif?.text).toMatch(/Низкий заряд/)
  })
})

describe('Game: возвращение после паузы', () => {
  it('долгое отсутствие — непрочитанные, счётчик в заголовке, телефон заряжен', () => {
    const storage = memStorage()
    const clock = manualClock()
    const g1 = new Game({ storage, clock, rng: seededRng(1), noTimers: true, hour: 14 })
    g1.S.stats.sent = 5
    g1.S.battery = 40
    g1.save()
    clock.advance(3 * 3600_000)
    const g2 = new Game({ storage, clock, rng: seededRng(2), noTimers: true, hour: 14 })
    expect(g2.unread).toBeGreaterThan(0)
    expect(g2.title).toMatch(/^\(\d\)/)
    expect(g2.S.battery).toBe(100)
    expect(g2.S.ach.away).toBeDefined()
  })
  it('короткая пауза и новая игра — без непрочитанных', () => {
    const { game } = makeGame({ away: 5 })
    expect(game.unread).toBe(0)
  })
  it('скрытая вкладка 3+ минуты — пачка сообщений', () => {
    const { game, clock } = makeGame()
    game.S.stats.sent = 2
    game.onVisibility(true)
    clock.advance(5 * 60_000)
    game.onVisibility(false)
    expect(game.unread).toBeGreaterThan(0)
  })
})

describe('Game: Алик пишет сам (таймеры)', () => {
  it('молчание игрока → Алик пишет первым: не в начале игры, не раньше 1,5 минут, не больше двух раз подряд', async () => {
    const clock = manualClock()
    const delays: number[] = []
    const set = clock.setTimeout.bind(clock)
    clock.setTimeout = (fn, ms) => { delays.push(ms); return set(fn, ms) }
    const game = new Game({ storage: memStorage(), clock, rng: seededRng(4), hour: 14 })
    const idle = () => delays.filter((d) => d >= 90000)
    game.armIdle()
    expect(idle()).toEqual([]) // первые 5 сообщений игрока — Алик сам не пишет
    game.S.stats.sent = 5
    let acted = 0
    for (let i = 0; i < 4; i++) {
      const before = game.S.msgs.length
      clock.runTimers()
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
      if (game.S.msgs.length > before || game.notif) acted++
      if (i === 0) game.armIdle()
    }
    expect(acted).toBeGreaterThan(0)
    expect(idle().length).toBe(2) // две попытки, потом ждёт игрока
    expect(Math.min(...idle())).toBeGreaterThanOrEqual(90000)
    game.dispose()
  })
  it('status «печатает…» и прочие статусы меняются сами', () => {
    const clock = manualClock()
    const game = new Game({ storage: memStorage(), clock, rng: seededRng(4), hour: 3 })
    expect(game.status.text).toMatch(/был\(а\) в 03:/)
    game.dispose()
  })
})

describe('Game: сохранение', () => {
  it('перезагрузка продолжает игру и помнит показанные реплики', async () => {
    const storage = memStorage()
    const { game } = makeGame({ storage, seed: 8 })
    for (let i = 0; i < 15; i++) { game.S.offlineDays = 0; await game.send(game.choices[0]) ; if (game.dead) await game.charge() }
    const texts = alikTexts(game.S.msgs)
    const again = new Game({ storage, clock: manualClock(), rng: seededRng(8), noTimers: true, hour: 14 })
    expect(again.S.stats.sent).toBe(game.S.stats.sent)
    for (let i = 0; i < 15; i++) { again.S.offlineDays = 0; await again.send(again.choices[0]); if (again.dead) await again.charge() }
    const newTexts = alikTexts(again.S.msgs).slice(texts.length)
    for (const t of newTexts) if (!/^\*|\*$|автозамена|Телефон новый|^Не «/.test(t)) expect(texts).not.toContain(t)
  })
  it('сброс удаляет сохранение и больше не пишет его', () => {
    const { game, storage } = makeGame()
    game.save()
    expect(storage.data[SAVE_KEY]).toBeDefined()
    game.reset()
    game.save()
    expect(storage.data[SAVE_KEY]).toBeUndefined()
  })
  it('без storage игра работает', async () => {
    const game = new Game({ storage: null, clock: manualClock(), rng: seededRng(1), noTimers: true })
    await game.send('Алик, привет')
    expect(game.S.stats.sent).toBe(1)
  })
})

describe('Game: сцены целиком', () => {
  it('каждый узел каждой сцены проходится без ошибок', async () => {
    const { game } = makeGame({ seed: 11 })
    let visited = 0
    for (const [sid, sc] of Object.entries(game.scenes)) {
      for (const nid of Object.keys(sc.nodes)) {
        game.S.scene = null
        game.S.offlineDays = 0
        await game.enterNode(sid, sc.start) // инициализировать переменные сцены
        await game.enterNode(sid, nid)
        visited++
        if (game.S.scene) {
          const cs = game.buildChoices()
          expect(cs.length, `${sid}.${nid}`).toBeGreaterThan(0)
          for (const c of cs) expect(c.text, `${sid}.${nid}`).toMatch(/\S/)
        }
      }
    }
    expect(visited).toBeGreaterThan(80)
    expect(JSON.stringify(game.S.msgs)).not.toMatch(/undefined|NaN/)
  })
  it('выбор в сцене ведёт по ветке; «null» закрывает сцену', async () => {
    const { game } = makeGame({ seed: 2 })
    await game.enterNode('toast', 'ask')
    const mom = game.buildChoices().find((c) => c.go === 'mom')!
    await game.send(mom)
    expect(game.S.ach.toast).toBeDefined()
    expect(game.S.scene).toBeNull()
  })
  it('акт взаимозачёта уменьшает долг ровно на сумму акта', async () => {
    const { game } = makeGame({ seed: 2 })
    const debt = game.S.debt
    await game.enterNode('invoice', 'ask')
    const doc = game.S.msgs.findLast((m) => m.kind === 'doc')!
    expect(doc.kind === 'doc' && debt - game.S.debt).toBe(doc.kind === 'doc' ? doc.total : -1)
  })
})

describe('Game: сериалы', () => {
  it('каждый сериал проигрывается до конца и даёт ачивку', async () => {
    const { game } = makeGame({ seed: 6 })
    for (const [id, a] of Object.entries(ARCS)) {
      for (let i = 0; i < a.eps.length; i++) await game.playArc(id)
      expect(game.S.arcs[id].i).toBe(a.eps.length)
      expect(game.S.ach[a.eps[a.eps.length - 1].fx!.ach!]).toBeDefined()
    }
    expect(game.availableArcs()).toEqual([])
  })
  it('поздние сериалы не начинаются раньше своего дня; серия не чаще раза в 6 дней', () => {
    const { game } = makeGame()
    expect(game.availableArcs()).not.toContain('alik_death')
    game.S.day = 300
    expect(game.availableArcs()).toContain('alik_death')
    game.S.arcs.boris = { i: 1, last: 298 }
    expect(game.availableArcs()).not.toContain('boris')
  })
})

describe('Game: мелочи', () => {
  it('эскалация отмазок объявляется в чате', () => {
    const { game } = makeGame()
    game.nextDay(70)
    expect(game.S.tier).toBe(1)
    expect(game.S.msgs.some((m) => m.kind === 'sys' && /международный/.test(m.text))).toBe(true)
  })
  it('правка обещания меняет срок и в журнале', async () => {
    const { game } = makeGame()
    const m = game.push({ kind: 'text', from: 'alik', text: 'В среду утром — всё отдам.' })
    game.recordPromise({ text: 'в среду утром — всё отдам', d: 3 })
    await game.editLast(m, { text: 'в среду утром — всё отдам', t: 'в среду утром', d: 3 })
    expect(m.kind === 'text' && m.edited).toBe(true)
    expect(m.kind === 'text' && m.text).not.toMatch(/среду утром/)
    expect(game.S.promises.at(-1)!.due).toBeNull()
  })
  it('«Мууу» появляется и исчезает, звук отключается', () => {
    const clock = manualClock()
    const game = new Game({ storage: memStorage(), clock, rng: seededRng(1), noTimers: true })
    game.moo()
    expect(game.moos).toHaveLength(1)
    clock.runTimers()
    expect(game.moos).toHaveLength(0)
    game.toggleMute()
    expect(game.S.muted).toBe(true)
  })
  it('голосовое: застолье, голос Алика или корова', () => {
    const { game } = makeGame()
    const v = game.push({ kind: 'voice', from: 'alik', len: 12 })
    for (let i = 0; i < 10; i++) game.playVoice(v)
    expect(game.S.stats.moo).toBeGreaterThan(0)
  })
  it('подписка React получает изменения', () => {
    const { game } = makeGame()
    let n = 0
    const off = game.subscribe(() => n++)
    game.sys('x')
    off()
    game.sys('y')
    expect(n).toBe(1)
  })
})
