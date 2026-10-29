// Правки по живому плейтесту оператора 29.10 (#1546): якоря строк игрока, monthEnd-дука, курс «Лаваш-коина».
// У каждой правки — своя проверка: строка или гейт, который её держит (НК: вернуть старую форму — красный).
import { describe, it, expect } from 'vitest'
import { makeGame } from '../test/helpers'
import { ARCS } from './arcs'
import { D, WHEN_YEARS } from './excuses'
import { LEGENDS } from './legends'
import { CLAIMS } from './lies'
import { CLAIM_LEDGER } from './ledger'
import { MONEY_ASK } from './money-ask'
import { is, valueOf } from './fact'
import { borisForeman, nivaAway, nivaBack } from './memkeys'

const texts = (pool: readonly unknown[]): string[] => pool.map((e) => String(valueOf(e)))
const said = (line: unknown): string => (typeof line === 'string' ? line : (line as { t: string }).t)

describe('плейтест 29.10: якоря строк игрока (#1546)', () => {
  it('#1: сомнение называет место — «на объекте», а не «там»', () => {
    const own = texts(D.P_DOUBT).find((t) => /работал/.test(t))
    expect(own, 'строки о своём прошлом нет — проверка пустеет').toBeTruthy()
    expect(own).toContain('на объекте')
    expect(own, '«там» после отмазки про банк не к чему отнести').not.toMatch(/(?<![а-яё])там(?![а-яё])/)
  })

  it('#2: «где мои деньги лежали» — только после истории фундамента, ёмкость пула держится', async () => {
    const { game } = makeGame()
    const LINE = 'Борис на объект выходил? Пусть хотя бы посмотрит, где мои деньги лежали.'
    const CAP = 'Борис-то при деле? Мне не до шерсти — мне до денег.'
    const pool = () => game.open(ARCS.boris.follow)
    expect(pool(), 'фундамент не звучал, а строка называет место денег').not.toContain(LINE)
    expect(pool(), 'безгейтная строка ёмкости пропала').toContain(CAP)
    game.S.mem[borisForeman] = true
    expect(pool(), 'Борис ещё не на объекте').not.toContain(LINE)
    await game.say([{ t: 'Твои деньги в фундаменте. Я видел, как они тонули.', claims: ['money_foundation'] }])
    expect(game.facts()['heard.money_foundation'], 'реплика не записала фундамент').toBe(true)
    expect(pool(), 'оба факта есть — строка открыта').toContain(LINE)
  })

  it('#4: «В которой деньги?» — пока деньги в бардачке «Нивы»', async () => {
    const LINE = 'Где «Нива»? В которой деньги?'
    const away = makeGame().game
    await away.playArc('niva') // первая серия: деньги в бардачке
    await away.playArc('niva') // вторая: «Нива» уехала
    expect(away.holds(is(nivaAway)), 'арка не дошла до отъезда').toBe(true)
    expect(away.open(ARCS.niva.follow), 'деньги ещё в машине, а строки нет').toContain(LINE)
    await away.say([{ t: 'Твои деньги в фундаменте. Я видел, как они тонули.', claims: ['money_foundation'] }])
    expect(away.open(ARCS.niva.follow), 'деньги названы в фундаменте, а строка всё ещё в машине').not.toContain(LINE)

    const back = makeGame().game
    await back.playArc('niva')
    await back.playArc('niva')
    back.S.mem[nivaBack] = true // «Нива» вернулась без денег: бардачок пуст
    expect(back.open(ARCS.niva.follow), 'после возврата деньги из машины ушли').not.toContain(LINE)
  })

  it('#5: долг катается в «Ниве», а не за ней', () => {
    const lines = texts(ARCS.niva.follow)
    expect(lines).toContain('Алик, как там «Нива»? Долг в ней катается.')
    expect(lines.filter((t) => /Долг за ней/.test(t)), '«за ней» читается как «на ней»').toEqual([])
  })

  it('#8: эхо срока — «Лет через двадцать?», а не возраст', () => {
    expect(WHEN_YEARS).toBe('Лет через двадцать?')
  })
})

describe('курс «Лаваш-коина»: рост в минус (#1546 №12)', () => {
  it('хвастовство о росте курса — ухудшение: за три коина два лаваша', () => {
    const boast = LEGENDS.crypto.lines.map(said).find((t) => /Курс вырос/.test(t))
    expect(boast, 'строка хвастовства пропала — проверка пустеет').toBeTruthy()
    expect(boast).toContain('за три коина дают два лаваша')
    const retell = CLAIMS.find((c) => c.key === 'lavash_rate_up')?.say
    expect(retell, 'пересказ игрока живёт в бухгалтерии лжи').toContain('за три коина')
    expect([boast, retell].join('\n'), 'старая форма «два коина — три лаваша»').not.toMatch(/два коина[^.]{0,24}три лаваша/)
    // предмет журнала прежний: поимка Алика на курсе не потеряна
    expect(CLAIM_LEDGER.lavash_rate_up).toEqual({ subject: 'money.rate', value: 'three_to_two' })
  })

  it('соседние строки «Лаваш-коина» числа курса не называют — правка их не задевает', () => {
    const { game } = makeGame()
    for (const t of texts(MONEY_ASK.crypto)) expect(t, t).not.toMatch(/\d+ коин/)
    for (const t of game.open(LEGENDS.crypto.talk ?? []).map((p) => String(valueOf(p[0])))) expect(t, t).not.toMatch(/\d+ коин/)
  })
})
