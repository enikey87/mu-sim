// Целостность контента: ссылки сцен, ачивки, словари, генератор отмазок.
import { describe, it, expect } from 'vitest'
import { make, D } from './excuses'
import { LEGENDS } from './legends'
import { makeGame } from '../test/helpers'
import { makeScenes, type Line } from './scenes'
import { ARCS, ARC_DONE, CAST, GROUP } from './arcs'
import { ACH } from './achievements'
import { FINALES, ENDINGS } from './finales'
import { P_MONEY } from './topics'
import { P_INTERN, P_MAMA_VOICE, P_DEBUT_ARSEN } from './rules/player-choice-pools'
import { ASK_ROOM } from './money-ask'
import { P_CREW_PAID } from './crew'
import * as L from './life'
import { allRules } from './rules'
import { Decks } from '../engine/deck'
import { seededRng } from '../engine/rng'
import { Gated, valueOf, type Entry } from '../engine/rules'
import { saidText } from './fact'

describe('живая рецензия №1: точечные правки (#891)', () => {
  it('старые строки ушли из исходников', () => {
    for (const line of ['Долг Гарика под домом', 'Мой вопрос рассматривает ООН', 'мы философствуем', 'просто достать Гарика']) {
      expect(allSource, line).not.toContain(line)
    }
  })
  it('новые строки на месте', () => {
    for (const line of [
      'Мой долг под Гариком и домом — а платит Алик?',
      'Твой вопрос про деньги рассматривает ООН',
      'Мы не злимся.',
      'Может, спросить Гарика? Он же код знает',
      'с него и спросишь, я подскажу, где он',
    ]) expect(allSource, line).toContain(line)
  })
  it('Тарон рисуется на старых эмодзи-шрифтах: ☕, а не чайник из Unicode 13.0 (#891)', () => {
    expect(CAST.taron.emoji).toBe('☕')
    expect(allSource).not.toContain('🫖')
  })
  it('срок легенды бетона указывает на Гранта: «я свободен» и обещание вернуть самому не спорят (#891)', () => {
    expect(LEGENDS.beton_law.until.t).toContain('с него и спросишь')
    expect(LEGENDS.beton_law.until.t).not.toContain('что должен тебе')
  })
  it('в легенде кода Гарика спрашивают, а не достают (#891)', () => {
    const talk = (LEGENDS.garik.talk ?? []).map(valueOf).flat().join(' ')
    expect(talk).toContain('Может, спросить Гарика? Он же код знает')
    expect(talk).not.toContain('достать Гарика')
  })
  it('follow-строка Гарика про долг — под гейтом бетона (#891)', () => {
    const { game } = makeGame()
    const line = 'Мой долг под Гариком и домом — а платит Алик?'
    expect(game.open(ARCS.garik.follow), 'до фундамента строки нет').not.toContain(line)
    game.S.mem['garik.concrete'] = true
    expect(game.open(ARCS.garik.follow), 'бетон введён — строка есть').toContain(line)
   })
  // живая рецензия №3 (#1000): старые формулировки ушли из исходников, новые на месте,
  // «пустой конверт» и «долг в конверте» не вводятся, «плачу я» не переворачивает схему кредитора
  it('десять строк рецензии №3: старых нет, новые на месте (#1000)', () => {
    for (const old of [
      'Как там свадьба?', 'Тамада гуляет, а плачу я?', 'Конверт молодым пустой. Мой долг в него не влез?',
      'Долг мой в конверте, а платить Алик будет?', 'Самвел ещё женится?',
      'Заказчик доволен и не платит. Смета-то моя, а деньги почему чужие?', 'Заказчик не платит, и я не плачу. Схема честная, долг растёт.',
      'а в Аликовом календаре та дата ещё не наступила',
    ]) expect(allSource, `старая строка на месте: «${old}»`).not.toContain(old)
    for (const next of [
      'Свадьба идёт, а деньги — нет. Или я не так понял?', 'Тамада гуляет, а я жду. Так нечестно.',
      'Самвел, конверты у вас. Мой долг — туда же сдать?', 'Деньги на свадьбе собирали конвертами? Мой где?',
      'Самвел снова женится?', 'Заказчик доволен? Пусть и платит. Смета-то моя.',
      'Грант вам не платит, вы — мне. Я в этой схеме крайний.', 'а просто в календаре та дата ещё не наступила.',
    ]) expect(allSource, `новой строки нет: «${next}»`).toContain(next)
  })
  // живая рецензия №4 (#1025): «нечем» договорено до «нечем платить», «Гарика достали» — из фундамента:
  // старая формулировка без хвоста повисает, старая без «из фундамента» читается как «замучили»
  it('незавершённое «нечем» и двусмысленные «достали» ушли (#1025)', () => {
    expect(allSource, 'старое «нечем» на месте').not.toContain('Мне буквально нечем.')
    expect(P_MONEY.bottom.polite.map(valueOf), 'нового «нечем платить» нет в пуле').toContain('Алик, до конца недели — пожалуйста. Мне буквально нечем платить.')
    expect(allSource, 'старый вопрос про Гарика на месте').not.toContain('Гарика достали?')
    expect(allSource, 'нового вопроса про Гарика нет').toContain('Гарика достали из фундамента?')
  })
  // плейтест 78 (#1035): «тоже из Еревана» сравнивало хозяина квартиры с Аликом-из-Еревана,
  // о котором к тому моменту в переписке не звучало — сравнение переписано без непроизнесённого
  it('хозяин квартиры без «тоже» к непроизнесённому Еревану (#1035)', () => {
    expect(allSource, 'старое «тоже из Еревана» на месте').not.toContain('тоже из Еревана')
    expect(allSource, 'новой формулировки нет').toContain('Мой хозяин квартиры из Еревана. Слушает Алика — и тоже не верит.')
  })
  // плейтест 79 (#1045): «пробный долг» не вводил ни оффер стажировки, ни sys — строка опирается на «процент»
  // из оффера; снимок всех трёх строк держит порядок: индекс 1 обязана занимать строка отказа (#1041/#1017)
  it('«Пробный долг» — фантом из P_INTERN ушёл, строки и порядок на месте (#1045)', () => {
    expect(allSource, 'старое «Пробный долг» на месте').not.toContain('Пробный долг')
    expect(P_INTERN.map(valueOf), 'строки и порядок пула стажировки').toEqual([
      'Согласен. Все долги — по памяти, чай — по ведомости.',
      'Отказываюсь. У меня клиент Алик: он не платит и не уходит.',
      'Согласен. Процент считаем с долга Алика?',
    ])
  })
  // плейтест 80 (#1051): «спросил в сообщении — он подтвердил» — выдуманный обмен; Тарон писал один раз
  // и сам, его письмо и есть опора упрёка; снимок шести строк держит порядок и ёмкость
  it('упрёк по звонку не выдумывает диалог с Тароном (#1051)', () => {
    expect(allSource, 'выдуманный обмен с Тароном').not.toContain('в сообщении — он подтвердил')
    expect(P_CREW_PAID.map(valueOf), 'строки и порядок пула упрёка').toEqual([
      'Значит, деньги были. Вы всем платили и мне — нет?',
      'Тарон писал: всем заплатили. Кроме меня.',
      'Мне с объекта звонили и сказали: деньги ушли всем. Я подумал, что и мне. Ошибся ровно на одного.',
      'Вы рассчитали объект целиком. Целиком — это без меня, получается?',
      'Значит, я последний в очереди. Очередь из одного. Меня.',
      'Мне сказали: платят всем. Я сначала обрадовался. Потом дошло.',
      // #1068: мир вариантов 3–4 — только то, что эти варианты утверждают; #1057/#1068 держат «всем» под crewAllPaid
      'Тарон, я всё прочитал. Мне не заплатили — это я понял.',
      'Получка — не про меня. Записал, чтобы не потерять.',
    ])
  })
  // плейтест 77 (#1091): «Семь звонков ей?» утверждало счёт, которого событие не говорило — sys серии
  // называет переменное {n} («прошлое + 1 + rnd(4)», первый триггер уже 7–10 и только растёт),
  // «семь» совпадало с ним лишь при (плач — первый триггер) × (rnd = 0) ≈ 5% партий;
  // снимок трёх строк держит порядок и ёмкость, отсутствие числа — класс строки при переменном счёте
  it('строка мамы не называет счёт звонков, которого серия не говорила (#1091)', () => {
    expect(allSource, 'число из одного транскрипта').not.toContain('Семь звонков')
    const lines = P_MAMA_VOICE.map(valueOf)
    expect(lines, 'строки и порядок пула мамы').toEqual([
      'Передайте маме: я не злодей, я кредитор.',
      'Слышал голосовое. Стыдно и пусто одновременно.',
      'Сколько можно звонков ей? Оплачу тариф — с вашего долга.',
    ])
    expect(lines.join(' '), 'число в строке окна, у которого переменный счёт').not.toMatch(/\d|семь|восем|девят|десят|одиннадцат|двенадцат/i)
  })
})

