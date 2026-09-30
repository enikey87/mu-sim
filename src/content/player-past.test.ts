// Реплика игрока о его прошлом («уже», «снова», «третий раз», «продал») опирается на факт партии (#419, #445).
import { describe, it, expect } from 'vitest'
import { D } from './excuses'
import { TOPICS, P_DESPERATE } from './topics'
import { P_LIE } from './lies'
import { ARCS } from './arcs'
import { CHORUS_TALK, MEMORY_TALK } from './talk'
import { GROUP_Q, JOB_YES_P, JOB_NO_P } from './misc'
import { ENDGAME_CHOICES, LEND50_CHOICES } from './endgame'
import { Gated, valueOf } from '../engine/rules'
import { makeGame, setMoney } from '../test/helpers'

/** Слова, которыми реплика утверждает прошлое игрока. Слова, а не смысл: проверка ловит формулировку, не событие. */
const MARK = new RegExp(
  '(^|[^а-яё])(' + [
    'уже', 'снова', 'опять', 'ещё раз', 'в который раз', 'каждый раз', 'вчера', 'позавчера', 'раньше', 'недавно', 'в прошлый раз',
    'на прошлой неделе', '(втор|трет|четв[её]рт|пят|шест|десят|сороков)(ой|ий|ья|ая|ую|ье|ые|ый|ого|ом)', '\\d+ раз',
    'продал[аи]?', 'отдал[аи]?', 'отправлял[аи]?', 'ездил[аи]?', 'звонил[аи]?', 'писал[аи]?', 'был[аио]?',
  ].join('|') + ')([^а-яё]|$)', 'i')

/**
 * Каждая строка игрока с маркером прошлого — здесь: `fact` — ключ, который её гейт обязан читать;
 * `why` — почему факт не нужен (вопрос, настоящее время, контекст варианта уже его гарантирует).
 */
const PAST: Record<string, { fact: string } | { why: string }> = {
  'Алик, простите, что снова пишу.': { fact: 'sent' },
  'Алик, это опять я.': { fact: 'sent' },
  'Это снова я.': { fact: 'sent' },
  'Я уже выучил, как по-аликовски «завтра». Можно без него?': { fact: 'said.tomorrow' },
  'Я ем гречку. Какую неделю — уже не считаю.': { fact: 'moneyNormal' },
  'Микроволновку я уже продал. Что продавать дальше?': { fact: 'sold.microwave' },
  'Гитару я уже продал. Что продавать дальше?': { fact: 'sold.guitar' },
  'Зимнюю резину я уже продал. Что продавать дальше?': { fact: 'sold.tires' },
  'АЛИК, Я УЖЕ ПРОДАЛ ПЛИТКУ. ВАШУ. ДЕНЕГ ВСЁ РАВНО НЕТ.': { fact: 'sold.tile' },
  'Записал «{t}» в «когда-нибудь». Там уже тесно.': { fact: 'somedayCount' },
  'Алик, я могу дать реквизиты ещё раз.': { fact: 'card.sent' },
  'Алик, сначала {old}, а теперь уже {new}. Определитесь.': { fact: 'lieAlikOld' },
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
  'Скинуть номер карты ещё раз': { fact: 'card.sent' },
  'Я его уже сорок раз отправлял!': { fact: 'card.sent' },
  'Банкомат посмотрел на меня. И ОТВЕРНУЛСЯ. ВЧЕРА.': { why: 'абсурд о банкомате; пул звучит только на дне' },
  'Было не так, Алик': { why: 'ответ на воспоминание, которое Алик только что рассказал' },
  'Давайте ещё раз договоримся': { why: 'завязка: договорённость об оплате была до игры' },
  'Я уже заплатил за ваш столик…': { why: 'сцена: официант только что попросил оплатить столик Алика' },
  'Спасибо, было вкусно… А деньги?': { why: 'сцена: игрок только что поел у Алика дома' },
  'Алик, что это было?!': { why: 'вариант только сразу после группового чата' },
  'Алик, это был семейный чат?': { why: 'вариант только сразу после группового чата' },
}

type Item = { where: string; text: string; keys: string[] }

