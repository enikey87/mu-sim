// Реплика игрока о его прошлом («уже», «снова», «третий раз», «продал») опирается на факт партии (#419, #445, #461, #491).
import { describe, it, expect } from 'vitest'
import { D } from './excuses'
import { TOPICS } from './topics'
import { Gated, valueOf, type Criterion } from '../engine/rules'
import { makeGame, setMoney, botTurn } from '../test/helpers'
import { Game } from '../engine/game'
import type { Vars } from './scenes'
import {
  allPlayerPools, PLAYER_CHOICE_POOLS, PLAYER_PAIR_POOLS,
} from './player-pools'
import { forEachSceneOpt } from './scene-walk'

/** Слова, которыми реплика утверждает прошлое игрока. Слова, а не смысл: проверка ловит формулировку, не событие. */
const MARK = new RegExp(
  '(^|[^а-яё])(' + [
    'уже', 'снова', 'опять', 'ещё раз', 'в который раз', 'каждый раз', 'вчера', 'позавчера', 'раньше', 'недавно', 'в прошлый раз',
    'на прошлой неделе', '(втор|трет|четв[её]рт|пят|шест|десят|сороков)(ой|ий|ья|ая|ую|ье|ые|ый|ого|ом)', '\\d+ раз',
    'продал[аи]?', 'отдал[аи]?', 'отправлял[аи]?', 'ездил[аи]?', 'звонил[аи]?', 'писал[аи]?', 'был[аио]?',
  ].join('|') + ')([^а-яё]|$)', 'i')

/** Запись реестра: либо почему маркер не про прошлое партии, либо какой гейт обязан держаться (op+value). */
type PastEntry = { why: string } | { fact: string; op: Criterion['op']; value?: unknown }

/**
 * Каждая строка игрока с маркером прошлого — здесь.
 * `fact`/`op`/`value` — условие, которое гейт обязан содержать (не только имя ключа).
 */
