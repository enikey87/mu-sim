// Лестница грубости. Ступень — по «температуре» ссоры rude.heat: каждый крик +1, через 20 дней −1.
// Ступени — правила с растущей специфичностью: следующая перекрывает предыдущую без явного порядка.
// S0 обида → S1 семья пишет в личку → S2 звонки мамы → S3 блок и чужие номера → S4 семейный суд → S5 вежливость-убийца;
// сбоку — «Мууу»-дипломатия, встречный иск, ритуал примирения, холодная война, привыкание; финал — вендетта.
import type { ContentApi } from '../../engine/game'
import { type Rule, type Line, type Entry, eq, ne, gte, lte, is, add, set, missing, mapEntry, valueOf, saidClaims, saidText } from '../fact'
import type { GameEvent, Offer } from './events'
import { WORLD, speaks } from '../world'
import * as T from '../rude'
import { RUDE_AGAIN } from '../misc'
import { HEAT, alikDead, blocked, blockedHint, coldWar, count, countersuitAt, endgame, mamaCalls, mamaVoiceAt, phoneKarine, polite, ritualCount, statusHidden, vendetta, vendettaAt } from '../memkeys'

type R = Rule<ContentApi, GameEvent, Offer>
const rude = eq('tone', 'rude')
/** Терминальный эпилог закрывает лестницу (#1576): мир заморожен, на крик отвечает колода эпилога, а не ступень ссоры. */
const live = missing(endgame.active)
const cools = [add(count.rude), add(HEAT)]
// остывание — отложенное событие, а не отложенное «−1»: после примирения (температура = 0) старые остывания не уводят её в минус
const cool: R['trigger'] = [{ event: 'RudeCool', delay: 20 }]

/** Реплика участника без повторов: пул [кто, текст]. Возвращает сыгранную пару — вызывающий может
 *  поставить по ней факт, который утверждает именно эта реплика (#1057); null — свежих нет. */
export async function sayFresh(game: ContentApi, key: string, pool: readonly Entry<T.Said>[]): Promise<T.Said | null> {
  const bag = game.bagOf(key)
  const x = game.seen.pickFresh(() => game.draw(key, pool.map((e) => mapEntry(e, ([, v]) => v))), (v) => v)
  const t = saidText(x)
  // свежих нет — ничего не сказано, и колода остаётся там, где была
  if (game.seen.has(t)) { game.restoreBag(key, bag); return null }
  game.seen.mark(t)
  const picked = pool.map(valueOf).find(([, v]) => v === x)!
  const [who, said] = picked
  await game.say([who === 'alik' ? said : { w: who, t, claims: saidClaims(said) }])
  return picked
}
/** Строки холодной войны в окне повтора: их не берёт ни инициатива, ни ответ из общего пула (#1441). */
const coldWarBlocked = (game: ContentApi): Set<string> => game.recentLines(T.COLD_WAR_WINDOW, T.COLD_WAR, T.COLD_WAR_TURNS)
/** Строки COLD_WAR: их показ держит общее окно двух колод (канцелярит ответов окно не занимает, #1441). */
const COLD_WAR_LINES = new Set(T.COLD_WAR.map(valueOf))
const coldWarNote = (game: ContentApi, text: string): void => { if (COLD_WAR_LINES.has(text)) game.noteLine(T.COLD_WAR_WINDOW, text) }
/** Реплика холодной войны: сухой пул без соседних повторов; когда пул кончился, колода тасуется заново —
 *  тёплая строка из обычных пулов вместо холодной не берётся никогда (режим не сдаётся).
 *  Строки COLD_WAR инициатива и ответ делят одним окном (#1441): показанная одним путём не выходит другим. */
async function coldWarLine(game: ContentApi, key: string, pool: readonly Entry<string>[]): Promise<void> {
  const blocked = coldWarBlocked(game)
  const text = game.decks.pick(key, pool, game.lineFacts(), { eligible: (e) => !blocked.has(valueOf(e)) }) ?? valueOf(pool[0])
  coldWarNote(game, text)
  await game.say([text])
}
/** Остудить ссору на n, не ниже нуля. */
export const cooldown = (game: ContentApi, n: number) => game.coolConflict(n)

