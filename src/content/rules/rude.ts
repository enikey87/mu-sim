// Лестница грубости. Ступень — по «температуре» ссоры rude.heat: каждый крик +1, через 20 дней −1.
// Ступени — правила с растущей специфичностью: следующая перекрывает предыдущую без явного порядка.
// S0 обида → S1 семья пишет в личку → S2 звонки мамы → S3 блок и чужие номера → S4 семейный суд → S5 вежливость-убийца;
// сбоку — «Мууу»-дипломатия, встречный иск, ритуал примирения, холодная война, привыкание; финал — вендетта.
import type { Game } from '../../engine/game'
import { type Rule, type Line, type Entry, eq, ne, gte, lte, is, add, set, missing, mapEntry, valueOf } from '../../engine/rules'
import type { GameEvent, Offer } from './events'
import { WORLD, SPEAKS } from '../world'
import * as T from '../rude'
import { RUDE_AGAIN } from '../misc'
import { HEAT, blocked, blockedHint, count, mamaCalls, phoneKarine, polite, ritualCount, statusHidden, vendetta } from '../memkeys'

type R = Rule<Game, GameEvent, Offer>
const rude = eq('tone', 'rude')
const cools = [add(count.rude), add(HEAT)]
// остывание — отложенное событие, а не отложенное «−1»: после примирения (температура = 0) старые остывания не уводят её в минус
const cool: R['trigger'] = [{ event: 'RudeCool', delay: 20 }]

/** Реплика участника без повторов: пул [кто, текст]. */
export async function sayFresh(game: Game, key: string, pool: readonly Entry<T.Said>[]): Promise<boolean> {
  const bag = structuredClone(game.S.bags[key])
  const t = game.seen.pickFresh(() => game.draw(key, pool.map((e) => mapEntry(e, ([, x]) => x))), (x) => x)
  // свежих нет — ничего не сказано, и колода остаётся там, где была
  if (game.seen.has(t)) { if (bag) game.S.bags[key] = bag; else delete game.S.bags[key]; return false }
  game.seen.mark(t)
  const who = pool.map(valueOf).find(([, x]) => x === t)![0]
  await game.say([who === 'alik' ? t : { w: who, t }])
  return true
}
/** Остудить ссору на n, не ниже нуля. */
export const cooldown = (game: Game, n: number) => { game.S.mem[HEAT] = Math.max(0, Number(game.S.mem[HEAT] ?? 0) - n) }
/** Повторяемая реплика (вежливый режим, вендетта): не чаще раза в 6 ходов, свежие — раньше. */
const line = (game: Game, key: string, arr: readonly Line[]) => game.line(key, arr, { repeat: true, cooldown: { turns: 6 }, fallback: game.X.offended })!
/** Реплика по правилам Hades (условия, приоритет, один раз); пул исчерпан — генератор, а не повтор. */
const freshOr = (game: Game, key: string, arr: readonly Line[], fallback: () => string) => game.line(key, arr, { fallback })!

async function offended(game: Game, text?: string, away = true): Promise<void> {
  game.mood(-2)
  if (game.chance(0.3)) await game.sticker({ e: '🏠🔥', c: 'Всё горит' })
  await game.say([text ?? game.uniq(game.X.offended)])
  // коротко и только в первый раз: обида больше не перематывает игру на недели вперёд
  if (away) game.goOffline(1 + game.rnd(2))
  else game.setCtx({ offended: true })
}

const family = (who: string): R => ({
  // «может ли писать» — ворота, а не частный случай: ступень лестницы та же, что у остальной родни
  name: `Rude_Family_${who}`, event: 'PlayerMessage', when: [rude, gte(HEAT, 1), ...(SPEAKS[who] ? [SPEAKS[who]] : [])], specificity: 3, cooldown: { days: 4 }, remember: cools, trigger: cool,
  respond: async ({ game }) => {
    game.mood(-1)
    // у родственника кончились новые фразы — пишет сам Алик
    const t = game.line('RF_' + who, T.RUDE_FAMILY[who])
    if (!t) { await game.say([game.uniq(game.X.offended)]); game.setCtx({ offended: true }); return }
    await game.say([{ w: who, t }])
    if (!game.holds(is(phoneKarine)) && game.chance(0.6)) { await game.sleep(700); await game.say([freshOr(game, 'RF_ALIK', T.RUDE_FAMILY_ALIK, game.X.offended)]) }
    game.setCtx({ offended: true })
  },
})