const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const allSource = Object.values(sources).join('\n')

// живая рецензия №5 (#1251): три строки игрока спотыкались у живого автора — переписаны без смены
// референтов: дом на деньгах / комната под углом, остаток против терпения, доля автора с процентов
describe('три строки живой рецензии №5 (#1251)', () => {
  it('старые формулировки ушли из исходников', () => {
    for (const old of [
      'Раз дом на моих деньгах — мне должна часть дома',
      'Алик, низкий остаток. Высокое терпение. Поменяемся?',
      'Я как автор — с процентов',
    ]) expect(allSource, `старая строка на месте: «${old}»`).not.toContain(old)
  })
  it('новые формулировки на месте — в самих пулах, не только в комментариях', () => {
    expect(ASK_ROOM, 'выбор фундамента').toBe('Раз дом на моих деньгах, мне положена часть дома. Хотя бы комната. Угловая.')
    expect(P_MONEY.low.polite.map(valueOf), 'вежливая реплика на низком остатке').toContain('Алик, у меня остаток низкий, а терпение — высокое. Поменяемся?')
    expect(P_DEBUT_ARSEN.map(valueOf), 'дебют Арсена: трек, крик, бит').toEqual([
      'Арсен, а трек «Плиточник» где послушать?',
      'Арсен, ты мой крик записал? Мне как автору — проценты.',
      'Арсен, а бит из чего собран? Из крика?',
    ])
  })
})

