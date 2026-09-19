// День выплаты: шаги сцены (hook) собираются из событий партии; исход выбирают правила PaydayOutcome.
import type { Game } from '../../engine/game'
import { type Rule, eq, gte, is, exists } from '../../engine/rules'
import { SOURCES, SOURCES_TOPUP, ROLL, CLAIMS, GRAND, GRAND_FALLBACK, SLOTS, CONTRADICTIONS, MORNING_CONTRA, OUTCOME, type Source, type Call, type Claim } from '../payday'

type R = Rule<Game>
const TARGET = 240000
const NAMES = ['Гарик', 'Борис', 'Гоар', 'мама', 'Рубик', 'Размик', 'Нуне', 'Карине', 'Страсбург', 'малыш', '«Нив', 'Грант']
const fmt = (n: number) => n.toLocaleString('ru-RU')

async function money(game: Game, sum: number): Promise<void> {
  game.S.mem['payday.sum'] = sum
  await game.sleep(500)
  game.sys(`К выплате: ${fmt(sum)} ₽`)
  game.emit()
}

/** Шаги сцены «День выплаты». Каждый шаг заканчивается переходом в следующий узел сцены. */
export const PAYDAY_HOOKS: Record<string, (game: Game) => Promise<void>> = {
  announce: async (game) => {
    game.S.mem['payday.at'] = game.S.day + 1
    game.unlock('payday')
  },
  // утро: каждая линия партии отдаёт деньги, счётчик растёт до 240 000
  morning: async (game) => {
    await game.sleep(700)
    game.nextDay(1)
    game.sys('— День выплаты —')
    let sum = 0
    for (let i = 0; i < 4 && sum < TARGET; i++) {
      const p = game.linePicked('PD_SRC', SOURCES)
      if (!p) break
      await game.say([p.text])
      game.S.mem['payday.morning'] = `${game.S.mem['payday.morning'] ?? ''}\n${p.text}`
      const over = sum + (p.spec as Source).amount - TARGET
      sum = Math.min(TARGET, sum + (p.spec as Source).amount)
      await money(game, sum)
      // сверх суммы по договору — не пропадает молча: 190 000 + 90 000 ≠ 240 000
      if (over > 0) await game.say([`Лишние ${fmt(over)} — это сдача. Сдачу оставляю себе, так принято. По договору — ${fmt(TARGET)}, ни рублём больше.`])
    }
    if (sum < TARGET) { await game.say([SOURCES_TOPUP]); sum = TARGET; await money(game, sum) }
    game.sys('Алик добавил вас в группу «ДЕНЬ ВЫПЛАТЫ 💰 (не выходить)»')
    const came = new Set<string>()
    for (let i = 0; i < 4; i++) {
      const p = game.linePicked('PD_ROLL', ROLL, { filter: (l) => !came.has((l as Call).who) })
      if (!p) break
      came.add((p.spec as Call).who)
      await game.say([{ w: (p.spec as Call).who, t: p.text }])
    }
    await game.enterNode('payday', 'split')
  },
  // дележ: каждый требует долю, счётчик тает до 50 ₽
  claims: async (game) => {
    let sum = Number(game.S.mem['payday.sum'] ?? TARGET)
    const took = new Set<string>()
    for (let i = 0; i < 5 && sum > 50; i++) {
      const p = game.linePicked('PD_CLAIM', CLAIMS, { filter: (l) => !took.has((l as Claim).who) })
      if (!p) break
      took.add((p.spec as Claim).who)
      await game.say([{ w: (p.spec as Claim).who, t: p.text }])
      sum = Math.max(50, sum - (p.spec as Claim).cut)
      // отказал делиться — берут вдвое: «по рублю» армянским слухом
      if (game.S.mem['payday.refused']) sum = Math.max(50, sum - Math.round((p.spec as Claim).cut / 2))
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
    game.S.mem['payday.chain'] = chain
    await game.typingFor(4000, 'печатает очень длинное сообщение…')
    await game.say([chain])
    // поймать можно на противоречии с партией или с тем, что Алик сам сказал утром этого же дня
    const morning = String(game.S.mem['payday.morning'] ?? '')
    const c = MORNING_CONTRA.find((x) => x.morning.test(morning) && x.link.test(chain)) ?? CONTRADICTIONS.find((x) => x.link.test(chain) && x.when(game.S.mem))
    if (game.S.scene) game.S.scene.vars.catch = c?.say
    game.S.mem['payday.contra'] = !!c
  },
  catch: async (game) => {
    if (game.S.mem['payday.contra']) {
      game.S.mem['payday.caught'] = true
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
    if (o.sys) game.sys(o.sys.replace('{debt}', fmt(game.S.debt)).replace('{sum}', fmt(Number(game.S.mem['payday.sum'] ?? TARGET))))
    for (const l of o.lines) await game.say([typeof l === 'string' ? l : { w: l[0], t: l[1] }])
    if (id === 'real' || id === 'coins') { game.S.money += game.S.debt; game.S.debt = 0 }
    if (id === 'lavash') { game.S.debt = 0; game.S.items.push('Лаваш × 240 000') }
    if (id === 'niva') { game.S.debt = Math.max(0, game.S.debt - 5000); game.S.items.push('«Нива» (выплата)') }
    if (id === 'notyou') game.S.items.push('Место на кране (40 м)')
    if (id === 'default') { game.S.debt -= 50; game.S.money += 50 }
    game.S.mem.payday = id
    game.S.mem['payday.sum'] = undefined
    game.setLegend(null) // деньги «отданы» — легенда денег кончилась
    game.rules.schedule({ at: game.S.day + 1, kind: 'event', event: 'PaydayButton', facts: { outcome: id } })
  },
})
export const paydayRules: R[] = [
  // запуск: третий акт — когда сошлись линии (3+ законченных сериала после 330-го дня) или просто поздно
  {
    name: 'Beat_Payday', event: 'StoryBeat', when: [gte('day', 330), gte('arcsDone', 3)], bonus: 10, once: true, priority: 'cinematic',
    respond: ({ game }) => game.enterNode('payday', 'announce'),
  },
  {
    name: 'Beat_Payday_Late', event: 'StoryBeat', when: [gte('day', 420), gte('sent', 150)], bonus: 9, once: true, priority: 'cinematic',
    respond: async ({ game }) => { if (game.S.mem.payday || game.S.mem['payday.at']) return false; await game.enterNode('payday', 'announce') },
  },
  outcome('real', [is('ach.saint'), gte('caught', 3), is('ach.court'), gte('quests', 5)]),
  // поймал великую отмазку — заслуга игрока: важнее исходов «по стилю партии» (одинаковая специфичность решалась бы случайно)
  outcome('coins', [is('payday.caught')], { bonus: 1 }),
  outcome('lavash', [is('payday.caught'), is('ach.q_crypto')], { bonus: 1 }),
  // исходы «по стилю партии» — одной специфичности: подходит несколько — выбор случайный, а не всегда один
  outcome('niva', [eq('finale.niva', 'chose')], { specificity: 1 }),
  outcome('strasbourg', [is('ach.strasbourg')], { specificity: 1 }),
  outcome('notyou', [exists('finale.razmik'), gte('count.rude', 8)], { specificity: 1 }),
  outcome('default', []),
  {
    name: 'Payday_Button', event: 'PaydayButton', when: [], priority: 'system',
    respond: async ({ game, facts }) => { await game.say([OUTCOME[String(facts.outcome)]?.button ?? OUTCOME.default.button]) },
  },
]
