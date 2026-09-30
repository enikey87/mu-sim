// Реплика игрока о его прошлом («уже», «снова», «третий раз», «продал») опирается на факт партии (#419, #445, #461).
import { describe, it, expect } from 'vitest'
import { D } from './excuses'
import {
  TOPICS, P_DESPERATE, P_NIGHT, P_FRIDAY, P_NEU_B_LATE, P_RUDE_BLOCKED, P_RUDE_POLITE, P_POL_POLITE, P_MONEY,
} from './topics'
import { P_LIE } from './lies'
import { ARCS } from './arcs'
import { CHORUS_TALK, MEMORY_TALK } from './talk'
import { GROUP_Q, JOB_YES_P, JOB_NO_P } from './misc'
import { DEL_Q } from './life'
import { ENDGAME_CHOICES, LEND50_CHOICES } from './endgame'
import { Gated, valueOf, type Criterion } from '../engine/rules'
import { makeGame, setMoney, botTurn } from '../test/helpers'
import { makeScenes, type Line, type Vars } from './scenes'
import { seededRng } from '../engine/rng'
import type { Entry } from './fact'

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
  'Алик, давайте уже по-человечески.': { why: 'частица «уже» в просьбе («ну же»), не событие партии' },
  'Алик, очень прошу. Карта уже не берёт трубку.': { why: 'о настоящем остатке; пул P_MONEY.bottom только на дне' },
  'Кладку проверили — ровная, заказчик сказал: «Так не бывает», проверяем ещё раз': { why: 'сцена: проверка только что закончилась' },
  'Что там было?': { why: 'вопрос про только что удалённое сообщение' },
  'Алик, поздравляю с праздником! С каким бы ни было.': { why: '«было» — не событие партии' },
  'Мой шов на вашем объекте идеальный. Как и моё терпение. Было.': { why: 'о настоящем терпении, не событие' },
  'Мне другие подрядчики уже платят.': { why: 'настоящее время, не событие партии' },
  'Это уже не смешно!!!': { why: 'реакция на текущий разговор' },
  'Я сам там работал, всё было нормально!': { why: 'завязка игры: игрок клал плитку на объекте' },
  'Это было голосовое или корова?': { why: 'вариант предлагается только в ответ на голосовое' },
  'А помните «{t}»? Это было {date}.': { why: '{t} и {date} — из записи обещания в журнале' },
  'Ануш уже дома? Долг в приданом?': { why: 'вопрос, а не утверждение' },
  'Урарту уже давно нет, Алик.': { why: 'история, не событие партии' },
  'Я уже тоже на орбите. От голода.': { why: 'гипербола о настоящем' },
  'Алик, я не давлю, но у меня уже лицо такое. Давящее.': { why: 'о настоящем; пул звучит только при нехватке денег' },
  'Меня уже судят?': { why: 'вопрос, а не утверждение' },
  'Скинуть номер карты ещё раз': { fact: 'card.sent', op: '==', value: true },
  'Я его уже сорок раз отправлял!': { fact: 'card.sent', op: '==', value: true },
  'Банкомат посмотрел на меня. И ОТВЕРНУЛСЯ. ВЧЕРА.': { why: 'абсурд о банкомате; пул звучит только на дне' },
  'Было не так, Алик': { why: 'ответ на воспоминание, которое Алик только что рассказал' },
  'Давайте ещё раз договоримся': { why: 'завязка: договорённость об оплате была до игры' },
  'Я уже заплатил за ваш столик…': { why: 'сцена: официант только что попросил оплатить столик Алика' },
  'Спасибо, было вкусно… А деньги?': { why: 'сцена: игрок только что поел у Алика дома' },
  'Алик, что это было?!': { why: 'вариант только сразу после группового чата' },
  'Алик, это был семейный чат?': { why: 'вариант только сразу после группового чата' },
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

