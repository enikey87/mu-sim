// Ответ Алика на кнопку срока, которую нажал игрок (docs/design/deadline-replies.md, MVP 3, #165): у каждой кнопки свой ответ, ни один не противоречит нажатому.
import { describe, it, expect, vi } from 'vitest'
import { makeGame, alikTexts } from '../test/helpers'
import { D, cap, WHEN_YEARS, type When } from './excuses'
import { LEGENDS } from './legends'
import { PROMISE_NEVER, PROMISE_PENCIL, PROMISE_FAR, PROMISE_YEARS, WHEN_COND, KONAK_LINE } from './misc'
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
    Array.from({ length: draws }, () => r.offer!(g.rules.ctx(g, r, { event: 'BuildChoices' }, g.facts()))).flatMap((c) => (c ? [{ rule: r.name, act: c.act!, arg: c.arg, text: c.text }] : [])))
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
    expect(PROMISE_NEVER.map(valueOf).join('\n')).not.toMatch(/лет двадцать/i)
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
        if (rule === 'Opt_When_never' || rule === 'Opt_When_absurd') {
          const isYears = text === PROMISE_YEARS
          expect([isNever || isYears, isPencil, isFar, isCond], at).toEqual([true, false, false, false])
          expect(isNever && isYears, `${at}: ответ «лет двадцать» не из общего пула`).toBe(false)
        }
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

  it('число дней в ответе на горизонт — из факта, со склонением: каждая фраза с {days} называет «100 дней»', async () => {
    let withDays = 0
    for (let seed = 1; seed <= 20; seed++) {
      const { said: text, vars } = await pressed({ t: 'через сто дней', d: 100, kind: 'clear' }, 'Opt_WhenFar', undefined, seed)
      expect(vars.days).toBe('100 дней')
      expect(text, text).not.toMatch(/\{/)
      const line = PROMISE_FAR.find((l) => text.toLowerCase().includes(chunk(l)))
      expect(line, text).toBeDefined()
      if (line!.includes('{days}')) { withDays++; expect(text, text).toContain('100 дней') }
    }
    expect(withDays, 'ни одной фразы с числом дней за 20 партий — проверка пустеет').toBeGreaterThan(0)
  })
})

describe('«Лет двадцать?» — пара со своим ответом', () => {
  /** Алик называет сравнение с коньяком настоящим путём: игрок жмёт кнопку «никогда», пока ирония не выпадет (#918). */
  const konak = async (g: Game): Promise<void> => {
    const fresh = () => { g.S.ctx = g.ctxFromPromise({ ...byText('после таможни'), text: 'после таможни — отдам' }) }
    for (let i = 0; i < 80; i++) {
      if (!g.S.ctx) fresh()
      g.S.choices = null
      const c = g.choices.find((x) => x.act === 'promiseNever')
      if (!c) { fresh(); continue }
      const n = g.S.msgs.length
      await g.send(c)
      if (alikTexts(g.S.msgs.slice(n)).join(' ').includes(KONAK_LINE)) { fresh(); return }
      fresh()
    }
    expect.fail('Алик не сравнил срок с коньяком за 80 кнопок')
  }

  it('никогда-эхо отвечает из своего пула, а не про двадцать лет; arg идёт за текстом (#1022)', async () => {
    const g = await said(byText('после таможни'))
    // сравнение с коньяком уже звучало (настоящим путём его доводит тест выше): пул открыт целиком
    g.S.mem['said.konak'] = true
    // кнопки берём у самих правил: окно повтора и добор незасвеченного — часть `playerLine`, и именно
    // оно ставило флаг «это «Лет двадцать?»» по промежуточной карте колоды (#1022)
    const shown = buttons(g, 12).filter((b) => b.act === 'promiseNever')
    expect(shown.length, 'кнопок «никогда» нет — проверка пустеет').toBeGreaterThan(3)
    for (const b of shown) {
      expect(b.arg === 'years', `«${b.text}» → arg ${String(b.arg)}`).toBe(/лет двадцать\?/i.test(b.text))
    }
    const echo = shown.find((b) => !/лет двадцать\?/i.test(b.text))!
    expect(echo, 'никогда-эха в пуле нет — проверка пустеет').toBeDefined()
    const n = g.S.msgs.length
    await g.send({ text: echo.text, tone: 'neutral', act: 'promiseNever', arg: echo.arg ?? undefined })
    const answer = alikTexts(g.S.msgs.slice(n)).join(' ')
    expect(answer, 'на никогда-эхо ответили про двадцать лет').not.toContain('Двадцать лет')
    expect(from(PROMISE_NEVER, answer), answer).toBe(true)
  })

  it('кнопка ждёт сравнение с коньяком, зовёт колкий ответ, а соседняя ирония — общий пул', async () => {
    const g = await said(byText('после таможни'))
    expect(g.open(D.P_WHEN_NEVER), 'без сравнения с коньяком эхо осиротело бы').not.toContain(WHEN_YEARS)
    // соседняя ирония — из пула и до коньяка: пока колода не разобрана, кнопка находится всегда
    let other = undefined as ReturnType<Game['buildChoices']>[number] | undefined
    for (let i = 0; i < 80 && !other; i++) {
      g.S.choices = null
      for (const c of g.buildChoices()) if (c.act === 'promiseNever' && !/лет двадцать\?/i.test(c.text)) other = c
    }
    expect(other, 'кроме «Лет двадцать?» в пуле ничего нет').toBeDefined()
    await konak(g)
    expect(g.open(D.P_WHEN_NEVER), 'после сравнения с коньяком эхо вернулось').toContain(WHEN_YEARS)
    let years = undefined as ReturnType<Game['buildChoices']>[number] | undefined
    for (let i = 0; i < 80 && !years; i++) {
      g.S.choices = null
      for (const c of g.buildChoices()) if (c.act === 'promiseNever' && /лет двадцать\?/i.test(c.text)) years = c
    }
    expect(years, 'кнопки «Лет двадцать?» нет').toBeDefined()
    expect(years!.arg).toBe('years')
    const n = g.S.msgs.length
    await g.send(years!)
    const lines = alikTexts(g.S.msgs.slice(n))
    expect(lines[0], 'первый ответ на кнопку — колкая строка').toBe(PROMISE_YEARS)
    const sharp = lines.join(' ')
    expect(sharp, 'тычка игроку в ответе нет (#918)').not.toMatch(/Ты — нет/)
    expect(from(PROMISE_NEVER, sharp)).toBe(false)
    expect(g.mem()['when.years'], 'факт «уже спросил»').toBe(true)
    expect(g.open(D.P_WHEN_NEVER), 'факт закрывает строку').not.toContain(WHEN_YEARS)
    g.S.ctx = g.ctxFromPromise({ ...byText('после таможни'), text: 'после таможни — отдам' })
    const m = g.S.msgs.length
    await g.send(other!)
    const plain = alikTexts(g.S.msgs.slice(m)).join(' ')
    expect(plain).not.toBe(PROMISE_YEARS)
    expect(from(PROMISE_NEVER, plain), plain).toBe(true)
  })
})