describe('обида Алика не ссылается на несостоявшееся прошлое (#963)', () => {
  it('«хлеб давал» ушёл из корпуса, неутверждающая форма на месте', () => {
    // сфабрикованное одолжение: хлеба и лаваша Алик игроку не давал ни разу (раунд 70, cat 12)
    expect(allSource, 'ссылка на несостоявшееся прошлое').not.toContain('хлеб давал')
    expect(allSource, 'новая формулировка').toContain('я тебе и хлеб бы дал, и лаваш дал')
    expect(D.OFF_A.map(String), 'строка в пуле обид').toContain('Ара, я тебе и хлеб бы дал, и лаваш дал, а ты кричишь!')
    // «Клянусь хлебом» — клятва, не ссылка на прошлое: остаётся
    expect(allSource).toContain('Клянусь хлебом')
  })
})

describe('тойфу-глифы: в исходниках нет эмодзи свежих Unicode (#923, заметка 18)', () => {
  // Символы блока U+1F900–1FAFF приходят из Unicode 11–14: часть (🥲 🪙 🪫 🫓 🫖) не рисуется
  // старыми эмодзи-шрифтами. Новый глиф из блока — сначала сюда в белый список, иначе сторож красный.
  // 🥖 (E3, 2016) — замена лаваша 🫓 (E14).
  const allowed = new Set(['🤔', '🤝', '🤦', '🤬', '🤷', '🥂', '🥃', '🥧', '🥰', '🦅', '🧑', '🧔', '🧮', '🧱', '🩸', '🥖'])
  it('весь контент и движок — на поддерживаемых глифах', () => {
    const fresh = new Set<string>()
    for (const ch of allSource) {
      const cp = ch.codePointAt(0) ?? 0
      if (cp >= 0x1f900 && cp <= 0x1faff && !allowed.has(ch)) fresh.add(ch)
    }
    expect([...fresh], 'замените на поддерживаемый глиф или внесите в белый список осознанно').toEqual([])
  })
  it('замены заметки 18 на месте: 😢 вместо 🥲, монеты — без глифа Unicode 13', () => {
    expect(allSource).toContain(' 😢')
    expect(allSource).not.toContain('🥲')
    expect(allSource).not.toContain('🪙')
  })
})