/** Номер текущего блока: Rude_Block пишет счёт до своего ответа (#1423). */
const blockNo = (game: ContentApi): number => Number(game.mem()[count.block] ?? 0)
/** Вкус блока по счёту: 1 — чужие каналы, 2 — мама, 3 — канцелярия, 4 и дальше — альтернативных каналов нет. */
const blockFlavor = (n: number): { key: string; pool: readonly Entry<T.Said>[] } | null =>
  n >= 4 ? null : n === 3 ? { key: 'BLOCK_OFFICE', pool: T.BLOCK_OFFICE } : n === 2 ? { key: 'BLOCK_MAMA', pool: T.BLOCK_MAMA } : { key: 'ALT', pool: T.RUDE_ALT }
/** Ответ из-за блока каналом текущего блока; false — канала больше нет (полная тишина). */
async function sayBlocked(game: ContentApi): Promise<boolean> {
  const flavor = blockFlavor(blockNo(game))
  return flavor ? (await sayFresh(game, flavor.key, flavor.pool)) !== null : false
}
/** Повторяемая реплика (вежливый режим, вендетта): не чаще раза в 6 ходов, свежие — раньше. */
const line = (game: ContentApi, key: string, arr: readonly Line[]) => game.line(key, arr, { repeat: true, cooldown: { turns: 6 }, fallback: game.X.offended })!
/** Реплика по правилам Hades (условия, приоритет, один раз); пул исчерпан — генератор, а не повтор. */
const freshOr = (game: ContentApi, key: string, arr: readonly Line[], fallback: () => string): string => game.line(key, arr, { fallback })!
const speakerWhen = (who: string) => { const criterion = speaks(who); return criterion ? [criterion] : [] }

async function offended(game: ContentApi, text?: string, away = true): Promise<void> {
  game.mood(-2)
  if (game.chance(0.3)) await game.sticker({ e: '🏠🔥', c: 'Всё горит' })
  await game.say([text ?? game.uniq(game.X.offended)])
  // коротко и только в первый раз: обида больше не перематывает игру на недели вперёд
  if (away) game.goOffline(1 + game.rnd(2))
  else game.setCtx({ offended: true })
}