export const rudeRules: R[] = [
  // Реальные угрозы не превращаем в судебную шутку: они ускоряют ссору и получают отдельный ответ.
  {
    name: 'Tone_ViolentThreat', event: 'PlayerMessage', when: [eq('category', 'violent-threat')], bonus: 6,
    remember: [add(count.rude), add(count.violence), add(HEAT, 2)],
    trigger: [{ event: 'RudeCool', delay: 20 }, { event: 'RudeCool', delay: 40 }],
    respond: ({ game }) => offended(game, game.uniq(() => game.draw('VIOLENT_THREAT', T.VIOLENT_THREAT)), false),
  },
  {
    name: 'Tone_Intimidation', event: 'PlayerMessage', when: [eq('category', 'intimidation')], bonus: 6,
    remember: [add(count.rude), add(count.intimidation), add(HEAT)], trigger: cool,
    respond: ({ game }) => offended(game, game.uniq(() => game.draw('INTIMIDATION', T.INTIMIDATION)), false),
  },
  // S0 — обида (как раньше, но коротко); второй крик за игру Алик помнит
  { name: 'Tone_Rude', event: 'PlayerMessage', when: [rude], remember: cools, trigger: cool, respond: ({ game }) => offended(game) },
  {
    name: 'Tone_Rude_Again', event: 'PlayerMessage', when: [rude, gte(count.rude, 2)], remember: cools, trigger: cool,
    respond: async ({ game }) => { game.unlock('memory'); await offended(game, freshOr(game, 'RUDE_AGAIN', RUDE_AGAIN, game.X.offended), false) },
  },
  // S1 — вместо Алика пишет родня (одна из трёх, у каждой свой перерыв)
  ...Object.keys(T.RUDE_FAMILY).map(family),
  // S2 — пропущенные от мамы и голосовое с «расшифровкой»
  {
    name: 'Rude_Calls', event: 'PlayerMessage', when: [rude, gte(HEAT, 2)], bonus: 2, cooldown: { days: 5 }, remember: cools, trigger: cool,
    respond: async ({ game }) => {
      game.mood(-1)
      // счётчик пропущенных только растёт: он копится за партию, а не выдумывается каждый раз
      const calls = Number(game.S.mem[mamaCalls] ?? 6) + 1 + game.rnd(4)
      game.rules.applyOps([set(mamaCalls, calls)], {})
      game.sys(game.draw('RC_SYS', T.RUDE_CALLS_SYS).replace('{n}', String(calls)))
      await game.sleep(600)
      await sayFresh(game, 'RC_VOICE', T.RUDE_CALLS_VOICE)
      await game.say([freshOr(game, 'RC_ALIK', T.RUDE_CALLS_ALIK, game.X.offended)])
      game.setCtx({ offended: true })
    },
  },
  // S3 — блок на 4 дня; Алик всё равно отвечает — с телефона Бориса, «Нивы», домофона
  {
    name: 'Rude_Block', event: 'PlayerMessage', when: [rude, gte(HEAT, 3)], bonus: 3, cooldown: { days: 10 },
    remember: [...cools, set(blocked, true, { forDays: 4 }), set(blockedHint, false), set(statusHidden, false)], trigger: cool,
    respond: async ({ game }) => {
      game.mood(-2)
      game.sys(game.draw('RB_SYS', T.RUDE_BLOCK_SYS))
      game.unlock('blocked')
      await game.sleep(900)
      await sayFresh(game, 'ALT', T.RUDE_ALT)
      game.setCtx({ offended: true })
    },
  },
  {
    // блок важнее суда: суд — когда разблокирует
    name: 'Rude_WhileBlocked', event: 'PlayerMessage', when: [rude, is(blocked)], bonus: 7, remember: cools, trigger: cool,
    respond: async ({ game }) => { game.sys(T.NOT_DELIVERED); await game.sleep(900); await sayFresh(game, 'ALT', T.RUDE_ALT); game.setCtx({ offended: true }) },
  },
  // в чёрном списке не доходит ничего: ни вежливое, ни «Мууу», ни вопрос — Алик пишет с чужих номеров, не отвечая на сказанное
  {
    name: 'Tone_WhileBlocked', event: 'PlayerMessage', when: [is(blocked)], bonus: 6,
    respond: async ({ game }) => { game.sys(T.NOT_DELIVERED); await game.sleep(900); await sayFresh(game, 'ALT', T.RUDE_ALT) },
  },
  {
    name: 'Says_WhileBlocked', event: 'PlayerSays', when: [is(blocked), ne('intent', 'via'), ne('intent', 'sorry')], bonus: 6,
    respond: async ({ game }) => { game.sys(T.NOT_DELIVERED); await game.sleep(900); await sayFresh(game, 'ALT', T.RUDE_ALT) },
  },
  // S4 — семейный суд в групповом чате, один раз за игру
  { name: 'Rude_Tribunal', event: 'PlayerMessage', when: [rude, gte(HEAT, 4)], bonus: 6, once: true, priority: 'cinematic', remember: cools, trigger: cool, respond: ({ game }) => game.tribunal() },
  // S5 — после суда 10 дней вежливости: на крик — ответ «в рамках регламента»
  {
    name: 'Rude_Polite', event: 'PlayerMessage', when: [rude, is(polite)], bonus: 8, remember: [add(count.rude)],
    respond: async ({ game }) => { await game.say([line(game, 'POLITE_RUDE', T.POLITE_RUDE)]) },
  },
  // финал — вендетта: серия криков, 25+ за игру и ни одного извинения
  {
    name: 'Rude_Vendetta', event: 'PlayerMessage', when: [rude, gte(HEAT, 5), gte(count.rude, 25), lte(count.sorry, 0)], bonus: 8, once: true, priority: 'cinematic',
    remember: [add(count.rude), set(vendetta, true)],
    respond: async ({ game }) => {
      await game.sticker({ e: '🗡️', c: 'Вендетта' })
      for (const [w, t] of T.VENDETTA) await game.say([w === 'alik' ? t : { w, t }])
      game.unlock('vendetta')
    },
  },

  // остывание ссоры: −1 через 20 дней после крика, не ниже нуля
  { name: 'Rude_Cool', event: 'RudeCool', when: [gte(HEAT, 1)], priority: 'system', respond: ({ game }) => cooldown(game, 1) },

  // ветка: угроза судом, пока ссора горячая — встречный иск, суд мирит
  {
    name: 'Tone_Threat_Hot', event: 'PlayerMessage', when: [eq('tone', 'threat'), gte(HEAT, 2)], bonus: 2, once: true,
    remember: [add(count.threat), set(HEAT, 0)],
    respond: async ({ game }) => { for (const [w, t] of T.COUNTERSUIT) await game.say([w === 'alik' ? t : { w, t }]); game.unlock('countersuit') },
  },
  {
    // встречный иск уже был — теперь апелляции; суд немного остужает
    name: 'Tone_Threat_Hot_Again', event: 'PlayerMessage', when: [eq('tone', 'threat'), gte(HEAT, 2)], bonus: 1, remember: [add(count.threat)],
    respond: async ({ game }) => { cooldown(game, 1); await game.say([freshOr(game, 'APPEAL', T.APPEAL, game.X.threat)]) },
  },
  // ветка: кричал всю игру и вдруг вежлив — Алику не хватает крика
  {
    // ссора остыла (давно не кричал), но за игру накричал много
    name: 'Tone_MissRude', event: 'PlayerMessage', when: [ne('tone', 'rude'), ne('tone', 'threat'), gte(count.rude, 15), lte(HEAT, 0), gte('sinceRude', 8)], odds: 0.35, cooldown: { turns: 8 },
    respond: async ({ game }) => { const t = game.line('MISS_RUDE', T.MISS_RUDE); if (!t) return game.turnRoll(); await game.say([t]); game.unlock('habit'); await game.turnRoll() },
  },

  // телефон у Карине: Алик не пишет, отвечает она — и не на каждое слово
  ...(['AlikTurn', 'PlayerMessage', 'PlayerSays'] as const).map((event): R => ({
    name: 'Phone_Karine_' + event, event, when: [is(phoneKarine)], bonus: 9,
    respond: async ({ game }) => { const t = game.line('PHONE_KARINE', T.PHONE_KARINE); if (t) await game.say([{ w: 'karine', t }]) },
  })),
  ...(['AlikIdle', 'AlikAway', 'StoryBeat', 'PeriodLine', 'PromiseDue'] as GameEvent[]).map((event): R => ({ name: 'Quiet_PhoneKarine_' + event, event, when: [is(phoneKarine)], bonus: 9, respond: () => {} })),
  // состояния: блок, вежливость, вендетта перекрывают обычный ход
  { name: 'Turn_Blocked', event: 'AlikTurn', when: [is(blocked)], respond: async ({ game }) => { if (!(await sayFresh(game, 'ALT', T.RUDE_ALT))) await game.excuseTurn() } },
  {
    name: 'Turn_Polite', event: 'AlikTurn', when: [is(polite)],
    respond: async ({ game }) => { await game.say([line(game, 'POLITE', T.POLITE_TURN)]); if (game.chance(0.2)) await game.transfer() },
  },
  { name: 'Turn_Vendetta', event: 'AlikTurn', when: [is(vendetta)], specificity: 0, weight: 8, cooldown: { turns: 4 }, respond: async ({ game }) => { await game.say([line(game, 'VENDETTA', T.VENDETTA_TURN)]) } },

  // ветка: холодная война — игрок молчит после ссоры, Алик не выдерживает первым
  {
    // Алик ещё обижен (после извинения «Ну и молчи» — невпопад); пропавший («был давно») молчит — см. Idle/Away_Offline
    name: 'Idle_ColdWar', event: 'AlikIdle', when: [gte(HEAT, 1), is('ctx.offended'), ne('offline', true)], odds: 0.7, cooldown: { turns: 2 }, priority: 'chatter',
    respond: async ({ game }) => {
      const t = game.decks.pick('COLD_WAR', T.COLD_WAR, game.lineFacts(), { mode: 'sequential', noRepeat: true })
      if (!t) return false
      await game.say([t])
    },
  },
  // обиженный, но на связи: в пачке максимум одна колкость (перерыв тот же); пропавший — Away_Offline / Quiet_Offended
  {
    name: 'Away_ColdWar', event: 'AlikAway', when: [gte(HEAT, 1), is('ctx.offended'), ne('offline', true)], bonus: 1, odds: 0.7, cooldown: { turns: 2 },
    respond: ({ game }) => game.awayMsg('coldWar'),
  },
  { name: 'Quiet_Offended_AlikAway', event: 'AlikAway', when: [gte(HEAT, 1), is('ctx.offended')], respond: () => {} },
]

