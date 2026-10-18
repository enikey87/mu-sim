// Линтер свежести места денег (#995): state-вопрос о месте не стоит без окна `sinceMoneyAsk.<place>`
// ни в одном пуле места — денежный вопрос, follow-пул арки места, talk-пары легенд места.
// Слова состояния — класс #952/#962/#986/#995; исключение — только allowlist с оправданием.
import { describe, it, expect } from 'vitest'
import { Gated, valueOf } from './fact'
import { MONEY_ASK, MONEY_PLACES, type MoneyPlace } from './money-ask'
import { ARCS } from './arcs'
import { LEGENDS } from './legends'

/** Слова состояния места: строка-вопрос с ними переспрашивает состояние — ей нужно окно места. */
const STATE_WORDS: Record<MoneyPlace, readonly string[]> = {
  bank: ['всё ещё', 'мороз', 'морож', 'безопасност'],
  beton: ['всё ещё', 'не вскрывали', 'лежит', 'цел', 'застыл'],
  safe: ['всё ещё', 'закрыт', 'достали', 'не выходит', 'из декрета'],
  crypto: ['всё ещё', 'ещё жив'],
  niva: ['всё ещё', 'наш', 'не вернулась', 'звонит', 'катается', 'уехала', 'приехала', 'где «нива»'],
}

/** Следы места: state-вопрос засчитывается только если строка говорит о самом месте денег. */
const PLACE_MARKS: Record<MoneyPlace, readonly string[]> = {
  bank: ['счет', 'банк', 'деньг'],
  beton: ['фундамент', 'бетон', 'деньг'],
  safe: ['сейф', 'ключ', 'декрет', 'деньг'],
  crypto: ['крипт', 'коин', 'лаваш', 'деньг'],
  niva: ['нива', 'колёс', 'бардач', 'деньг'],
}

/** Арки, чьи follow-пулы говорят о месте (легенда места ставится серией этой арки). */
const PLACE_ARCS: Record<MoneyPlace, readonly string[]> = {
  bank: ['boris', 'rubik', 'grandpa'],
  beton: ['beton'],
  safe: ['nune'],
  crypto: [],
  niva: ['niva'],
}

/** Исключения: [пул, текст строки, почему допустима без окна]. */
const NV = 'ёмкость #753: счётчик asked.niva (финал «Нива выбрала тебя») достижим только при открытом пуле — окно гасит вопрос (замер: 1 вопрос за 300 ходов)'
const ALLOW: ReadonlyArray<readonly [string, string, string]> = [
  ['MONEY_ASK.bank', 'Когда разморозят мои деньги?', 'вопрос о сроке, а не о состоянии: осознанно вне окна (#955)'],
  ['ARCS.niva.follow', '«Нива» уехала. Значит, деньги у меня в фундаменте, а не у Алика?', NV],
  ['ARCS.niva.follow', '«Нива» сама ко мне приехала? И в бардачке 50 — это мне или в долг?', NV],
  ['ARCS.niva.follow', '«Нива» нашлась?', NV],
  ['ARCS.niva.follow', '«Нива» мне всё звонит, а платить всё равно Алику.', NV],
  ['ARCS.niva.follow', 'Где «Нива»?', NV],
  ['ARCS.niva.follow', 'Алик, как там «Нива»? Долг за ней катается.', NV],
]

/** Вопрос-состояние: несёт окно своего места (#955/#962/#986/#995). */
const windowed = (e: unknown, place: MoneyPlace): boolean =>
  e instanceof Gated && e.when.some((c) => c.key.startsWith(`sinceMoneyAsk.${place}`))

describe('свежесть места денег (#995)', () => {
  it('state-вопрос о месте не стоит без окна ни в одном пуле места', () => {
    const issues: string[] = []
    let hits = 0
    const low = (t: string) => t.toLowerCase().replace(/ё/g, 'е')
    const allowed = (pool: string, text: string) => ALLOW.some(([p, t]) => p === pool && t === text)
    const check = (pool: string, place: MoneyPlace, e: unknown, text: string): void => {
      const t = low(text)
      if (!STATE_WORDS[place].some((w) => t.includes(low(w)))) return
      if (!PLACE_MARKS[place].some((w) => t.includes(low(w)))) return
      hits++
      if (allowed(pool, text)) return
      if (!windowed(e, place)) issues.push(`${pool}: «${text}»`)
    }
    for (const place of Object.keys(MONEY_PLACES) as MoneyPlace[]) {
      const ask = `MONEY_ASK.${place}`
      for (const e of MONEY_ASK[place]) check(ask, place, e, valueOf(e))
      for (const arc of PLACE_ARCS[place]) for (const e of ARCS[arc].follow) check(`ARCS.${arc}.follow`, place, e, valueOf(e) as string)
      for (const legend of MONEY_PLACES[place]) for (const e of LEGENDS[legend]?.talk ?? []) check(`LEGENDS.${legend}.talk`, place, e, valueOf(e)[0])
    }
    expect(hits, 'ни одной строки-состояния не нашлось — проверка пустеет').toBeGreaterThan(15)
    expect(issues, `\n${issues.join('\n')}`).toEqual([])
  })

  it('исключения живут: оправданная строка ещё в пуле, и она без окна', () => {
    for (const [pool, text, why] of ALLOW) {
      const lines = pool.startsWith('MONEY_ASK.')
        ? MONEY_ASK[pool.slice('MONEY_ASK.'.length) as MoneyPlace]
        : pool.startsWith('ARCS.') ? ARCS[pool.slice('ARCS.'.length, -'.follow'.length)].follow : undefined
      expect(lines, `${pool}: пул исключения неизвестен (${why})`).toBeDefined()
      expect(lines!.map(valueOf), `${pool}: оправданной строки больше нет — исключение протухло (${why})`).toContain(text)
    }
  })
})
