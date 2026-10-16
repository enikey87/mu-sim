import { describe, it, expect } from 'vitest'
import type { Entry } from './fact-types'
import { makeGame, alikTexts } from '../test/helpers'
import { ARCS } from './arcs'
import { FINALES } from './finales'
import { valueOf } from './fact'
import { Gated, type Criterion } from '../engine/rules'
import { ARC_DONE } from './arcs'
import { grantPaid, houseOnGarik, intro, taxFrozen } from './memkeys'

const lineText = (m: unknown) => (typeof m === 'string' ? m : (m as { t: string }).t)

async function followBefore(id: string, question: string, answers: RegExp, keep: string, mid?: { when: RegExp; has: string }) {
  const { game } = makeGame()
  const pool = () => game.open(ARCS[id].follow)
  const at = () => game.S.arcs[id]?.i ?? 0
  const nextText = () => (ARCS[id].eps[at()]?.m ?? []).map((e) => lineText(valueOf(e))).join('\n')
  let atAnswer = false
  while (at() < ARCS[id].eps.length) {
    const next = nextText()
    const lines = pool()
    const hit = answers.test(next)
    if (!hit) expect(lines, `${id} до «${next.slice(0, 42)}»`).not.toContain(question)
    else expect(lines, id).toContain(question)
    expect(lines, id).toContain(keep)
    if (mid && (hit || mid.when.test(next))) expect(lines, id).toContain(mid.has)
    if (hit) { atAnswer = true; break }
    game.S.day += 5
    await game.playArc(id)
  }
  expect(atAnswer, id).toBe(true)
}

describe('гейты реплик серии до её remember (#450)', () => {
  it('новый акт сообщает об оплате Гранта и заморозке счетов до записи этих фактов', async () => {
    const { game } = makeGame()
    await game.playEpisode(ARCS.grant.eps[0], 'grant')
    expect(game.S.mem[grantPaid]).toBeUndefined()
    expect(game.S.mem[taxFrozen]).toBeUndefined()

    const from = game.S.msgs.length
    await game.playEpisode(ARCS.rubik.eps[7], 'rubik')
    const lines = alikTexts(game.S.msgs.slice(from))
    expect(lines.some((line) => line.includes('Объект сдан, Грант заплатил!'))).toBe(true)
    expect(lines.some((line) => line.includes('Счета заморожены. Деньги есть'))).toBe(true)
    expect(lines.some((line) => line.includes('Теперь и бумага'))).toBe(false)
    expect(game.S.mem[grantPaid]).toBe(true)
    expect(game.S.mem[taxFrozen]).toBe(true)
  })

  it('финал Гарика описывает дом, если тот стоял на нём до освобождения', async () => {
    const { game } = makeGame()
    game.S.mem[houseOnGarik] = true
    const from = game.S.msgs.length
    await game.playEpisode(ARCS.garik.eps[5], 'garik')
    expect(alikTexts(game.S.msgs.slice(from)).some((line) => line.includes('Дом просел на два сантиметра'))).toBe(true)
    expect(game.S.mem[houseOnGarik]).toBe(false)
  })

  it('финал Гарика без дома не выдумывает просадку', async () => {
    const { game } = makeGame()
    const from = game.S.msgs.length
    await game.playEpisode(ARCS.garik.eps[5], 'garik')
    expect(alikTexts(game.S.msgs.slice(from)).some((line) => line.includes('Дом просел'))).toBe(false)
    expect(alikTexts(game.S.msgs.slice(from)).some((line) => line.includes('Гарика достали!'))).toBe(true)
    expect(game.S.mem[houseOnGarik]).toBe(false)
  })

  it('частный финал Гарика помнит дом до освобождения', async () => {
    const { game } = makeGame()
    game.S.mem[houseOnGarik] = true
    const from = game.S.msgs.length
    await game.playFinale('garik', FINALES.garik.find((f) => f.id === 'cutter')!)
    expect(alikTexts(game.S.msgs.slice(from)).some((line) => line.includes('Дом, говорят, просядет'))).toBe(true)
    expect(game.S.mem[houseOnGarik]).toBe(false)
  })

  it('финал Карине вводит Гранта и не теряет её первую реплику', async () => {
    const { game } = makeGame()
    expect(game.S.mem[intro('grant')]).toBeUndefined()
    const from = game.S.msgs.length
    await game.playFinale('rubik', FINALES.rubik.find((f) => f.id === 'karine')!)
    expect(game.S.msgs.slice(from).some((m) => m.kind === 'text' && m.who === 'karine' && m.text.startsWith('Это Карине.'))).toBe(true)
    expect(game.S.mem[intro('grant')]).toBe(true)
  })
})

