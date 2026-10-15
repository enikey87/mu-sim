// День выплаты: шаги сцены (hook) собираются из событий партии; исход выбирают правила PaydayOutcome.
import type { ContentApi } from '../../engine/game'
import { type Rule, eq, gte, is, exists, missing, set } from '../fact'
import type { GameEvent, Offer } from './events'
import { SOURCES, SOURCES_TOPUP, ROLL, CLAIMS, GRAND, GRAND_FALLBACK, SLOTS, CONTRADICTIONS, MORNING_CONTRA, OUTCOME, type Source, type Call, type Claim } from '../payday'
import { alikDead, cryptoHodl, payday as pd, paydayScene } from '../memkeys'
import { samvelLine } from '../world'

type R = Rule<ContentApi, GameEvent, Offer>
const NAMES = ['Гарик', 'Борис', 'Гоар', 'мама', 'Рубик', 'Размик', 'Нуне', 'Карине', 'Страсбург', 'малыш', '«Нив', 'Грант']
const fmt = (n: number) => n.toLocaleString('ru-RU')

async function money(game: ContentApi, sum: number): Promise<void> {
  game.applyFacts([set(pd.sum, sum)])
  await game.sleep(500)
  game.sys(`К выплате: ${fmt(sum)} ₽`)
  game.emit()
}

/** Шаги сцены «День выплаты». Каждый шаг заканчивается переходом в следующий узел сцены. */
export const PAYDAY_HOOKS: Record<string, (game: ContentApi) => Promise<void>> = {
  announce: async (game) => {
    game.applyFacts([set(pd.at, game.day + 1)])
    game.unlock('payday')
  },
  // утро: линии партии отдают деньги, счётчик растёт до долга (с допработами), а не до 240 000 из договора
  morning: async (game) => {
    await game.sleep(700)
    // анонс ставит payday.at = day+1 («завтра»); away/зарядка могут сдвинуть календарь, пока сцена висит
    const at = Number(game.mem()[pd.at] ?? game.day + 1)
    if (game.day < at) game.nextDay(at - game.day)
    game.sys('— День выплаты —')
    const owed = game.debt
    let sum = 0
    for (let i = 0; i < 4 && sum < owed; i++) {
      const p = game.linePicked('PD_SRC', SOURCES)
      if (!p) break
      await game.say([p.text])
      game.applyFacts([set(pd.morning, `${game.mem()[pd.morning] ?? ''}\n${p.text}`)])
      const over = sum + (p.spec as Source).amount - owed
      sum = Math.min(owed, sum + (p.spec as Source).amount)
      await money(game, sum)
      // сверх суммы по договору — не пропадает молча: 190 000 + 90 000 ≠ 240 000
      if (over > 0) await game.say([`Лишние ${fmt(over)} — это сдача. Сдачу оставляю себе, так принято. Я должен ${fmt(owed)}, ни рублём больше.`])
    }
    if (sum < owed) { await game.say([game.X.fill(SOURCES_TOPUP, { sum: fmt(owed) })]); sum = owed; await money(game, sum) }
    game.sys('Алик добавил вас в группу «ДЕНЬ ВЫПЛАТЫ 💰 (не выходить)»')
    const came = new Set<string>()
    for (let i = 0; i < 4; i++) {
      const p = game.linePicked('PD_ROLL', ROLL, { filter: (l) => !came.has((l as Call).who) })
      if (!p) break
      came.add((p.spec as Call).who)
      await game.say([{ w: (p.spec as Call).who, t: p.text }])
    }
    // хозяин дележа — только по факту самвеловской линии (#701): без неё говорит Алик
    await game.enterNode('payday', game.holds(samvelLine) ? 'splitSamvel' : 'split')
  },
  // дележ: каждый требует долю, счётчик тает до 50 ₽
  claims: async (game) => {
    let sum = Number(game.mem()[pd.sum] ?? game.debt)
    const took = new Set<string>()
    for (let i = 0; i < 5 && sum > 50; i++) {
      const p = game.linePicked('PD_CLAIM', CLAIMS, { filter: (l) => !took.has((l as Claim).who) })
      if (!p) break
      took.add((p.spec as Claim).who)
      await game.say([{ w: (p.spec as Claim).who, t: p.text }])
      sum = Math.max(50, sum - (p.spec as Claim).cut)
      // отказал делиться — берут вдвое: родня слышит «по рублю»
      if (game.mem()[pd.refused]) sum = Math.max(50, sum - Math.round((p.spec as Claim).cut / 2))
      await money(game, sum)
    }
    // остаток уходит не «сам собой», а с объяснением — иначе арифметика видна и не сходится
    if (sum > 50) { await game.say(['Остальное — комиссия банка за крупный перевод. Банк — мой кум. Он тоже на выплате.']); await money(game, 50) }
    await game.enterNode('payday', 'grand')
  },
  // великая отмазка: звено за звеном из событий партии; противоречие — повод поймать
  grand: async (game) => {
    // один персонаж — одно звено: «Гарик унёс… там их увидел Гарик» звучит как ошибка, а не как шутка
    const used = new Set<string>()
    const links = SLOTS.map((slot) => {
      const t = game.line('PD_' + slot, GRAND[slot], { filter: (l) => !NAMES.some((n) => used.has(n) && l.t.includes(n)), fallback: () => game.draw('PD_FB_' + slot, GRAND_FALLBACK[slot]) })!
      for (const n of NAMES) if (t.includes(n)) used.add(n)
      return t
    })
    const chain = links.join(' ').replace(/,\s*$/, '.')
    game.applyFacts([set(pd.chain, chain)])
    await game.typingFor(4000, 'печатает очень длинное сообщение…')
    await game.say([chain])
    // поймать можно на противоречии с партией или с тем, что Алик сам сказал утром этого же дня
    const morning = String(game.mem()[pd.morning] ?? '')
    const c = MORNING_CONTRA.find((x) => x.morning.test(morning) && x.link.test(chain)) ?? CONTRADICTIONS.find((x) => x.link.test(chain) && x.when(game.mem()))
    game.setSceneVar('catch', c?.say)
    game.applyFacts([set(pd.contra, !!c)])
  },
  catch: async (game) => {
    if (game.mem()[pd.contra]) {
      game.applyFacts([set(pd.caught, true)])
      await game.say(['…Ты поймал меня в День выплаты. Такого не было даже в Страсбурге. Хорошо. Хорошо! Ты заслужил.'])
    } else await game.say(['Неправда? Каждое слово — из нашей с тобой жизни, брат. Проверь по журналу.'])
    await PAYDAY_HOOKS.outcome(game)
  },
  outcome: async (game) => { await game.fire('PaydayOutcome') },
}

