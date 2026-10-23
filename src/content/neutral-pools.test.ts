// #1117: голод нейтральных пулов на длинной партии. Окно дословного повтора уже есть
// (20 ходов у вариантов, 14 дней у бедности) — лечится размером базы, не порогом.
import { describe, it, expect } from 'vitest'
import { P_MONEY, MONEY_REPLY_POLITE } from './topics'
import { valueOf } from './fact'
import { PLAYER_SUFFIX } from './misc'
import { makeGame, setMoney, botTurn } from '../test/helpers'
import { Game } from '../engine/game'

const text = (e: unknown): string => {
  const v = valueOf(e as never)
  return typeof v === 'string' ? v : (v as { t: string }).t
}

/** Девять новых реплик игрока и три ответа на повтор вежливости. Убрать одну — красный. */
const ADDED_PLAYER = [
  'Алик, карта молчит. Я — нет, но я хотя бы на «вы».',
  'Алик, простите за частоту. На карте дно, в сообщениях — спокойный я.',
  'Карта на дне. Я показываю вам это сообщение.',
  'Баланс на дне. Настроение — тоже, но дно хотя бы ровное.',
  'Открыл банк. Там дно и моё имя.',
  'Алик, банк пишет чаще, чем я. Я хотя бы здороваюсь.',
  'Алик, у меня остаток низкий, а терпение — высокое. Поменяемся?',
  'Кот смотрит на миску, я — на карту. Оба голодные, оба спокойные.',
  'Стоматолог ждёт оплату. Я жду вас. Очередь одна.',
]
const ADDED_REPLY = [
  'Вежливые письма читаю дважды. Долг от этого не тает, стыд — растёт.',
  'Спасибо, что без крика. Отвечаю так же: помню, виноват, решаю.',
  'Такая вежливость меня разоружает. Деньги не появляются, зато я краснею честно.',
]

const corpus = (): string[] => [
  ...P_MONEY.low.polite.map(text),
  ...P_MONEY.low.neutral.map(text),
  ...P_MONEY.bottom.polite.map(text),
  ...P_MONEY.bottom.neutral.map(text),
  ...MONEY_REPLY_POLITE.map(text),
]

describe('нейтральные пулы длинной партии (#1117)', () => {
  it('снимок: новые строки в пулах, не суффиксы', () => {
    expect(ADDED_PLAYER, 'новых реплик не 9 — проверка пустеет или раздута').toHaveLength(9)
    const have = new Set(corpus())
    for (const line of [...ADDED_PLAYER, ...ADDED_REPLY]) expect(have.has(line), line).toBe(true)
    expect(P_MONEY.bottom.polite.map(text)).toEqual([
      'Алик, простите, что часто. На карте дно, а я всё ещё вежливый.',
      'Алик, очень прошу. Карта уже не берёт трубку.',
      'Алик, до конца недели — пожалуйста. Мне буквально нечем платить.',
      'Алик, карта молчит. Я — нет, но я хотя бы на «вы».',
      'Алик, простите за частоту. На карте дно, в сообщениях — спокойный я.',
    ])
    expect(P_MONEY.bottom.neutral.map(text)).toEqual([
      'Алик, на карте дно. Ниже только фундамент.',
      'Я сегодня платил улыбкой. Не приняли.',
      'Карта на дне. Я показываю вам это сообщение.',
      'Баланс на дне. Настроение — тоже, но дно хотя бы ровное.',
      'Открыл банк. Там дно и моё имя.',
      'У меня остаток как у барана: дно и рога.',
    ])
  })

  it('400 ходов на дне: дословный повтор строки «дна» не ближе 20 ходов', async () => {
    const { game } = makeGame({ seed: 1117 })
    const bases = new Set([...P_MONEY.bottom.polite, ...P_MONEY.bottom.neutral].map(text))
    const strip = (t: string): string => {
      let s = t
      for (;;) {
        const suf = PLAYER_SUFFIX.find((x) => s.endsWith(x))
        if (!suf) return s
        s = s.slice(0, -suf.length)
      }
    }
    const log: { text: string; at: number }[] = []
    for (let i = 0; i < 400; i++) {
      if (game.S.mem['endgame.active']) break
      setMoney(game, Game.MONEY_BOTTOM)
      game.S.choices = null
      const at = game.S.stats.sent
      const c = await botTurn(game, 0.2, 0)
      if (!c) continue
      const base = strip(c.text)
      if (bases.has(base)) log.push({ text: c.text, at })
    }
    expect(log.length, 'пустой журнал ничего не доказывает').toBeGreaterThan(8)
    const last = new Map<string, number>()
    const bad: string[] = []
    for (const row of log) {
      const prev = last.get(row.text)
      if (prev !== undefined && row.at > prev && row.at - prev < 20) bad.push(`«${row.text}» ${prev}→${row.at}`)
      last.set(row.text, row.at)
    }
    expect(bad.slice(0, 5)).toEqual([])
  }, 120_000)
})