const api = (seed = 1, tier = 0) => {
  const decks = new Decks({}, seededRng(seed))
  // весь словарь, без требований мира: проверяется сам текст
  return make(<T>(k: string, a: readonly Entry<T>[], nr?: boolean) => decks.draw(k, a.map(valueOf), nr), () => tier, seededRng(seed + 1))
}

describe('эпилог Рубика не переобъявляет развязку (#914)', () => {
  it('в endgame.ts нет «оказывается» про налоговую и есть продолжение', () => {
    const src = sources['./endgame.ts'] ?? ''
    expect(src.length, 'файл endgame.ts найден').toBeGreaterThan(1000)
    expect(src, 'эпилог не переобъявляет открытие').not.toContain('оказывается')
    expect(src, 'продолжение на месте').toContain('Рубик из налоговой подтвердил')
  })
})

describe('строки по живой рецензии №2 (#922)', () => {
  it('старые строки ушли из исходников', () => {
    for (const line of [
      'Бетон, кстати, правда обиделся',
      'Я в него верю, значит, и ты',
      'А при чём тут приданое и мои деньги?',
      '«Мууу» — это по-аликовски «завтра»',
      'Это срок из Аликовой философии',
      'Опять я. Опять 50',
    ]) expect(allSource, line).not.toContain(line)
  })
  it('новые строки на месте', () => {
    for (const line of [
      'Бетон, кстати, на Алика обиделся. Я его понимаю.',
      'Я в него верю, верь и ты.',
      'Вы говорили — приданое. А при чём тут мои деньги?',
      '«Мууу» — это по-коровьи «завтра».',
      'Это просто из философии. Переводу не подлежит.',
      'Брат, займи 50. До четверга. Алик Воздухонесян, надёжный заёмщик, справки у мамы.',
    ]) expect(allSource, line).toContain(line)
  })
  it('хоровой пул Мкртича не помнит удалённую арку про бетон (#922)', () => {
    const pool = GROUP.mkrtich.map((e) => saidText(valueOf(e))).join(' ')
    expect(pool, 'следа «обиделся» без причины нет').not.toContain('правда обиделся')
    expect(pool, 'обида названа — на кого').toContain('на Алика обиделся')
  })
})