describe('связка Гарик×бетон (#680)', () => {
  const has = (lines: string[], bit: string) => lines.some((line) => line.includes(bit))

  async function throughGarik(beton: boolean) {
    const { game } = makeGame()
    if (beton) await game.playArc('beton')
    const bits: string[] = []
    for (let i = 0; i < 4; i++) {
      game.S.day += 5
      const from = game.S.msgs.length
      await game.playArc('garik')
      bits.push(...alikTexts(game.S.msgs.slice(from)))
    }
    return bits
  }

  it('розетка в серии 2 раньше блога; «тёплый и шуршит» — только если бетон уже был', async () => {
    const withBeton = await throughGarik(true)
    const socket = withBeton.findIndex((line) => line.includes('розетку'))
    const blog = withBeton.findIndex((line) => line.includes('Жизнь в основании'))
    expect(socket).toBeGreaterThanOrEqual(0)
    expect(blog).toBeGreaterThan(socket)
    expect(has(withBeton, 'тёплый и шуршит')).toBe(true)

    const without = await throughGarik(false)
    expect(has(without, 'розетку')).toBe(true)
    expect(has(without, 'Жизнь в основании')).toBe(true)
    expect(has(without, 'тёплый и шуршит')).toBe(false)
    expect(has(without, 'фундамент тёплый')).toBe(true)
  })

  // негативный контроль: та же строка без gate звучит и без бетона — отсутствие держит гейт
  it('снятый гейт возвращает «тёплый и шуршит» в партии без бетона', async () => {
    const { game } = makeGame()
    const bare = 'Гарик говорит, удобно: тёплый и шуршит.'
    expect(game.open([bare])).toEqual([bare])
    expect(game.open(ARCS.garik.eps[2].m).map((m) => (typeof m === 'string' ? m : m.t))).not.toContain(bare)
  })
})

describe('вопрос «уже случилось?» только перед серией, которая отвечает (#589)', () => {
  it('до развязки кнопки нет; когда следующая серия — она, кнопка есть', async () => {
    await followBefore('garik', 'Гарика достали?', /Гарика достали!/, 'Как там Гарик?', { when: /трубочку/, has: 'Гарик ещё в фундаменте?' })
    await followBefore('rubik', 'Рубик уехал?', /Не уедет/, 'Как там инспектор?')
    await followBefore('rubik', 'Акт подписали?', /подписал акт/, 'Как там инспектор?')
    await followBefore('grant', 'Грант заплатил?', /заплатил|оплачено/, 'Что там заказчик?')
    await followBefore('razmik', 'Размик слез?', /Размик слез!/, 'Как там Размик?', { when: /лаваш/, has: 'Размик ещё на кране?' })
    await followBefore('niva', '«Нива» нашлась?', /«Нива» вернулась!/, 'Есть новости про «Ниву»?', { when: /Гюмри/, has: 'Где «Нива»?' })
    // контрольная строка — без ворот: «Как там свадьба?» с #831 требует объявленной свадьбы (первую серию)
    await followBefore('samvel', 'Самвел ещё женится?', /Самвел женится снова/, 'Тамада гуляет, а плачу я?')
  })
})