/** Строки голоса игрока: текст и критерии, под которыми он звучит. */
function corpus(): Item[] {
  const out: Item[] = []
  const add = (where: string, e: unknown, outer: Criterion[] = []): void => {
    const when = [...outer]
    let v = e
    while (v instanceof Gated) { when.push(...(v.when as Criterion[])); v = v.v }
    if (typeof v === 'string') { out.push({ where, text: v, when }); return }
    if (typeof v === 'function') {
      // функции сцен: вызываем с базовыми vars (как content.test); сбой — непроверяемая ветка
      try {
        const r = (v as (vars: Vars) => unknown)({ v: 1, n: 'баран', p: 'x', rows: [['a', 1]], total: 1, r: ['a', 'b', 'c'] })
        add(where, r, when)
      } catch { /* vars узла не покрывают */ }
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

  // D.P_* — кнопки из генератора
  for (const k of Object.keys(D)) if (k.startsWith('P_')) list(`D.${k}`, D[k])
  // темы
  for (const [k, t] of Object.entries(TOPICS)) { list(`TOPICS.${k}.p`, t.p); list(`TOPICS.${k}.r`, (t as { r?: unknown }).r) }
  // все экспортированные пулы реплик игрока из topics (#461)
  list('P_NIGHT', P_NIGHT)
  list('P_FRIDAY', P_FRIDAY)
  list('P_NEU_B_LATE', P_NEU_B_LATE)
  list('P_RUDE_BLOCKED', P_RUDE_BLOCKED)
  list('P_RUDE_POLITE', P_RUDE_POLITE)
  list('P_POL_POLITE', P_POL_POLITE)
  list('P_MONEY.low.polite', P_MONEY.low.polite)
  list('P_MONEY.low.neutral', P_MONEY.low.neutral)
  list('P_MONEY.bottom.polite', P_MONEY.bottom.polite)
  list('P_MONEY.bottom.neutral', P_MONEY.bottom.neutral)
  list('P_DESPERATE.low', P_DESPERATE.low)
  list('P_DESPERATE.bottom', P_DESPERATE.bottom)

  list('P_LIE', P_LIE)
  for (const [k, a] of Object.entries(ARCS)) list(`ARCS.${k}.follow`, a.follow)
  const pair = (where: string, e: unknown) => {
    const v = valueOf(e as never) as unknown
    if (Array.isArray(v)) add(where, e instanceof Gated ? new Gated(e.when, v[0]) : v[0])
  }
  for (const [k, pairs] of Object.entries(CHORUS_TALK)) for (const e of pairs) pair(`CHORUS_TALK.${k}`, e)
  for (const e of MEMORY_TALK) pair('MEMORY_TALK', e)
  list('GROUP_Q', GROUP_Q)
  list('JOB_YES_P', JOB_YES_P)
  list('JOB_NO_P', JOB_NO_P)
  list('DEL_Q', DEL_Q)
  list('ENDGAME_CHOICES', ENDGAME_CHOICES)
  list('LEND50_CHOICES', LEND50_CHOICES)

  // сцены: opts, в т.ч. функции и вложенные Entry
  const { game } = makeGame({ seed: 1 })
  const scenes = makeScenes(game.X)
  const openAll = <T,>(arr: readonly Entry<T>[]) => arr.map(valueOf)
  const base: Vars = { v: 1, n: 'баран', p: 'x', rows: [['a', 1]], total: 1, r: ['a', 'b', 'c'] }
  for (const [id, sc] of Object.entries(scenes)) {
    const varsList: Vars[] = sc.init
      ? Array.from({ length: 8 }, (_, i) => ({ ...base, ...sc.init!(seededRng(i + 1), openAll, 200) }))
      : [base]
    for (const [node, n] of Object.entries(sc.nodes)) {
      for (const o of n.opts ?? []) {
        if (typeof o.t === 'function') {
          for (const vars of varsList) {
            try { add(`scene ${id}.${node}`, (o.t as (v: Vars) => Line)(vars)) } catch { /* */ }
          }
        } else add(`scene ${id}.${node}`, o.t)
      }
    }
  }
  return out
}

/** Шаблон корпуса совпадает с текстом кнопки (подстановки {t}/{old}/…). */
const matchesTemplate = (template: string, text: string): boolean => {
  if (template === text) return true
  if (!/\{[a-z]+\}/i.test(template)) return false
  const esc = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[a-z]+\\\}/gi, '.*')
  return new RegExp('^' + esc + '$').test(text)
}

describe('реплика игрока о своём прошлом', () => {
  it('корпус собран: пулы D/topics/сцены включая P_NEU_B_LATE и P_MONEY', () => {
    const c = corpus()
    const where = new Set(c.map((x) => x.where.split(/[.\s]/)[0]))
    for (const w of ['D', 'TOPICS', 'P_DESPERATE', 'P_LIE', 'ARCS', 'CHORUS_TALK', 'scene', 'GROUP_Q', 'ENDGAME_CHOICES', 'P_NIGHT', 'P_NEU_B_LATE', 'P_MONEY', 'P_POL_POLITE']) {
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

  it('бот не предлагает маркер прошлого вне статического корпуса (#461)', async () => {
    const templates = corpus().map((x) => x.text)
    const covered = (text: string) =>
      templates.some((t) => text === t || text.includes(t) || matchesTemplate(t, text))
    const missing: string[] = []
    for (let seed = 1; seed <= 6; seed++) {
      const { game } = makeGame({ seed })
      for (let t = 0; t < 25; t++) {
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