const PAST: Record<string, PastEntry> = {
  'Алик, простите, что снова пишу.': { fact: 'sent', op: '>=', value: 1 },
  'Алик, это опять я.': { fact: 'sent', op: '>=', value: 1 },
  'Это снова я.': { fact: 'sent', op: '>=', value: 1 },
  'Я уже выучил, как по-аликовски «завтра». Можно без него?': { fact: 'said.tomorrow', op: '==', value: true },
  'Я ем гречку. Какую неделю — уже не считаю.': { fact: 'moneyNormal', op: '==', value: false },
  'Микроволновку я уже продал. Что продавать дальше?': { fact: 'sold.microwave', op: '==', value: true },
  'Гитару я уже продал. Что продавать дальше?': { fact: 'sold.guitar', op: '==', value: true },
  'Зимнюю резину я уже продал. Что продавать дальше?': { fact: 'sold.tires', op: '==', value: true },
  'АЛИК, Я УЖЕ ПРОДАЛ ПЛИТКУ. ВАШУ. ДЕНЕГ ВСЁ РАВНО НЕТ.': { fact: 'sold.tile', op: '==', value: true },
  'Записал «{t}» в «когда-нибудь». Там уже тесно.': { fact: 'somedayCount', op: '>=', value: 2 },
  'Алик, я могу дать реквизиты ещё раз.': { fact: 'card.sent', op: '==', value: true },
  'Алик, сначала {old}, а теперь уже {new}. Определитесь.': { fact: 'lieAlikOld', op: '==', value: true },
  'Я уже забыл, как выглядит ваш объект.': { fact: 'ach.redo', op: '!exist' },
  'Я считаю дни. Уже трёхзначные.': { why: 'гипербола о настоящем ожидании, не одно событие' },
  'Я уже рассказываю про вас внукам. Будущим.': { why: 'гипербола о настоящем; «будущим» — не событие партии' },
  'Алик, банк уже спрашивает про вас. По имени.': { why: 'о настоящем давлении банка; пул P_MONEY.low' },
  'Свадьба без повода — это уже просто посиделки.': { why: 'частица «уже» о состоянии свадьбы после развода (событие окна #1037), не прошлое игрока' },
  'Алик, давайте уже по-человечески.': { why: 'частица «уже» в просьбе («ну же»), не событие партии' },
  'Алик, очень прошу. Карта уже не берёт трубку.': { why: 'о настоящем остатке; пул P_MONEY.bottom только на дне' },
  'Кладку проверили — ровная, заказчик сказал: «Так не бывает», проверяем ещё раз': { why: 'сцена choice: игрок выбирает отмазку для Алика, не своё прошлое' },
  'Бригада из Гюмри уехала с моей бетономешалкой, а твои деньги были внутри': { why: 'сцена choice: игрок выбирает отмазку для Алика, не своё прошлое' },
  'Перфоратор сломался, а деньги были в чемодане от перфоратора': { why: 'сцена choice: игрок выбирает отмазку для Алика, не своё прошлое' },
  'Шпаклёвщик Гриша второй месяц шпаклюет одну стену, говорит, она особенная': { why: 'сцена choice: игрок выбирает отмазку для Алика, не своё прошлое' },
  'Стену снесли не ту, теперь спорим, чья она была': { why: 'сцена choice: игрок выбирает отмазку для Алика, не своё прошлое' },
  'Штробы проштробили, а в них деньги спрятаны были': { why: 'сцена choice: игрок выбирает отмазку для Алика, не своё прошлое' },
  'Звонил тебе, попал в Ростов, полчаса разговаривали': { why: 'сцена choice: игрок выбирает отмазку для Алика, не своё прошлое' },
  'Бумаги подписал, но ручка была без чернил': { why: 'сцена choice: игрок выбирает отмазку для Алика, не своё прошлое' },
  'Подпись не совпала, я в тот день был грустный': { why: 'сцена choice: игрок выбирает отмазку для Алика, не своё прошлое' },
  'Деньги отдал брату подержать, брат держит крепко': { why: 'сцена choice: игрок выбирает отмазку для Алика, не своё прошлое' },
  'Деньги были в шапке, шапку унёс ветер с Арагаца': { why: 'сцена choice: игрок выбирает отмазку для Алика, не своё прошлое' },
  'Что там было?': { why: 'вопрос про только что удалённое сообщение' },
  'Алик, поздравляю с праздником! С каким бы ни было.': { why: '«было» — не событие партии' },
  'Мой шов на вашем объекте идеальный. Как и моё терпение. Было.': { why: 'о настоящем терпении, не событие' },
  'Мне другие подрядчики уже платят.': { why: 'настоящее время, не событие партии' },
  'Это уже не смешно!!!': { why: 'реакция на текущий разговор' },
  'Я сам там работал, всё было нормально!': { why: 'завязка игры: игрок клал плитку на объекте' },
  'Самвел снова женится?': { fact: 'arc.samvel', op: '==', value: 7 },
  'Это было голосовое или корова?': { why: 'вариант предлагается только в ответ на голосовое' },
  'А помните «{t}»? Это было {date}.': { why: '{t} и {date} — из записи обещания в журнале' },
  'Ануш уже дома? Долг в приданом?': { why: 'вопрос, а не утверждение' },
  'Урарту уже давно нет, Алик.': { why: 'история, не событие партии' },
  'Я уже тоже на орбите. От голода.': { why: 'гипербола о настоящем' },
  'Алик, я не давлю, но у меня уже лицо такое. Давящее.': { why: 'о настоящем; пул звучит только при нехватке денег' },
  'Скинуть номер карты ещё раз': { fact: 'card.sent', op: '==', value: true },
  'Я его уже сорок раз отправлял!': { fact: 'card.sent', op: '==', value: true },
  'Банкомат посмотрел на меня. И ОТВЕРНУЛСЯ. ВЧЕРА.': { why: 'абсурд о банкомате; пул звучит только на дне' },
  'Было не так, Алик': { why: 'ответ на воспоминание, которое Алик только что рассказал' },
  'Давайте ещё раз договоримся': { why: 'завязка: договорённость об оплате была до игры' },
  'Я уже заплатил за ваш столик…': { why: 'сцена: официант только что попросил оплатить столик Алика' },
  'Спасибо, было вкусно… А деньги?': { why: 'сцена: игрок только что поел у Алика дома' },
  'Алик, что это было?!': { why: 'вариант только сразу после группового чата' },
  'Алик, это был семейный чат?': { why: 'вариант только сразу после группового чата' },
  'Кому это было?': { why: 'вопрос про чужое сообщение в общем чате (WRONG_Q)' },
  'Алик, это что сейчас было?': { why: 'вопрос только после чужого сообщения (WRONG_Q)' },
  'А деньги в ней точно были?': { why: 'вопрос про легенду, которую Алик только что рассказал' },
  'Мне сказали, вы вчера ели хаш': { why: 'ответ на легенду о смерти; «вчера» из чужих слов, не факт партии' },
  'Может, уже помириться с Грантом?': { why: 'совет по текущей легенде суда, не событие партии' },
  'Значит, деньги были. Вы всем платили и мне — нет?': { why: 'факт звонка (crew.paid); пул собирается только по нему — оффер Opt_CrewPaid' },
  'Заделаю. За отдельную плату. Дырка — это уже работа.': { why: '«уже» — частица в настоящем: дырка только что появилась, пул звучит в её окне (#958)' },  // звонок с объекта (#703): «пострадавшие» могли не прозвучать в звонке — пул говорит только о факте звонка
  'Тарон писал: всем заплатили. Кроме меня.': { why: '«писал» — о Тароне и его одностороннем письме, не о прошлом игрока; оффер Opt_CrewPaid собран только при crew.paid (#1051)' },
  'Мне с объекта звонили и сказали: деньги ушли всем. Я подумал, что и мне. Ошибся ровно на одного.': { why: 'факт звонка (crew.paid); пул собирается только по нему — оффер Opt_CrewPaid' },
}