// ---- исходы: самый частный побеждает ----
const outcome = (id: string, when: R['when'], extra: Partial<R> = {}): R => ({
  name: `Payday_${id}`, event: 'PaydayOutcome', when, priority: 'system', ...extra,
  respond: async ({ game }) => {
    const o = OUTCOME[id]
    await game.sleep(900)
    // «перевёл {sum}» — ровно то, что осталось «к выплате» после всех долей, а не 240 000 из воздуха
    if (o.sys) game.sys(o.sys.replace('{debt}', fmt(game.debt)).replace('{sum}', fmt(Number(game.mem()[pd.sum] ?? game.debt))))
    for (const l of game.open(o.lines)) await game.say([typeof l === 'string' ? l : { w: l[0], t: l[1] }])
    // долг меняем до печати выплаты: после paydayScene adjustDebt уже не пустит
    if (id === 'real' || id === 'coins') { game.adjustMoney(game.debt, 'День выплаты'); game.adjustDebt(-game.debt) }
    if (id === 'lavash') { game.adjustDebt(-game.debt); game.giveItem('Лаваш × 240 000') }
    if (id === 'niva') { game.adjustDebt(-Math.min(5000, game.debt)); game.giveItem('«Нива» (выплата)') }
    if (id === 'notyou') game.giveItem('Место на кране (40 м)')
    if (id === 'default') { if (game.adjustDebt(-50)) game.adjustMoney(50, 'День выплаты') }
    game.applyFacts([set(paydayScene, id)])
    game.sealOpenJobs()
    game.clearFact(pd.sum)
    game.setLegend(null) // деньги «отданы» — легенда денег кончилась
    game.scheduleEvent(game.day + 1, 'PaydayButton', { outcome: id })
  },
})
/** Прерванная сцена Дня выплаты продолжает с узла прерывания (#571): сказанное не звучит дважды. */
const resumePayday = (game: ContentApi): Promise<void> => {
  const at = game.mem()[pd.resume]
  if (at === undefined) return game.enterNode('payday', 'announce')
  game.clearFact(pd.resume)
  return game.resumeNode('payday', String(at))
}

export const paydayRules: R[] = [
  // запуск: третий акт — когда сошлись линии (3+ законченных сериала после 330-го дня) или просто поздно
  {
    name: 'Beat_Payday', event: 'StoryBeat', when: [gte('day', 330), gte('arcsDone', 3), missing(paydayScene), missing(pd.at), missing(alikDead)], bonus: 10, once: true, priority: 'cinematic',
    respond: ({ game }) => resumePayday(game),
  },
  // условия Дня выплаты — в when, а не в respond: промолчавшее правило остаётся в пуле (разовый шанс
  // не тратится) и после выплаты перехватывало бы каждый StoryBeat, ничего не говоря
  {
    name: 'Beat_Payday_Late', event: 'StoryBeat', when: [gte('day', 420), gte('sent', 150), missing(alikDead), missing(paydayScene), missing(pd.at)], bonus: 9, once: true, priority: 'cinematic',
    respond: ({ game }) => resumePayday(game),
  },
  // иерархия исходов — бонусами специфичности, а не числом условий: real 4 > lavash 3 > coins 2 = niva 2 > strasbourg/notyou 1 > default 0
  outcome('real', [is('ach.saint'), is('ach.court')], { bonus: 2 }),
  // поимка и «Нива выбрала тебя» — заслуга игрока: важнее исходов «по стилю партии»; между собой жребий допустим
  outcome('coins', [is(pd.caught)], { bonus: 1 }),
  outcome('lavash', [is(cryptoHodl)], { bonus: 2 }),
  outcome('niva', [eq('finale.niva', 'chose')], { bonus: 1 }),
  // исходы «по стилю партии» — одной специфичности: подходит несколько — выбор случайный, а не всегда один
  outcome('strasbourg', [is('ach.strasbourg')], { specificity: 1 }),
  outcome('notyou', [exists('finale.razmik')], { specificity: 1 }),
  outcome('default', []),
  {
    name: 'Payday_Button', event: 'PaydayButton', when: [], priority: 'system',
    respond: async ({ game, facts }) => {
      const line = game.open((OUTCOME[String(facts.outcome)] ?? OUTCOME.default).button)[0]
      if (line !== undefined) await game.say([line])
    },
  },
]
