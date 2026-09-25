// Ответ Алика на кнопку срока, которую нажал игрок (docs/design/deadline-replies.md, MVP 3, #165): у каждой кнопки свой ответ, ни один не противоречит нажатому.
import { describe, it, expect, vi } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import { D, cap, type When } from './excuses'
import { LEGENDS } from './legends'
import { PROMISE_NEVER, PROMISE_PENCIL, PROMISE_FAR, WHEN_COND } from './misc'
import { valueOf, test as holds, type Entry } from '../engine/rules'
import { fmtDays } from '../engine/time'
import type { Game } from '../engine/game'

const POOLS = ['WHEN', 'WHEN1', 'WHEN2', 'WHEN3'] as const
const terms = (): Array<[string, When]> => [
  ...POOLS.flatMap((k) => (D[k] as Entry<When>[]).map((e): [string, When] => [`D.${k}`, valueOf(e)])),
  ...Object.entries(LEGENDS).map(([id, l]): [string, When] => [`LEGENDS.${id}`, l.until]),
]
const byText = (t: string): When => terms().map(([, w]) => w).find((w) => w.t === t)!

/** Алик называет срок `w` настоящим путём клятвы. */
async function said(w: When, before?: (g: Game) => void, seed = 1): Promise<Game> {
  const { game } = makeGame({ seed })
  vi.spyOn(game.X, 'promise').mockImplementation(() => ({ text: `${w.t} — отдам`, ...w }))
  before?.(game)
  await game.promiseLine()
  return game
}

/** Кнопки срока, которые правила могут предложить на этой доске (несколько розыгрышей каждого правила). */
const buttons = (g: Game, draws = 3) => {
  const facts = g.lineFacts()
  return g.rules.all.filter((r) => r.event === 'BuildChoices' && r.name.startsWith('Opt_When') && r.when.every((c) => holds(c, facts))).flatMap((r) =>
    Array.from({ length: draws }, () => r.offer!(g.rules.ctx(g, r, { event: 'BuildChoices' }, g.facts()))).flatMap((c) => (c ? [{ rule: r.name, act: c.act!, arg: c.arg }] : [])))
}

/** Игрок нажал кнопку: что ответил Алик. */
async function pressed(w: When, rule: string, before?: (g: Game) => void, seed = 1): Promise<{ game: Game; said: string; vars: Record<string, string> }> {
  const game = await said(w, before, seed)
  const b = buttons(game, 1).find((x) => x.rule === rule)
  expect(b, `у «${w.t}» нет кнопки ${rule}`).toBeDefined()
  const vars = { t: w.t, T: cap(w.t), days: fmtDays(Number(game.facts()['ctx.whenDays'] ?? 0)) }
  const n = game.S.msgs.length
  await game.fire('PlayerSays', { intent: b!.act, arg: b!.arg })
  return { game, said: alikTexts(game.S.msgs.slice(n)).join(' '), vars }
}

// у ответа может быть обращение впереди и другая первая буква — ищем самый длинный кусок шаблона без подстановок
const chunk = (line: string): string => line.split(/\{\w+\}/).map((s) => s.replace(/^[\s.,!?…—«»]+|[\s.,!?…—«»]+$/g, '')).sort((a, b) => b.length - a.length)[0].toLowerCase()
const from = (pool: readonly Entry<string>[], text: string): boolean => pool.map(valueOf).some((line) => text.toLowerCase().includes(chunk(line)))
const OK = (D.PROMISE_OK as Entry<string>[]).map(valueOf)

describe('пулы ответов', () => {
  it('ответы на карандаш, горизонт и иронию не звучат согласием «не подведу»', () => {
    for (const [name, pool] of [['PROMISE_PENCIL', PROMISE_PENCIL], ['PROMISE_FAR', PROMISE_FAR], ['PROMISE_NEVER', PROMISE_NEVER]] as const) {
      expect(pool.map(valueOf).length, name).toBeGreaterThanOrEqual(6)
      for (const s of pool.map(valueOf)) {
        expect(s, `${name}: ${s}`).not.toMatch(/Не подведу|договорились|Жди\b|Записывай, записывай|Главное — верить/)
        for (const ok of OK) expect(s, `${name}: ${s}`).not.toBe(ok)
      }
    }
  })

  it('ответ на карандаш — про карандаш; в ответах на горизонт и иронию только известные подстановки', () => {
    for (const s of PROMISE_PENCIL) expect(s, s).toMatch(/[Кк]арандаш|[Пп]иши|мелом|песке/)
    for (const pool of [PROMISE_PENCIL, PROMISE_FAR, PROMISE_NEVER]) for (const s of pool.map(valueOf)) for (const m of s.matchAll(/\{(\w+)\}/g)) expect(['t', 'T', 'days'], s).toContain(m[1])
    expect(PROMISE_FAR.some((s) => s.includes('{days}'))).toBe(true)
  })

  it('ирония «никогда» получает ответ в образе: «Никогда — это тоже срок»', () => {
    expect(PROMISE_NEVER.map(valueOf)).toContain('Никогда — это тоже срок, брат. Самый надёжный.')
  })
})