type Item = { where: string; text: string; when: Criterion[] }

const flattenWhen = (cs: Criterion[]): Criterion[] => {
  const out: Criterion[] = []
  const walk = (c: Criterion) => {
    if (c.op === 'all' && c.all) for (const x of c.all) walk(x)
    else out.push(c)
  }
  for (const c of cs) walk(c)
  return out
}

const whenHolds = (when: Criterion[], need: Extract<PastEntry, { fact: string }>): boolean =>
  flattenWhen(when).some((c) => c.key === need.fact && c.op === need.op && (need.value === undefined || Object.is(c.value, need.value)))

/** Строки голоса игрока: текст и критерии — из PLAYER_POOLS, не из ручного списка (#491). */
function corpus(): Item[] {
  const out: Item[] = []
  const add = (where: string, e: unknown, outer: Criterion[] = []): void => {
    const when = [...outer]
    let v = e
    while (v instanceof Gated) { when.push(...(v.when as Criterion[])); v = v.v }
    if (typeof v === 'string') { out.push({ where, text: v, when }); return }
    if (typeof v === 'function') {
      const r = (v as (vars: Vars) => unknown)({ v: 1, n: 'баран', p: 'x', rows: [['a', 1]], total: 1, r: ['a', 'b', 'c'] })
      add(where, r, when)
      return
    }
    if (Array.isArray(v)) { for (const x of v) add(where, x, when); return }
    if (v && typeof v === 'object') {
      const o = v as { t?: unknown; text?: unknown; when?: Criterion[]; ask?: unknown }
      if (o.when) when.push(...o.when)
      if (o.t !== undefined) add(where, o.t, when)
      else if (typeof o.text === 'string') out.push({ where, text: o.text, when })
      else if (typeof o.ask === 'string') out.push({ where, text: o.ask, when })
    }
  }
  const list = (where: string, arr: unknown) => { for (const e of (Array.isArray(arr) ? arr : [])) add(where, e) }

  for (const [k, arr] of allPlayerPools()) list(k, arr)
  for (const [k, arr] of Object.entries(PLAYER_CHOICE_POOLS)) list(k, arr)
  const pair = (where: string, e: unknown) => {
    const v = valueOf(e as never) as unknown
    if (Array.isArray(v)) add(where, e instanceof Gated ? new Gated(e.when, v[0]) : v[0])
  }
  for (const [k, pairs] of Object.entries(PLAYER_PAIR_POOLS)) for (const e of pairs) pair(k, e)

  forEachSceneOpt(({ id, node, text }) => add(`scene ${id}.${node}`, text), 8)
  return out
}