const family = (who: string): R => ({
  // «может ли писать» — ворота, а не частный случай: ступень лестницы та же, что у остальной родни
  // ступень S1 держится выше повтора обиды (S0) числом, а не длиной when: гейт эпилога (#1576) — тоже условие
  name: `Rude_Family_${who}`, event: 'PlayerMessage', when: [live, rude, gte(HEAT, 1), ...speakerWhen(who)], specificity: 4, cooldown: { days: 4 }, remember: cools, trigger: cool,
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
    name: 'Tone_ViolentThreat', event: 'PlayerMessage', when: [live, eq('category', 'violent-threat')], bonus: 6,
    remember: [add(count.rude), add(count.violence), add(HEAT, 2)],
    trigger: [{ event: 'RudeCool', delay: 20 }, { event: 'RudeCool', delay: 40 }],
    respond: ({ game }) => offended(game, game.uniq(() => game.draw('VIOLENT_THREAT', T.VIOLENT_THREAT)), false),
  },
  {
    name: 'Tone_Intimidation', event: 'PlayerMessage', when: [live, eq('category', 'intimidation')], bonus: 6,
    remember: [add(count.rude), add(count.intimidation), add(HEAT)], trigger: cool,
    respond: ({ game }) => offended(game, game.uniq(() => game.draw('INTIMIDATION', T.INTIMIDATION)), false),
  },
  // S0 — обида (как раньше, но коротко); второй крик за игру Алик помнит
  { name: 'Tone_Rude', event: 'PlayerMessage', when: [live, rude], remember: cools, trigger: cool, respond: ({ game }) => offended(game) },
  {
    name: 'Tone_Rude_Again', event: 'PlayerMessage', when: [live, rude, gte(count.rude, 2)], remember: cools, trigger: cool,
    respond: async ({ game }) => { game.unlock('memory'); await offended(game, freshOr(game, 'RUDE_AGAIN', RUDE_AGAIN, game.X.offended), false) },
  },
  // S1 — вместо Алика пишет родня (одна из трёх, у каждой свой перерыв)
  ...Object.keys(T.RUDE_FAMILY).map(family),
  // S2 — пропущенные от мамы и голосовое с «расшифровкой»
  {
    name: 'Rude_Calls', event: 'PlayerMessage', when: [live, rude, gte(HEAT, 2)], bonus: 2, cooldown: { days: 5 }, remember: cools, trigger: cool,
    respond: async ({ game, facts }) => {
      game.mood(-1)
      // счётчик пропущенных только растёт: он копится за партию, а не выдумывается каждый раз
      const calls = Number(game.mem()[mamaCalls] ?? 6) + 1 + game.rnd(4)
      game.applyFacts([set(mamaCalls, calls)])
      game.sys(game.draw('RC_SYS', T.RUDE_CALLS_SYS).replace('{n}', String(calls)))
      await game.sleep(600)
      const voice = await sayFresh(game, 'RC_VOICE', T.RUDE_CALLS_VOICE)
      // голосовое-плач — заметное событие с окном отклика (#1085): ход и три после.
      // Штамп ставит именно эта строка серии: болтовня мамы и голосовое Самвела окна не открывают
      if (voice && saidText(voice[1]) === T.MAMA_VOICE_CRY) game.applyFacts([set(mamaVoiceAt, Number(facts.sent))])
      await game.say([freshOr(game, 'RC_ALIK', T.RUDE_CALLS_ALIK, game.X.offended)])
      game.setCtx({ offended: true })
    },
  },
  // S3 — блок на 4 дня; Алик всё равно отвечает — с телефона Бориса, «Нивы», домофона.
  // Каждый следующий блок другого вкуса (#1423): второй — пишет мама, третий — канцелярия, четвёртый — тишина
  {
    name: 'Rude_Block', event: 'PlayerMessage', when: [live, rude, gte(HEAT, 3)], bonus: 3, cooldown: { days: 10 },
    remember: [...cools, set(blocked, true, { forDays: 4 }), set(blockedHint, false), set(statusHidden, false), add(count.block)], trigger: cool,
    respond: async ({ game }) => {
      game.mood(-2)
      game.sys(game.draw('RB_SYS', T.RUDE_BLOCK_SYS))
      game.unlock('blocked')
      await game.sleep(900)
      await sayBlocked(game)
      game.setCtx({ offended: true })
    },
  },
  {
    // блок важнее суда: суд — когда разблокирует
    name: 'Rude_WhileBlocked', event: 'PlayerMessage', when: [live, rude, is(blocked)], bonus: 7, remember: cools, trigger: cool,
    respond: async ({ game }) => { game.sys(T.NOT_DELIVERED); await game.sleep(900); await sayBlocked(game); game.setCtx({ offended: true }) },
  },
  // в чёрном списке не доходит ничего: ни вежливое, ни «Мууу», ни вопрос — Алик пишет с чужих номеров, не отвечая на сказанное
  {
    name: 'Tone_WhileBlocked', event: 'PlayerMessage', when: [live, is(blocked)], bonus: 6,
    respond: async ({ game }) => { game.sys(T.NOT_DELIVERED); await game.sleep(900); await sayBlocked(game) },
  },
  {
    name: 'Says_WhileBlocked', event: 'PlayerSays', when: [is(blocked), ne('intent', 'via'), ne('intent', 'sorry')], bonus: 6,
    respond: async ({ game }) => { game.sys(T.NOT_DELIVERED); await game.sleep(900); await sayBlocked(game) },
  },
  // S4 — семейный суд в групповом чате, один раз за игру
  { name: 'Rude_Tribunal', event: 'PlayerMessage', when: [live, rude, gte(HEAT, 4)], bonus: 6, once: true, priority: 'cinematic', remember: cools, trigger: cool, respond: ({ game }) => game.tribunal() },
  // S5 — после суда 10 дней вежливости: на крик — ответ «в рамках регламента»
  {
    name: 'Rude_Polite', event: 'PlayerMessage', when: [live, rude, is(polite)], bonus: 8, remember: [add(count.rude)],
    respond: async ({ game }) => { await game.say([line(game, 'POLITE_RUDE', T.POLITE_RUDE)]) },
  },
  // финал — вендетта: серия криков за игру и ни одного извинения.
  // Порог читается до remember текущего крика, поэтому 14 здесь — это 15-й крик, число из шпаргалки (#742)
  {
    name: 'Rude_Vendetta', event: 'PlayerMessage', when: [live, rude, gte(count.rude, 14), lte(count.sorry, 0)], bonus: 8, once: true, priority: 'cinematic',
    remember: [add(count.rude), set(vendetta, true), set(coldWar, true)],
    respond: async ({ game }) => {
      // ход объявления — начало окна примирения (#1565): экран схода ждёт его, а не встаёт этим же ходом
      game.applyFacts([set(vendettaAt, Number(game.facts().sent ?? 0))])
      await game.sticker({ e: '🗡️', c: 'Вендетта' })
      for (const [w, said] of T.VENDETTA) await game.say([w === 'alik' ? said : { w, t: saidText(said), claims: saidClaims(said) }])
      game.unlock('vendetta')
    },
  },

  // после вендетты — режим холодной войны: место тёплых пулов занимает сухой канцелярит (`coldWar`).
  // Грубость, требования и собственные инициативы Алика говорят из холодных пулов; снимает режим
  // принятое извинение (ритуал примирения, посредник, обычное sorry).
  {
    name: 'ColdWar_Rude', event: 'PlayerMessage', when: [live, is(coldWar), eq('tone', 'rude'), missing(blocked)], specificity: 30,
    remember: cools, trigger: cool,
    respond: async ({ game }) => {
      game.mood(-2)
      await coldWarLine(game, 'CW_REPLY', T.COLD_WAR_ALL)
      game.setCtx({ offended: true })
    },
  },
  {
    name: 'ColdWar_Request', event: 'PlayerMessage', when: [live, is(coldWar), eq('category', 'request'), missing(blocked)], specificity: 30,
    respond: async ({ game }) => { await coldWarLine(game, 'CW_REPLY', T.COLD_WAR_ALL) },
  },
  // Алик пишет сам только формально: расписания и напоминания о документах, без «ты поел?»
  {
    name: 'ColdWar_Idle', event: 'AlikIdle', when: [is(coldWar), missing(blocked), missing(phoneKarine), missing(alikDead), ne('offline', true)], specificity: 30,
    respond: async ({ game }) => { await coldWarLine(game, 'CW_IDLE', T.COLD_WAR_INITIATIVE) },
  },
  {
    name: 'ColdWar_Away', event: 'AlikAway', when: [is(coldWar), missing(blocked), missing(phoneKarine), missing(alikDead), ne('offline', true)], specificity: 30,
    respond: async ({ game }) => { await coldWarLine(game, 'CW_AWAY', T.COLD_WAR_INITIATIVE) },
  },

  // остывание ссоры: −1 через 20 дней после крика, не ниже нуля
  { name: 'Rude_Cool', event: 'RudeCool', when: [gte(HEAT, 1)], priority: 'system', respond: ({ game }) => cooldown(game, 1) },

  // ветка: угроза судом, пока ссора горячая — встречный иск, суд мирит
  {
    name: 'Tone_Threat_Hot', event: 'PlayerMessage', when: [live, eq('tone', 'threat'), gte(HEAT, 2)], bonus: 2, once: true,
    // суд мирит — значит, и холодная война кончена: «Мир, брат» не бывает половиной мира (#1424)
    remember: [add(count.threat), set(HEAT, 0), set(coldWar, false)],
    respond: async ({ game, facts }) => {
      for (const [w, said] of T.COUNTERSUIT) await game.say([w === 'alik' ? said : { w, t: saidText(said), claims: saidClaims(said) }])
      game.unlock('countersuit')
      // встречный иск — заметное событие с окном отклика (#964): ход и три после
      game.applyFacts([set(countersuitAt, Number(facts.sent))])
    },
  },
  {
    // встречный иск уже был — теперь апелляции; суд немного остужает
    name: 'Tone_Threat_Hot_Again', event: 'PlayerMessage', when: [live, eq('tone', 'threat'), gte(HEAT, 2)], bonus: 1, remember: [add(count.threat)],
    respond: async ({ game }) => { cooldown(game, 1); await game.say([freshOr(game, 'APPEAL', T.APPEAL, game.X.threat)]) },
  },
  // ветка: кричал всю игру и вдруг вежлив — Алику не хватает крика
  {
    // ссора остыла (давно не кричал), но за игру накричал много. Официальное обращение в суд (#1435) — не
    // «вдруг вежлив»: оно ведёт своё дело, и отклик «не хватает крика» его не съедает
    name: 'Tone_MissRude', event: 'PlayerMessage', when: [live, ne('tone', 'rude'), ne('tone', 'threat'), ne('category', 'threat'), gte(count.rude, 15), lte(HEAT, 0), gte('sinceRude', 8), missing(coldWar)], odds: 0.35, cooldown: { turns: 8 },
    respond: async ({ game }) => { const t = game.line('MISS_RUDE', T.MISS_RUDE); if (!t) return game.turnRoll(); await game.say([t]); game.unlock('habit'); await game.turnRoll() },
  },

  // телефон у Карине: Алик не пишет, отвечает она — и не на каждое слово
  ...(['AlikTurn', 'PlayerMessage', 'PlayerSays'] as const).map((event): R => ({
    name: 'Phone_Karine_' + event, event, when: [is(phoneKarine)], bonus: 9,
    respond: async ({ game }) => { const t = game.line('PHONE_KARINE', T.PHONE_KARINE); if (t) await game.say([{ w: 'karine', t }]) },
  })),
  ...(['AlikIdle', 'AlikAway', 'StoryBeat', 'PeriodLine', 'PromiseDue'] as GameEvent[]).map((event): R => ({ name: 'Quiet_PhoneKarine_' + event, event, when: [is(phoneKarine)], bonus: 9, respond: () => {} })),
  // состояния: блок, вежливость, вендетта перекрывают обычный ход
  {
    name: 'Turn_Blocked', event: 'AlikTurn', when: [is(blocked)],
    respond: async ({ game }) => {
      const flavor = blockFlavor(blockNo(game))
      // четвёртый блок и дальше — полная тишина: тихий ход вместо альтернативного канала
      if (!flavor) return
      // у мамы и канцелярии нет фолбэка: пул исчерпан — канал молчит, а не отдаёт слово Алику
      if (!(await sayFresh(game, flavor.key, flavor.pool)) && flavor.key === 'ALT') await game.excuseTurn()
    },
  },
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
      const blocked = coldWarBlocked(game)
      const t = game.decks.pick('COLD_WAR', T.COLD_WAR, game.lineFacts(), { mode: 'sequential', noRepeat: true, eligible: (e) => !blocked.has(valueOf(e)) })
      if (!t) return false
      coldWarNote(game, t)
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
    // «Мир, брат» — мир целиком: холодная война на этом кончается (#1424), иначе режим спорит со своей же репликой
    remember: [set(coldWar, false)],
    respond: async ({ game }) => {
      cooldown(game, 2); game.mood(1)
      const p = game.linePicked('COW_PEACE', T.COW_PEACE)
      await game.say([p ? { t: p.text, claims: p.spec.claims ?? [] } : game.uniq(game.X.cow)])
      game.unlock('cowpeace'); game.setCtx(null)
    },
  },
  { name: 'Says_moo', event: 'PlayerSays', when: [eq('intent', 'moo')], respond: async ({ game }) => { await game.say([freshOr(game, 'MOO_ODD', T.MOO_ODD, game.X.cow)]); game.setCtx(null) } },
  // #1594: вежливое напоминание в живом сходе («простите, что снова пишу») — не извинение: цену выхода
  // не платит и вражду не снимает, но и не тонет. Ответ — канцелярит окна холодной войны, тот же пул,
  // что у ответа на требование (#1441).
  {
    name: 'Says_courtesy_vendetta', event: 'PlayerSays', when: [eq('intent', 'courtesy'), is(vendetta), missing(endgame.active), missing(blocked), missing('offline')],
    specificity: 40,
    respond: async ({ game }) => { await coldWarLine(game, 'CW_REPLY', T.COLD_WAR_ALL) },
  },
  // заблокирован — извинение не доходит; подсказывает посредник: Борис, Карине, иначе мама (Карине и мама — раз за блок)
  {
    name: 'Says_sorry_blocked_boris', event: 'PlayerSays', when: [eq('intent', 'sorry'), is(blocked), WORLD.borisWrites], bonus: 7,
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
    respond: async ({ game }) => { game.sys(T.NOT_DELIVERED); await game.sleep(900); await sayBlocked(game) },
  },
  // извинение через посредника, которого игрок выбрал (arg)
  ...([['boris', T.VIA_BORIS], ['karine', T.VIA_KARINE], ['mama', T.VIA_MAMA]] as const).map(([who, lines]): R => ({
    // извинение через посредника — полный выход из вражды: снимает и холодную войну, и сход (#1556)
    name: 'Says_via_' + who, event: 'PlayerSays', when: [eq('intent', 'via'), eq('arg', who)], remember: [set(blocked, false), add(count.sorry), set(coldWar, false), set(vendetta, false)],
    respond: async ({ game }) => { cooldown(game, 1); for (const [w, said] of lines) await game.say([w === 'alik' ? said : { w, t: saidText(said), claims: saidClaims(said) }]); game.sys('Алик Воздухонесян разблокировал вас'); game.setCtx(null) },
  })),
  {
    name: 'Says_sorry_ritual', event: 'PlayerSays', when: [eq('intent', 'sorry'), gte(HEAT, 3)], bonus: 3, remember: [add(count.sorry), add(ritualCount)],
    respond: ({ game }) => game.enterNode('ritual', 'ask'),
  },
]