describe('scenes', () => {
  const scenes = makeScenes(api())
  it('every start node and every option target exists', () => {
    for (const [sid, sc] of Object.entries(scenes)) {
      expect(sc.nodes[sc.start], `${sid}.start`).toBeDefined()
      for (const [nid, n] of Object.entries(sc.nodes)) {
        for (const o of n.opts ?? []) {
          if (o.go === null) continue
          const [s2, n2] = o.go.includes(':') ? o.go.split(':') : [sid, o.go]
          expect(scenes[s2]?.nodes[n2], `${sid}.${nid} → ${o.go}`).toBeDefined()
        }
      }
    }
  })
  it('every node says or shows something; achievements exist', () => {
    const base = { v: 1, n: 'баран', p: 'x', rows: [['a', 1]], total: 1, r: ['a', 'b', 'c'] }
    const all = <T,>(arr: readonly Entry<T>[]) => arr.map(valueOf)
    for (const [sid, sc] of Object.entries(scenes)) {
      const vars = { ...base, ...sc.init?.(seededRng(1), all, 200) }
      const txt = (l: Line) => {
        const r = typeof l === 'function' ? l(vars) : l
        return typeof r === 'string' ? r : r.t
      }
      for (const [nid, n] of Object.entries(sc.nodes)) {
        const has = n.a || n.a2 || n.sys || n.sys2 || n.opts || n.then || n.doc || n.hook
        expect(has, `${sid}.${nid}`).toBeTruthy()
        for (const l of [...(n.a ?? []), ...(n.a2 ?? [])]) expect(txt(valueOf(l)).length, `${sid}.${nid}`).toBeGreaterThan(1)
        if (n.fx?.ach) expect(ACH[n.fx.ach], `${sid}.${nid} ach`).toBeDefined()
        if (n.who) expect(CAST[n.who]).toBeDefined()
      }
    }
  })
  it('scene init functions produce the vars their lines use', () => {
    const rng = seededRng(1)
    const all = <T,>(arr: readonly Entry<T>[]) => arr.map(valueOf)
    expect(scenes.barter.init!(rng, all, 200)).toMatchObject({ n: expect.any(String), v: expect.any(Number) })
    const inv = scenes.invoice.init!(rng, all, 200)
    expect(inv.total).toBe(inv.rows.reduce((n: number, r: [string, number]) => n + r[1], 0))
    expect(scenes.choice.init!(rng, all, 200).r).toHaveLength(3)
  })
})

describe('arcs and cast', () => {
  it('у каждого сериала есть вопрос «Как там…?», уместный при любом положении', () => {
    // «при любом положении» — без гейта или под одним окном свежести места (#981): окно открывается
    // само по ходам. Гейты мира (факты серий, знакомства) строку из партии убирают — их не считаем.
    const anyTime = (f: Entry<string>) => !(f instanceof Gated) || f.when.every((c) => c.key.startsWith('sinceMoneyAsk.'))
    for (const [id, a] of Object.entries(ARCS)) expect(a.follow.some(anyTime), id).toBe(true)
  })
  it('arcs are well-formed, last episode unlocks an existing achievement, done-lines exist', () => {
    for (const [id, a] of Object.entries(ARCS)) {
      expect(a.eps.length, id).toBeGreaterThanOrEqual(5)
      expect(a.follow.length, id).toBeGreaterThanOrEqual(2)
      expect(ACH[a.eps[a.eps.length - 1].fx?.ach ?? ''], `${id} final ach`).toBeDefined()
      expect(ARC_DONE[id]?.length, `${id} ARC_DONE`).toBeGreaterThan(0)
      for (const ep of a.eps) for (const m of ep.m.map(valueOf)) if (typeof m !== 'string' && 'w' in m) expect(CAST[m.w], `${id} who ${m.w}`).toBeDefined()
    }
    for (const w of Object.keys(GROUP)) expect(CAST[w], `group ${w}`).toBeDefined()
    // реплики семейного чата не совпадают с репликами сериалов (иначе — повтор в переписке)
    const arcLines = new Set(Object.values(ARCS).flatMap((a) => a.eps.flatMap((e) => e.m.map(valueOf).map((m) => (typeof m === 'string' ? m : m.t)))))
    for (const t of Object.values(GROUP).flat().map(valueOf).map(saidText)) expect(arcLines.has(t), t).toBe(false)
  })
  it('у каждого собеседника — эмодзи для кружка-аватара: 1–2 знака, без текста (#686)', () => {
    for (const [id, c] of Object.entries(CAST)) {
      expect(c.emoji, `${id}: эмодзи есть`).toMatch(/\p{Extended_Pictographic}/u)
      expect(c.emoji, `${id}: только эмодзи, не слова`).not.toMatch(/[А-Яа-яЁёA-Za-z0-9]/)
      expect([...c.emoji].length, `${id}: 1–2 эмодзи, не больше`).toBeLessThanOrEqual(4)
    }
  })
})