/** Шаблон корпуса совпадает с текстом кнопки (подстановки {t}/{old}/…). Игрок украшает реплику
 *  префиксом («Алик, а помните…» — первая буква строчная) или суффиксом (« 😢»), поэтому шаблон
 *  ищем внутри текста и без учёта регистра, а не по краям. */
const matchesTemplate = (template: string, text: string): boolean => {
  if (template === text) return true
  if (!/\{[a-z]+\}/i.test(template)) return false
  const esc = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[a-z]+\\\}/gi, '.*')
  return new RegExp(esc, 'i').test(text)
}

describe('реплика игрока о своём прошлом', () => {
  it('корпус собран: пулы D/topics/сцены включая P_NEU_B_LATE и P_MONEY', () => {
    const c = corpus()
    const where = new Set(c.map((x) => x.where.split(/[.\s]/)[0]))
    for (const w of ['D', 'TOPICS', 'P_DESPERATE', 'P_LIE', 'ARCS', 'CHORUS_TALK', 'scene', 'GROUP_Q', 'ENDGAME_CHOICES', 'P_NIGHT', 'P_NEU_B_LATE', 'P_MONEY', 'P_POL_POLITE', 'WRONG_Q', 'STICKER_Q', 'P_VIA_BORIS', 'LEGENDS']) {
      expect(where.has(w), w).toBe(true)
    }
    expect(c.length).toBeGreaterThan(400)
    expect(c.some((x) => x.text.includes('Я уже забыл, как выглядит ваш объект'))).toBe(true)
  })

  it('каждая строка с маркером прошлого — в реестре; гейт держит op+value факта', () => {
    const bad: string[] = []
    for (const x of corpus()) {
      if (!MARK.test(x.text)) continue
      const entry = PAST[x.text]
      if (!entry) { bad.push(`${x.where}: «${x.text}» — нет в реестре PAST`); continue }
      if ('fact' in entry && !whenHolds(x.when, entry)) {
        bad.push(`${x.where}: «${x.text}» — гейт не ${entry.op} ${entry.fact}${entry.value !== undefined ? '=' + String(entry.value) : ''}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('в реестре нет строк, которых уже нет в контенте', () => {
    const texts = new Set(corpus().map((x) => x.text))
    expect(Object.keys(PAST).filter((t) => !texts.has(t))).toEqual([])
  })

  it('игрок не приписывает себе чужую родню: тёща/зять/сваты — только у семьи Алика (#915)', () => {
    // фантомная биография: follow коллекторов приписывал игроку тёщу, которой у холостяка нет
    const FAMILY = /(?<![а-яё])(тёщ|тещ|зять|зят[яюеё]|зятем|сват|свать|шурин|тест[ьяю]|свекр)/i
    // scene choice.ask — отмазки для Алика: игрок выбирает его реплику, голос и родня там его (#461 — реестр PAST)
    const hits = corpus().filter((x) => !x.where.startsWith('scene choice') && FAMILY.test(x.text))
    expect(hits.filter((x) => !/Алик/i.test(x.text)).map((x) => `${x.where}: «${x.text}»`), 'родня без принадлежности Алику').toEqual([])
    // строки про родню в пулах игрока больше нет (тёща-коллекторша убрана, #1016) — проверку держит
    // не она, а детектор: неприкаянная родня обязана краснеть сама
    expect([{ where: 'x', text: 'Моя тёща приехала.' }].filter((x) => FAMILY.test(x.text)).filter((x) => !/Алик/i.test(x.text)).map((x) => x.text),
      'детектор родни не покраснел').toEqual(['Моя тёща приехала.'])
  })

  it('игрок не приписывает себе музыканта: «за мой счёт», без фантома (#961)', () => {
    // фантомная биография: грубая свадебная строка заявляла «мой музыкант», которого в партии не было
    const texts = corpus().map((x) => x.text)
    expect(texts, 'проверка пустеет: свадебной грубости в корпусе не осталось').toContain('Свадьба за свадьбой. Музыкант за мой счёт, между прочим.')
    expect(texts.filter((t) => /Музыкант мой/.test(t)), 'фантомный музыкант игрока').toEqual([])
    // строка — штатная грубость без гейта: предлагается на любой свадебной отмазке
    const { game } = makeGame()
    expect(game.open(TOPICS.wedding.r), 'новая формулировка в выборках').toContain('Свадьба за свадьбой. Музыкант за мой счёт, между прочим.')
  })

  it('бот не предлагает маркер прошлого вне статического корпуса (#461/#491)', async () => {
    const templates = corpus().map((x) => x.text)
    // точное / шаблон / длинная основа пула (playerDecor клеит префикс/суффикс; короткие «Алик.»/«Нет» не считаются покрытием)
    const covered = (text: string) =>
      templates.some((t) => text === t || matchesTemplate(t, text) || (t.length >= 12 && text.includes(t)))
    // НК детектора: шаблон корпуса с украшением — покрыт, строка вне корпуса — нет (#918: суффикс « 😢» ломал якорь)
    expect(covered('А помните «верну всё до рубля, завтра»? Это было 24 сентября. 😢'), 'шаблон с суффиксом').toBe(true)
    expect(covered('Алик, а помните «верну всё до рубля, завтра»? Это было 24 сентября.'), 'префикс и строчная первая').toBe(true)
    expect(covered('Алик, я вам уже это говорил в прошлый раз. 🙏'), 'строка вне корпуса').toBe(false)
    const missing: string[] = []
    const runs: Array<{ seed: number; prep: (g: Game) => void }> = [
      ...[1, 2, 3].map((seed) => ({ seed, prep: () => {} })),
      { seed: 4, prep: (g) => setMoney(g, Game.MONEY_LOW) },
      { seed: 5, prep: (g) => setMoney(g, Game.MONEY_BOTTOM) },
      { seed: 6, prep: (g) => { g.S.day = 0; /* ночь: hour через day */ } },
    ]
    for (const { seed, prep } of runs) {
      const { game } = makeGame({ seed })
      prep(game)
      for (let t = 0; t < 40; t++) {
        if (game.battery.dead) await game.battery.charge()
        for (const c of game.choices) {
          if (MARK.test(c.text) && !covered(c.text)) missing.push(`seed ${seed}: «${c.text}»`)
        }
        await botTurn(game, 0.7, 0.1, 0)
        if (game.S.ending) break
      }
    }
    expect([...new Set(missing)]).toEqual([])
  })
})

describe('путь игрока', () => {
  it('на дне без продаж игрок не говорит, что уже что-то продал; после продажи через карточку банка — говорит о проданном', () => {
    const { game } = makeGame()
    setMoney(game, 0)
    const sold = () => game.open(D.P_NEU_B as never[]).map(String).filter((t) => /продал/i.test(t))
    expect(sold()).toEqual([])
    expect(game.maybeCreditOffer()).toBe(true)
    const card = game.S.msgs.find((m) => m.kind === 'card' && m.offer && !m.answered)!
    game.answerCard(card.id, 'sell')
    const done = Object.keys(game.S.mem).filter((k) => k.startsWith('sold.') && game.S.mem[k])
    expect(done).toHaveLength(1)
    expect(sold()).toHaveLength(1)
  })
  it('в свежей партии игрок не пишет «снова» и не предлагает реквизиты «ещё раз»', () => {
    const { game } = makeGame()
    const open = (arr: unknown[]) => game.open(arr as never[]).map(String)
    expect(open(D.P_NEU_A).filter((t) => MARK.test(t))).toEqual([])
    expect(open(TOPICS.bank.p as never[]).filter((t) => /ещё раз/.test(t))).toEqual([])
  })
})