describe('игрок нажимает кнопку настоящим ходом', () => {
  it('срок каждого рода → кнопка из выбора → send → ответ по той же кнопке', async () => {
    const cases: Array<[string, string, (t: string) => boolean]> = [
      ['завтра', 'promiseOk', (t) => from(D.PROMISE_OK, t)],
      ['после полнолуния', 'promisePencil', (t) => from(PROMISE_PENCIL, t)],
      ['до Нового года', 'promiseFar', (t) => from(PROMISE_FAR, t)],
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

describe('плавающий событийный срок (#1002)', () => {
  it('«как дядя Самвел проснётся» — плавающий ответ, без never-эха', async () => {
    const term = 'как дядя Самвел проснётся'
    const g = await said(byText(term))
    const b = buttons(g, 6)
    expect(b.some((x) => x.rule === 'Opt_When_Floating'), 'плавающей кнопки нет').toBe(true)
    expect(b.some((x) => x.rule === 'Opt_When_never' || x.rule === 'Opt_When_absurd'), 'never-эхо на плавающем сроке').toBe(false)
    expect(buttons(g, 1).find((x) => x.rule === 'Opt_When_Floating')!.text).toMatch(/Вот это хотя бы срок|Плавающий|не «никогда»|живое после/)
  })

  it('тексты задачи в плавающем пуле', () => {
    const pool = D.P_WHEN_FLOATING.map(valueOf)
    expect(pool).toContain('Вот это хотя бы срок. Разбудить его можно?')
    expect(pool).toContain('Событие есть, даты нет. Удобный у вас календарь, Алик.')
    // возврат водной метафоры без референта — красный (#1115)
    expect(pool, 'читатель снова спотыкается о «доплывёт»').not.toContain('Плавающий. Значит, доплывёт.')
  })

  it('«когда Арарат вернут» — абсурд, never-эхо как было; плавающей кнопки нет', async () => {
    const g = await said(byText('когда Арарат вернут'))
    const b = buttons(g, 6)
    expect(b.some((x) => x.rule === 'Opt_When_absurd' || x.rule === 'Opt_When_never'), 'абсурдному сроку не дали эха').toBe(true)
    expect(b.some((x) => x.rule === 'Opt_When_Floating'), 'плавающая кнопка на абсурде').toBe(false)
  })

  it('ответ Алика на плавающий срок — про событие, а не про дату', async () => {
    const term = 'как дядя Самвел проснётся'
    const { said: answer } = await pressed(byText(term), 'Opt_When_Floating')
    const expected = WHEN_COND.map(valueOf).map((t) => t.replace('{t}', term).replace('{T}', cap(term)))
    expect(expected.some((t) => answer.includes(t)), `ответ не из WHEN_COND: ${answer}`).toBe(true)
  })
})