const criteriaKeys = (cs: unknown): string[] => {
  const out: string[] = []
  const walk = (c: unknown) => {
    if (!c || typeof c !== 'object') return
    const x = c as { key?: string; all?: unknown[] }
    if (x.key) out.push(x.key)
    for (const y of x.all ?? []) walk(y)
  }
  for (const c of (Array.isArray(cs) ? cs : [])) walk(c)
  return out
}

/** Строки голоса игрока: текст и ключи условий, под которыми он звучит (гейт записи и `when` строки). */
function corpus(): Item[] {
  const out: Item[] = []
  const add = (where: string, e: unknown, outer: string[] = []): void => {
    const keys = [...outer]
    let v = e
    while (v instanceof Gated) { keys.push(...criteriaKeys(v.when)); v = v.v }
    if (typeof v === 'string') { out.push({ where, text: v, keys }); return }
    if (Array.isArray(v)) { for (const x of v) add(where, x, keys); return }
    if (v && typeof v === 'object') {
      const o = v as { t?: unknown; text?: unknown; when?: unknown }
      keys.push(...criteriaKeys(o.when))
      if (o.t !== undefined) add(where, o.t, keys)
      else if (typeof o.text === 'string') out.push({ where, text: o.text, keys })
    }
  }
  const list = (where: string, arr: unknown) => { for (const e of (Array.isArray(arr) ? arr : [])) add(where, e) }
  for (const k of Object.keys(D)) if (k.startsWith('P_')) list(`D.${k}`, D[k])
  for (const [k, t] of Object.entries(TOPICS)) { list(`TOPICS.${k}.p`, t.p); list(`TOPICS.${k}.r`, (t as { r?: unknown }).r) }
  list('P_DESPERATE.low', P_DESPERATE.low)
  list('P_DESPERATE.bottom', P_DESPERATE.bottom)
  list('P_LIE', P_LIE)
  for (const [k, a] of Object.entries(ARCS)) list(`ARCS.${k}.follow`, a.follow)
  const pair = (where: string, e: unknown) => { const v = valueOf(e as never) as unknown; if (Array.isArray(v)) add(where, e instanceof Gated ? new Gated(e.when, v[0]) : v[0]) }
  for (const [k, pairs] of Object.entries(CHORUS_TALK)) for (const e of pairs) pair(`CHORUS_TALK.${k}`, e)
  for (const e of MEMORY_TALK) pair('MEMORY_TALK', e)
  list('GROUP_Q', GROUP_Q)
  list('JOB_YES_P', JOB_YES_P)
  list('JOB_NO_P', JOB_NO_P)
  list('ENDGAME_CHOICES', ENDGAME_CHOICES)
  list('LEND50_CHOICES', LEND50_CHOICES)
  const { game } = makeGame()
  for (const [id, sc] of Object.entries(game.scenes)) {
    for (const [node, n] of Object.entries((sc as { nodes: Record<string, { opts?: Array<{ t: unknown }> }> }).nodes)) {
      for (const o of n.opts ?? []) add(`scene ${id}.${node}`, o.t)
    }
  }
  return out
}

describe('реплика игрока о своём прошлом', () => {
  it('корпус собран: пулы, темы, сцены', () => {
    const c = corpus()
    const where = new Set(c.map((x) => x.where.split(/[.\s]/)[0]))
    for (const w of ['D', 'TOPICS', 'P_DESPERATE', 'P_LIE', 'ARCS', 'CHORUS_TALK', 'scene', 'GROUP_Q', 'ENDGAME_CHOICES']) expect(where.has(w), w).toBe(true)
    expect(c.length).toBeGreaterThan(400)
  })
  it('каждая строка с маркером прошлого — в реестре; строка с фактом звучит только под гейтом на него', () => {
    const bad: string[] = []
    for (const x of corpus()) {
      if (!MARK.test(x.text)) continue
      const entry = PAST[x.text]
      if (!entry) { bad.push(`${x.where}: «${x.text}» — нет в реестре PAST: гейт на факт или причина`); continue }
      if ('fact' in entry && !x.keys.includes(entry.fact)) bad.push(`${x.where}: «${x.text}» — гейт не читает ${entry.fact}`)
    }
    expect(bad).toEqual([])
  })
  it('в реестре нет строк, которых уже нет в контенте', () => {
    const texts = new Set(corpus().map((x) => x.text))
    expect(Object.keys(PAST).filter((t) => !texts.has(t))).toEqual([])
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