// извинения: во время блока не доставляются; после серии криков — только ритуал
export const rudeSaysRules: R[] = [
  // «Мууу» игрока: пока ссора горячая — корова мирит, иначе Алик не понимает
  {
    name: 'Says_moo_peace', event: 'PlayerSays', when: [eq('intent', 'moo'), gte(HEAT, 1)],
    respond: async ({ game }) => { cooldown(game, 2); game.mood(1); await game.say([freshOr(game, 'COW_PEACE', T.COW_PEACE, game.X.cow)]); game.unlock('cowpeace'); game.setCtx(null) },
  },
  { name: 'Says_moo', event: 'PlayerSays', when: [eq('intent', 'moo')], respond: async ({ game }) => { await game.say([freshOr(game, 'MOO_ODD', T.MOO_ODD, game.X.cow)]); game.setCtx(null) } },
  // заблокирован — извинение не доходит; подсказывает посредник: Борис, Карине, иначе мама (Карине и мама — раз за блок)
  {
    name: 'Says_sorry_blocked_boris', event: 'PlayerSays', when: [eq('intent', 'sorry'), is(blocked), SPEAKS.boris], bonus: 7,
    respond: async ({ game }) => { game.sys(T.NOT_DELIVERED); await game.sleep(700); await game.say([{ w: 'boris', t: game.line('BORIS_HINT', T.BORIS_HINT, { repeat: true, cooldown: { turns: 5 }, fallback: () => 'Бее.' })! }]) },
  },
  {
    name: 'Says_sorry_blocked_karine', event: 'PlayerSays', when: [eq('intent', 'sorry'), is(blocked), WORLD.karineHome, missing(blockedHint)], bonus: 5, remember: [set(blockedHint, true)],
    respond: async ({ game }) => { game.sys(T.NOT_DELIVERED); await game.sleep(700); await game.say([{ w: 'karine', t: T.KARINE_HINT }]) },
  },
  {
    name: 'Says_sorry_blocked', event: 'PlayerSays', when: [eq('intent', 'sorry'), is(blocked), missing(blockedHint)], bonus: 5, remember: [set(blockedHint, true)],
    respond: async ({ game }) => { game.sys(T.NOT_DELIVERED); await game.sleep(700); await game.say([{ w: 'mama', t: T.MAMA_HINT }]) },
  },
  {
    name: 'Says_sorry_blocked_hinted', event: 'PlayerSays', when: [eq('intent', 'sorry'), is(blocked), is(blockedHint)], bonus: 5,
    respond: async ({ game }) => { game.sys(T.NOT_DELIVERED); await game.sleep(900); await sayFresh(game, 'ALT', T.RUDE_ALT) },
  },
  // извинение через посредника, которого игрок выбрал (arg)
  ...([['boris', T.VIA_BORIS], ['karine', T.VIA_KARINE], ['mama', T.VIA_MAMA]] as const).map(([who, lines]): R => ({
    name: 'Says_via_' + who, event: 'PlayerSays', when: [eq('intent', 'via'), eq('arg', who)], remember: [set(blocked, false), add(count.sorry)],
    respond: async ({ game }) => { cooldown(game, 1); for (const [w, t] of lines) await game.say([w === 'alik' ? t : { w, t }]); game.sys('Алик Воздухонесян разблокировал вас'); game.setCtx(null) },
  })),
  {
    name: 'Says_sorry_ritual', event: 'PlayerSays', when: [eq('intent', 'sorry'), gte(HEAT, 3)], bonus: 3, remember: [add(count.sorry), add(ritualCount)],
    respond: ({ game }) => game.enterNode('ritual', 'ask'),
  },
]