describe('матрица: каждая кнопка каждого срока → ответ Алика', () => {
  it('согласие — «не подведу», карандаш — про карандаш, горизонт — защита срока, ирония — в образе, вопрос — клятва или про событие; чужой пул не звучит', async () => {
    const kinds = new Set<string>()
    let pressedCount = 0
    for (const [where, w] of terms()) {
      for (const rule of [...new Set(buttons(await said(w)).map((b) => b.rule))]) {
        const { said: text, game } = await pressed(w, rule)
        const at = `${where}: «${w.t}» → ${rule}: ${text}`
        pressedCount++
        const isOk = from(D.PROMISE_OK, text)
        const isPencil = from(PROMISE_PENCIL, text)
        const isFar = from(PROMISE_FAR, text)
        const isNever = from(PROMISE_NEVER, text)
        const isCond = from(WHEN_COND, text)
        expect(text.length, `${at}: молчание`).toBeGreaterThan(0)
        if (rule === 'Opt_WhenOk') expect([isOk, isPencil, isFar, isNever], at).toEqual([true, false, false, false])
        else expect(isOk, `${at}: «не подведу» на кнопку, которая не согласие`).toBe(false)
        if (rule === 'Opt_WhenPencil') expect([isPencil, isFar, isNever, isCond], at).toEqual([true, false, false, false])
        if (rule === 'Opt_WhenFar') expect([isFar, isPencil, isNever, isCond], at).toEqual([true, false, false, false])
        if (rule === 'Opt_When_never' || rule === 'Opt_When_absurd') expect([isNever, isPencil, isFar, isCond], at).toEqual([true, false, false, false])
        if (rule === 'Opt_WhenCheck') {
          // событие — про само событие, остальные — клятва с тем же сроком
          if (w.kind === 'event') expect([isCond, isNever, isPencil, isFar], at).toEqual([true, false, false, false])
          else {
            expect([isCond, isNever, isPencil, isFar], at).toEqual([false, false, false, false])
            expect(text.toLowerCase(), at).toContain(w.t.toLowerCase())
          }
        }
        // ответ снимает контекст: на одно предложение срока — один ответ
        expect(game.S.ctx, at).toBeNull()
        kinds.add(`${w.kind}:${rule}`)
      }
    }
    expect(pressedCount, 'нажатий в матрице меньше известных — проверка пустеет').toBeGreaterThanOrEqual(100)
    expect([...kinds].some((k) => k.startsWith('event:Opt_WhenCheck'))).toBe(true)
    expect([...kinds].some((k) => k.startsWith('clear:Opt_WhenCheck'))).toBe(true)
  })

  it('«Точно?» на праздник в пределах недели — клятва с тем же сроком, а не «это событие»', async () => {
    const navasard = byText('после Навасарда')
    const day = Math.round((Date.UTC(2027, 7, 11) - Date.UTC(2026, 2, 18)) / 864e5) - 3 // Навасард через три дня
    const { game, said: text } = await pressed(navasard, 'Opt_WhenCheck', (g) => { g.S.day = day })
    expect(game.facts()['ctx.whenKind']).toBeUndefined() // ответ снял контекст
    expect(from(WHEN_COND, text)).toBe(false)
    expect(text.toLowerCase()).toContain(navasard.t.toLowerCase())
  })

  it('число дней в ответе на горизонт — из факта, со склонением: каждая фраза с {days} называет «540 дней»', async () => {
    let withDays = 0
    for (let seed = 1; seed <= 20; seed++) {
      const { said: text, vars } = await pressed(byText('как Нуне из декрета выйдет'), 'Opt_WhenFar', undefined, seed)
      expect(vars.days).toBe('540 дней')
      expect(text, text).not.toMatch(/\{/)
      const line = PROMISE_FAR.find((l) => text.toLowerCase().includes(chunk(l)))
      expect(line, text).toBeDefined()
      if (line!.includes('{days}')) { withDays++; expect(text, text).toContain('540 дней') }
    }
    expect(withDays, 'ни одной фразы с числом дней за 20 партий — проверка пустеет').toBeGreaterThan(0)
  })
})

describe('игрок нажимает кнопку настоящим ходом', () => {
  it('срок каждого рода → кнопка из выбора → send → ответ по той же кнопке', async () => {
    const cases: Array<[string, string, (t: string) => boolean]> = [
      ['завтра', 'promiseOk', (t) => from(D.PROMISE_OK, t)],
      ['как заказчик заплатит', 'promisePencil', (t) => from(PROMISE_PENCIL, t)],
      ['как Нуне из декрета выйдет', 'promiseFar', (t) => from(PROMISE_FAR, t)],
      ['когда рак на Арагаце свистнет', 'promiseNever', (t) => from(PROMISE_NEVER, t)],
    ]
    for (const [term, act, ok] of cases) {
      const g = await said(byText(term))
      let choice = undefined as ReturnType<Game['buildChoices']>[number] | undefined
      for (let i = 0; i < 80 && !choice; i++) {
        g.S.choices = null
        choice = g.buildChoices().find((c) => c.act === act)
        if (!choice) g.S.ctx = g.ctxFromPromise({ ...byText(term), text: `${term} — отдам` })
      }
      expect(choice, `${term}: нет кнопки ${act}`).toBeDefined()
      const n = g.S.msgs.length
      await g.send(choice!)
      const text = alikTexts(g.S.msgs.slice(n)).join(' ')
      expect(ok(text), `${term} → ${act}: ${text}`).toBe(true)
    }
  })
})