describe('вопрос про развязку Самвела — только перед серией, которая отвечает (#604)', () => {
  const at = () => [0, 1, 2, 3, 4, 5, 6, 7]

  it('до серии «Самвел женится снова» кнопки нет; перед ней — есть', async () => {
    const { game } = makeGame()
    for (const i of at()) {
      const lines = game.open(ARCS.samvel.follow)
      expect(lines, `серия ${i}`).toContain('Тамада гуляет, а плачу я?')
      if (i === 7) expect(lines, 'перед развязкой').toContain('Самвел ещё женится?')
      else expect(lines, `до развязки, серия ${i}`).not.toContain('Самвел ещё женится?')
      game.S.day += 5
      await game.playArc('samvel')
    }
    // после развязки вопроса тоже нет — он отвечен
    expect(game.open(ARCS.samvel.follow)).not.toContain('Самвел ещё женится?')
  })

  // негативный контроль: та же строка без gate открыта на любой серии — значит, кнопку убирает именно гейт
  it('снятие номера серии возвращает кнопку: строка без gate видна и до развязки', async () => {
    const { game } = makeGame()
    const bare = [...ARCS.samvel.follow.slice(0, 3), 'Самвел ещё женится?'] as Entry<string>[]
    for (let i = 0; i < 5; i++) {
      expect(game.open(bare), `серия ${i}`).toContain('Самвел ещё женится?')
      game.S.day += 5
      await game.playArc('samvel')
    }
  })
})

describe('плитка с5 — реестр памятников без гейта на Гранта (#682)', () => {
  it('серия видна и без Гранта в истории, Грант в тексте не упоминается', async () => {
    const { game } = makeGame()
    expect(game.S.mem[intro('grant')], 'Гранта ещё нет в истории').toBeUndefined()
    const from = game.S.msgs.length
    await game.playEpisode(ARCS.tile.eps[4], 'tile')
    const lines = alikTexts(game.S.msgs.slice(from))
    expect(lines.some((l) => l.includes('Твою плитку внесли в реестр памятников')), 'серия прозвучала').toBe(true)
    expect(lines.some((l) => l.includes('Грант')), 'о Гранте не говорится').toBe(false)
  })
})

describe('панч серии по факту другой арки (#681)', () => {
  const insert = 'Ту самую — что тряпочку с арматурины унесла.'

  it('вставка про козу тёти Гоар звучит, когда в сериале про деньги в фундаменте была вторая серия', async () => {
    const { game } = makeGame()
    game.S.arcs.beton = { i: 2, last: 0 } // две серии фундамента позади — факт, не номер хода
    const from = game.S.msgs.length
    await game.playEpisode(ARCS.boris.eps[4], 'boris')
    expect(alikTexts(game.S.msgs.slice(from))).toContain(insert)
  })

  it('в партии без второй серии фундамента вставки нет', async () => {
    const { game } = makeGame()
    const from = game.S.msgs.length
    await game.playEpisode(ARCS.boris.eps[4], 'boris')
    expect(alikTexts(game.S.msgs.slice(from))).not.toContain(insert)
  })

  // негативный контроль: тот же факт открыт на любой серии Бориса — значит, вставку держит именно гейт
  it('без гейта вставка звучала бы и без серий фундамента', async () => {
    const { game } = makeGame()
    const bare = [...ARCS.boris.eps[4].m, insert] as Entry<string>[]
    const from = game.S.msgs.length
    await game.playEpisode({ ...ARCS.boris.eps[4], m: bare }, 'boris')
    expect(alikTexts(game.S.msgs.slice(from))).toContain(insert)
  })
})