describe('achievements', () => {
  it('every unlocked key exists, every achievement is reachable from code/content', () => {
    const used = new Set<string>()
    for (const m of allSource.matchAll(/unlock\('(\w+)'\)/g)) used.add(m[1])
    for (const m of allSource.matchAll(/ach: '(\w+)'/g)) used.add(m[1])
    for (const t of [1, 2, 3]) used.add('tier' + t) // unlock('tier' + t)
    used.add('rude').add('threat') // unlock(tone) в Game.send
    for (const [arc, fs] of Object.entries(FINALES)) for (const f of fs) used.add(`fin_${arc}_${f.id}`) // unlock в playFinale
    for (const e of ENDINGS) used.add('end_' + e.id) // unlock в reachEnding
    for (const k of used) expect(ACH[k], `unknown achievement ${k}`).toBeDefined()
    for (const k of Object.keys(ACH)) expect(used.has(k), `unreachable achievement ${k}`).toBe(true)
  })
})

describe('dictionaries', () => {
  it('every D key referenced in code exists and is non-empty', () => {
    const refs = new Set<string>()
    for (const m of allSource.matchAll(/\bD\.([A-Z][A-Z0-9_]+)/g)) refs.add(m[1])
    for (const m of allSource.matchAll(/fromD\(g, '([A-Z0-9_]+)'/g)) refs.add(m[1])
    for (const m of allSource.matchAll(/P2\('([A-Z0-9_]+)', '([A-Z0-9_]+)'\)/g)) { refs.add(m[1]); refs.add(m[2]) }
    expect(refs.size).toBeGreaterThan(20)
    for (const k of refs) {
      expect(Array.isArray(D[k]), `D.${k}`).toBe(true)
      expect(D[k].length, `D.${k}`).toBeGreaterThan(0)
    }
  })
  it('life pools are non-empty; notifications are well-formed', () => {
    for (const k of ['IDLE', 'STICKERS', 'FWD', 'DELETED', 'EDIT_WHEN', 'IDLE_Q', 'IDLE_A', 'VOICE', 'NOTIF', 'SPEND'] as const) {
      expect((L[k] as unknown[]).length, k).toBeGreaterThan(0)
    }
    for (const n of L.NOTIF) {
      expect(n.icon && n.app, n.t).toBeTruthy()
      // подстановки — только у трат с карты
      expect(/\{\w+\}/.test(n.t), n.t).toBe(!!n.spend)
    }
    // одноразовые уведомления не выдают того, чего не было: карта продолжает списывать и дальше
    const blood = L.NOTIF.find((n) => n.app === 'Донорский центр')!
    expect(blood.t).not.toMatch(/снова/)
    const bankFifty = L.NOTIF.find((n) => n.app === 'Банк' && /это хобби/.test(n.t))!
    expect(bankFifty.t).not.toMatch(/заблокирован/)
  })
  it('player templates only use known placeholders', () => {
    for (const k of Object.keys(D).filter((k) => k.startsWith('P_'))) {
      for (const s of (D[k] as Entry<string>[]).map(valueOf)) for (const m of s.matchAll(/\{(\w+)\}/g)) expect(['t', 'T', 'n', 's', 'date', 'days', 'amount', 'record'], `${k}: ${s}`).toContain(m[1])
    }
  })
})

describe('excuse generator', () => {
  it('produces clean, mostly unique texts at every tier', () => {
    for (const tier of [0, 1, 2, 3]) {
      const X = api(tier + 1, tier)
      const seen = new Set<string>()
      for (let i = 0; i < 3000; i++) {
        const e = X.excuse({ preferLong: i % 2 === 0 })
        expect(e.texts.length).toBeGreaterThan(0)
        for (const t of e.texts) {
          const s = saidText(t)
          expect(s, s).not.toMatch(/undefined|null|NaN|\[object|\s,|\s\.\s| {2}/)
          expect(s.length).toBeGreaterThan(2)
        }
        if (e.p) expect(e.texts.map(saidText).join(' ').toLowerCase()).toContain(e.p.t.toLowerCase())
        seen.add(e.texts.map(saidText).join('|'))
      }
      expect(seen.size / 3000, `tier ${tier}`).toBeGreaterThan(0.97)
    }
  }, 60_000) // 12 000 отмазок: время растёт с корпусом, а не с числом проверок
  it('higher tiers use escalated excuses', () => {
    const X = api(5, 3)
    const esc = ([...D.ESC1, ...D.ESC2, ...D.ESC3] as Entry<import('./fact').Said>[]).map((e) => saidText(valueOf(e)))
    let hits = 0
    for (let i = 0; i < 500; i++) if (esc.some((e) => X.excuse().texts.map(saidText).join(' ').includes(e))) hits++
    expect(hits).toBeGreaterThan(50)
    const X0 = api(5, 0)
    for (let i = 0; i < 300; i++) expect(esc.some((e) => X0.excuse().texts.map(saidText).join(' ').includes(e))).toBe(false)
  })
  it('constr:true только если constr() взял из CONSTR, не из ESC', () => {
    const esc = ([...D.ESC1, ...D.ESC2, ...D.ESC3] as Entry<import('./fact').Said>[]).map((e) => saidText(valueOf(e)))
    const X = api(11, 3)
    let escOnSite = 0, flagged = 0
    for (let i = 0; i < 3000; i++) {
      const e = X.excuse()
      const text = e.texts.map(saidText).join(' ')
      // шаблон «я на объекте. …» — два слота constr(); «время на объекте» в сроке не считается
      if (!/я на объекте\./i.test(text)) continue
      if (!esc.some((s) => text.includes(s))) continue
      if (e.constr) flagged++
      else escOnSite++
    }
    expect(escOnSite, 'ESC на объекте без флага').toBeGreaterThan(0)
    expect(flagged, 'флаг на чистом ESC').toBe(0)
  })
  it('оправдание просрочки не ссылается на общий опыт игрока', () => {
    expect(D.PREV_B.map(valueOf).join(' ')).not.toMatch(/ты сам видел/)
  })
  it('legendary excuses appear and never repeat', () => {
    const X = api(9)
    const legends: string[] = []
    for (let i = 0; i < 8000; i++) { const e = X.excuse(); if (e.legendary) legends.push(saidText(e.texts[0])) }
    expect(legends.length).toBeGreaterThan(50)
    expect(new Set(legends).size).toBe(legends.length)
  })
  it('«Алик всегда возвращает свои долги» — легендарная, не больше раза за партию (#508)', () => {
    const LINE = 'Алик всегда возвращает свои долги, ты же знаешь.'
    expect(D.LEGENDARY).toContain(LINE)
    expect(D.LEGENDARY.length).toBe(101)
    const X = api(9)
    const hits: string[] = []
    for (let i = 0; i < 12_000; i++) {
      const e = X.excuse()
      if (e.legendary && saidText(e.texts[0]) === LINE) hits.push(LINE)
    }
    expect(hits.length).toBe(1)
  })
  it('helper generators produce text', () => {
    const X = api(3)
    for (const f of [X.short, X.offended, X.threat, X.cow, X.back, X.jobYes, X.jobNo, X.photo, X.legendQ, X.sorry]) {
      expect(f()).toMatch(/\S/)
    }
    expect(X.transferQ().text).not.toBe('')
    expect(X.shortQ('Завтра.')).toMatch(/^«Завтра»/)
    expect(X.whyRel({ n: 'дядя Самвел', g: 'дяди Самвела' }).text).toMatch(/Дядя Самвел/)
    expect(X.fill('{t}-{x}', { t: 'a' })).toBe('a-')
  })
})

describe('rules content', () => {
  it('rule names unique and every rule has respond or offer', () => {
    const names = allRules.map((r) => r.name)
    expect(new Set(names).size).toBe(names.length)
    for (const r of allRules) expect(r.respond || r.offer, r.name).toBeTruthy()
  })
  it('every intent offered by a choice rule has a reply rule', () => {
    const intents = new Set<string>()
    for (const m of allSource.matchAll(/\bact: '(\w+)'/g)) intents.add(m[1])
    const replies = new Set(allRules.filter((r) => r.event === 'PlayerSays').flatMap((r) => r.when.filter((c) => c.key === 'intent').map((c) => String(c.value))))
    for (const i of intents) expect(replies.has(i), `no reply for intent ${i}`).toBe(true)
  })
})