describe('follow-строки оперируют только введёнными фактами (#813)', () => {
  /** Числа строки без разделителей: «8 000» → 8000. */
  const numbers = (t: string): string[] => (t.match(/\d[\d\s\u00A0]*\d|\d/g) ?? []).map((n) => n.replace(/[\s\u00A0]/g, ''))
  /** Сказанные строки значения — как `saidLines` из #783: реплики, sys, предмет, done. */
  const said = (v: unknown, out: string[] = []): string[] => {
    if (typeof v === 'string') { out.push(v); return out }
    if (Array.isArray(v)) { for (const x of v) said(x, out); return out }
    if (v && typeof v === 'object') {
      const line = valueOf(v as Entry<string>)
      if (typeof line === 'string') out.push(line)
      else if (line !== v) said(line, out)
      else if (typeof (v as { t?: unknown }).t === 'string') out.push((v as { t: string }).t)
      for (const k of ['m', 'sys', 'item', 'done'] as const) { const x = (v as Record<string, unknown>)[k]; if (x !== undefined) said(x, out) }
    }
    return out
  }
  const flat = (cs: readonly Criterion[]): Criterion[] => cs.flatMap((c) => (c.op === 'all' ? flat(c.all ?? []) : [c]))
  /** Числа, известные игроку вне сериала: 50 ₽ — обычный перевод Алика (`nextTransfer`), он в партии с первого дня. */
  const GAME_WIDE = ['50']
  /** Что партия успела сказать к состоянию ворот строки: серии по воротам; финал — только если ворота его называют. */
  const introduced = (id: string, when: readonly Criterion[]): string[] => {
    const arc = ARCS[id]
    const out: string[] = []
    const cs = flat(when)
    // серии этого сериала — всегда: вопрос задают, пока сериал идёт
    for (const ep of arc.eps) out.push(...said(ep))
    // ворота называют другую серию или её номер: добираем её серии
    for (const c of cs) {
      const key = String(c.key)
      if (!key.startsWith('arc.') || c.op === '!exist') continue
      const arcId = key.slice(4)
      if (arcId === 'done' || arcId === id) continue
      const n = Number(c.value)
      const eps = (c.op === '==' || c.op === '<=') && Number.isFinite(n) ? (ARCS[arcId]?.eps ?? []).slice(0, n + 1) : ARCS[arcId]?.eps ?? []
      for (const ep of eps) out.push(...said(ep))
    }
    // финал: свои реплики — только под воротами о финале (иначе его в партии ещё не было)
    for (const c of cs) {
      const key = String(c.key)
      if (!key.startsWith('finale.')) continue
      const arcId = key.slice(7)
      if (arcId !== id) continue
      const wanted = c.op === '==' ? String(c.value) : undefined
      for (const f of FINALES[id] ?? []) if (!wanted || f.id === wanted) out.push(...said(f), ...said(ARC_DONE[id] ?? []))
    }
    return out
  }
  it('слова-отсылки на легенды звучат только когда легенда играла (#821)', () => {
    // слово → чем партия его вводит: услышанное игроком утверждение о деньгах (шаг #813 — числа, шаг #821 — слова)
    const LEGEND_WORDS: Array<[string, RegExp, string[]]> = [
      ['фундамент', /фундамент/i, ['heard.money_foundation']],
      ['сейф', /сейф/i, ['heard.money_safe']],
      ['крипта', /крипт|коин/i, ['heard.money_crypto', 'ach.q_crypto', 'crypto.hodl']],
    ]
    const bad: string[] = []
    let checked = 0
    for (const [id, a] of Object.entries(ARCS)) {
      for (const e of a.follow) {
        const t = valueOf(e)
        const when = e instanceof Gated ? flat(e.when) : []
        for (const [word, re, markers] of LEGEND_WORDS) {
          if (!re.test(t)) continue
          checked++
          const named = markers.some((m) => when.some((c) => String(c.key) === m))
          const inCorpus = introduced(id, when).join(' ').toLowerCase().includes(word)
          if (!named && !inCorpus) bad.push(`${id}: «${t}» говорит про ${word}, а ворота не знают этой легенды`)
        }
      }
    }
    expect(checked, 'слов-отсылок не стало — проверка пустеет').toBeGreaterThanOrEqual(5)
    expect(bad).toEqual([])
  })
  it('слова-факты follow-строки названы сериями, пройденными к вопросу (#824)', () => {
    // словарь: слово → сериал и число пройденных серий, после которых слово прозвучало (#813 числа, #821 легенды, #824 факты)
    // inArc — слово принадлежит этому сериалу: чужой «акт» Нуне или чужое «завещание» Алика проверяются своими воротами
    const FACT_WORDS: Array<{ re: RegExp; arc: string; from: number; inArc?: string; facts?: string[]; why: string }> = [
      { re: /завещани|наследств/i, arc: 'grandpa', from: 4, inArc: 'grandpa', why: 'завещание и раскладку называет 4-я серия grandpa' },
      { re: /хоспис|шаурмичн/i, arc: 'grandpa', from: 6, inArc: 'grandpa', why: 'хоспис и шаурмичная — последняя серия grandpa' },
      { re: /штраф/i, arc: 'rubik', from: 3, inArc: 'rubik', why: '«штраф» Рубик произносит в 3-й серии' },
      { re: /(?<![а-яё])акт/i, arc: 'rubik', from: 7, inArc: 'rubik', why: 'акт обсуждают в 7-й серии rubik' },
      { re: /замороз|размороз/i, arc: 'rubik', from: 8, inArc: 'rubik', facts: [taxFrozen], why: 'заморозку называют 8-я серия rubik и факт tax.frozen' },
      { re: /к вдове|вдове/i, arc: 'alik_death', from: 5, inArc: 'alik_death', why: 'вдову называет 5-я серия alik_death («Самвел сделал предложение вдове»)' },
      // события (пункты 1–2 #831): не только числа и слова-факты, но и названия событий
      { re: /свадьб/i, arc: 'samvel', from: 1, inArc: 'samvel', why: 'свадьбу Самвела объявляет 1-я серия samvel' },
      { re: /поминк|похорн|похорон/i, arc: 'alik_death', from: 1, inArc: 'alik_death', why: 'свои похороны и поминки Алик вводит 1-й серией alik_death' },
    ]
    const bad: string[] = []
    let checked = 0
    for (const [id, a] of Object.entries(ARCS)) {
      for (const e of a.follow) {
        const t = valueOf(e)
        const when = e instanceof Gated ? flat(e.when) : []
        for (const w of FACT_WORDS) {
          if (w.inArc && w.inArc !== id) continue
          if (!w.re.test(t)) continue
          checked++
          const byArc = when.some((c) => String(c.key) === `arc.${w.arc}` && ['>=', '=='].includes(c.op) && Number(c.value) >= w.from)
          const byFact = (w.facts ?? []).some((k) => when.some((c) => String(c.key) === k))
          if (!byArc && !byFact) bad.push(`${id}: «${t}» — ${w.why}, а ворота этого не требуют`)
        }
      }
    }
    expect(checked, 'слов-фактов не стало — проверка пустеет').toBeGreaterThanOrEqual(5)
    expect(bad).toEqual([])
  })

  it('каждое число follow-строки названо серией или финалом, доступным её воротам', () => {
    const bad: string[] = []
    let checked = 0
    for (const [id, a] of Object.entries(ARCS)) {
      for (const e of a.follow) {
        const t = valueOf(e)
        const nums = numbers(t)
        if (!nums.length) continue
        checked++
        const corpus = introduced(id, e instanceof Gated ? e.when : []).join(' ').replace(/[\s\u00A0]/g, '')
        for (const n of nums) if (!corpus.includes(n) && !GAME_WIDE.includes(n)) bad.push(`${id}: «${t}» называет ${n} — партия к этим воротам её не вводила`)
      }
    }
    expect(checked, 'чисел в follow-строках не стало — проверка пустеет').toBeGreaterThanOrEqual(8)
    expect(bad).toEqual([])
  })
})
