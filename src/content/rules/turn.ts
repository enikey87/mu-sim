// Ход Алика в ответ на обычное сообщение игрока.
import type { Game } from '../../engine/game'
import { type Rule, eq, ne, gte, lte, is, exists, missing, add, set } from '../fact'
import type { GameEvent, Offer } from './events'
import { meet } from '../world'
import { AlikOffline } from './criteria'
import { IDLE } from '../life'
import { MEMORY } from '../memory'
import { LEGENDS } from '../legends'
import { count, creditBroke, endgame, payday, polite, thanksAt, vendetta } from '../memkeys'

import { GREET, GREET_MORNING, GREET_NIGHT, THANKS } from '../misc'

type R = Rule<Game, GameEvent, Offer>

/** Тёплый ответ ломает режимы вежливости-убийцы, вендетты и эндгейма — там он молчит. */
const warm = [ne(polite, true), ne(vendetta, true), ne(endgame.active, true)]

/** Перерыв между бампами настроения за «спасибо» — самый длинный ходовой перерыв в игре (docs/design/greetings.md). */
const THANKS_MOOD_GAP = 8

// Событие PlayerMessage { tone } — как Алик реагирует на тон
export const toneRules: R[] = [
  { name: 'Tone_Default', event: 'PlayerMessage', when: [], respond: ({ game }) => game.turnRoll() },
  // грубость — лестница эскалации в rude.ts
  // угрозы судом — линия суда (court.ts): каждая угроза двигает дело на ступень
  { name: 'Tone_Cow', event: 'PlayerMessage', when: [eq('tone', 'cow')], remember: [add(count.cow)], respond: async ({ game }) => { await game.say([game.uniq(game.X.cow)]) } },
  // «спасибо» / «привет» свободным текстом: ответ на это слово. В S5, вендетте и эндгейме — прежний ход;
  // блок, смерть, телефон у Карине и Tone_MissRude специфичнее и выигрывают сами
  {
    name: 'Tone_Thanks', event: 'PlayerMessage', when: [eq('category', 'gratitude'), ...warm],
    respond: async ({ game }) => {
      // «спасибо» — бесплатный текст, а настроение двигает переводы и сцены: бамп не чаще раза в THANKS_MOOD_GAP ходов
      if (game.S.stats.sent - Number(game.S.mem[thanksAt] ?? -99) >= THANKS_MOOD_GAP) {
        game.mood(1)
        game.rules.applyOps([set(thanksAt, game.S.stats.sent)], {})
      }
      await game.say([game.uniq(() => game.draw('THANKS', THANKS))])
    },
  },
  {
    name: 'Tone_Greeting', event: 'PlayerMessage', when: [eq('category', 'greeting'), ...warm],
    respond: async ({ game, facts }) => {
      const [key, pool] = facts.period === 'night' ? ['GREET_NIGHT', GREET_NIGHT] : facts.period === 'morning' ? ['GREET_MORNING', GREET_MORNING] : ['GREET', GREET]
      await game.say([game.uniq(() => game.fillMoney(game.draw(key, pool)))])
    },
  },
]

// Событие StoryBeat — после хода игрока, даже если он спорил, кричал или отвечал на контекст:
// сюжет не ждёт «обычного» хода. Первый сериал — в первые ходы; изредка — мини-квест.
export const storyRules: R[] = [
  // «нечем платить» → коллекторы; не ждём случайного nextArc (#128)
  {
    name: 'Beat_Collectors', event: 'StoryBeat',
    when: [is(creditBroke), missing(endgame.active)],
    once: true, bonus: 10, priority: 'cinematic',
    respond: async ({ game }) => {
      if (game.S.arcs.collectors) return false
      await game.playArc('collectors')
    },
  },
  // начатая линия идёт своим битом по факту прошлой серии, а не общей лотереей Beat_Arc: иначе две трети партий
  // не доходят до перевербовки до Дня выплаты (#324). Шанс 0,5 при серии раз в ≥ 3 дня — развязка за ~2–3 недели
  {
    name: 'Beat_CollectorsNext', event: 'StoryBeat',
    when: [gte('arc.collectors', 1), is('collectorsCanAdvance'), missing(endgame.active)],
    odds: 0.5, cooldown: { turns: 2 },
    respond: ({ game }) => game.playArc('collectors'),
  },
  { name: 'Beat_FirstArc', event: 'StoryBeat', when: [gte('sent', 3), lte('arcsStarted', 0), is('arcAvailable')], odds: 0.5, priority: 'chatter', respond: async ({ game }) => { const id = game.nextArc(); if (id) await game.playArc(id) } },
  // идущие сериалы продолжаются и между «обычными» ходами — не реже серии в ~8 ходов
  { name: 'Beat_Arc', event: 'StoryBeat', when: [gte('arcsStarted', 1), is('arcAvailable')], specificity: 0, odds: 0.14, cooldown: { turns: 4 }, priority: 'chatter', respond: async ({ game }) => { const id = game.nextArc(); if (id) await game.playArc(id) } },
  // легенда денег продолжается и между «обычными» ходами
  {
    name: 'Beat_Legend', event: 'StoryBeat', when: [exists('legend')], specificity: 0, odds: 0.12, cooldown: { turns: 5 }, priority: 'chatter',
    respond: async ({ game, facts }) => { const t = game.line('LEG_' + facts.legend, LEGENDS[String(facts.legend)].lines); if (!t) return false; game.markTopical(await game.say([t])); game.S.ctx = { ...(game.S.ctx ?? {}), legend: String(facts.legend) } },
  },
  { name: 'Beat_Memory', event: 'StoryBeat', when: [gte('sent', 10)], specificity: 0, odds: 0.08, cooldown: { turns: 6 }, priority: 'chatter', respond: async ({ game }) => { const t = game.line('MEMORY', MEMORY); if (!t) return false; await game.say([t]); game.unlock('memory'); game.S.ctx = { ...(game.S.ctx ?? {}), memory: true } } },
  { name: 'Beat_Quest', event: 'StoryBeat', when: [gte('sent', 6)], specificity: 0, odds: 0.06, cooldown: { turns: 8 }, priority: 'chatter', respond: ({ game }) => game.fire('PickQuest').then((r) => !!r) },
]

// Событие AlikIgnores — «прочитано в 3:14» и тишина (4%)
export const ignoreRules: R[] = [
  { name: 'Ignore_ReadOnly', event: 'AlikIgnores', when: [], odds: 0.04, respond: ({ game }) => game.readOnly() },
]

// Событие PeriodLine — реплика по реальному времени суток, не чаще раза в 12 ходов (перерыв правила)
export const periodRules: R[] = [
  { name: 'PeriodLine', event: 'PeriodLine', when: [ne('period', 'day')], odds: 0.35, cooldown: { turns: 12 }, priority: 'chatter', respond: ({ game }) => game.periodLine(game.period()) },
]

// Событие AlikTurn — взвешенный выбор, что Алик сделает. Специфичность у всех одна (0),
// условия лишь отсекают недоступное; веса повторяют вероятности оригинала.
const W: Record<string, number> = { scene: 11, quest: 15, arc: 26, group: 3, wrong: 3.5, sticker: 4, fwd: 4, job: 6, photo: 3, voice: 4, short: 6 }
const transferW = (f: Record<string, unknown>) => (2 + Number(f.mood ?? 5) * 0.6)
export const turnRules: R[] = [
  { name: 'Turn_Scene', event: 'AlikTurn', when: [gte('sent', 3)], specificity: 0, weight: W.scene, respond: ({ game }) => game.startScene() },
  // мини-квест — короткая глупая история; все на перерыве — обычная отмазка
  { name: 'Turn_Quest', event: 'AlikTurn', when: [gte('sent', 3)], specificity: 0, weight: W.quest, respond: async ({ game }) => { if (!(await game.fire('PickQuest'))) await game.excuseTurn() } },
  // первый сериал — в первые ходы, второй — к пятнадцатому: сюжет должен начаться сразу
  { name: 'Turn_ArcFirst', event: 'AlikTurn', when: [gte('sent', 1), lte('arcsStarted', 0), is('arcAvailable')], odds: 0.75, respond: async ({ game }) => { const id = game.nextArc(); if (id) await game.playArc(id) } },
  { name: 'Turn_ArcSecond', event: 'AlikTurn', when: [gte('sent', 6), lte('arcsStarted', 1), is('arcAvailable')], odds: 0.4, respond: async ({ game }) => { const id = game.nextArc(); if (id) await game.playArc(id) } },
  { name: 'Turn_Arc', event: 'AlikTurn', when: [gte('sent', 2), is('arcAvailable')], specificity: 0, weight: W.arc, respond: async ({ game }) => { const id = game.nextArc(); if (id) await game.playArc(id) } },
  { name: 'Turn_Group', event: 'AlikTurn', when: [gte('sent', 8)], specificity: 0, weight: W.group, respond: ({ game }) => game.groupChat() },
  { name: 'Turn_Wrong', event: 'AlikTurn', when: [gte('sent', 5)], specificity: 0, weight: W.wrong, respond: ({ game }) => game.wrongChat() },
  // бухгалтерия лжи: Алик сам возвращается к своему старому вранью
  // легенда денег: пока деньги «в сейфе, а ключ в малыше», ход Алика продолжает эту линию, а не случайную отмазку
  {
    name: 'Turn_Legend', event: 'AlikTurn', when: [exists('legend')], specificity: 0, weight: 22, cooldown: { turns: 2 },
    respond: async ({ game, facts }) => {
      const t = game.line('LEG_' + facts.legend, LEGENDS[String(facts.legend)].lines)
      if (!t) return game.excuseTurn()
      game.markTopical(await game.say([t]))
      game.S.ctx = { ...(game.S.ctx ?? {}), legend: String(facts.legend) } // можно переспросить именно про это
      if (game.chance(0.6)) await game.promiseLine(undefined, true)
    },
  },
  // память: Алик вспоминает, что было в этой партии (реплики с условиями, каждая один раз)
  {
    name: 'Turn_Memory', event: 'AlikTurn', when: [gte('sent', 8)], specificity: 0, weight: 7, cooldown: { turns: 4 },
    respond: async ({ game, facts }) => {
      const item = facts.latestItem && String(facts.latestItem)
      // без пояснения из досье и в кавычках: «Место на кране (40 м)» → «Место на кране»
      const short = item && item.replace(/\s*\([^()]*\)\s*$/, '')
      const named = short && (short.startsWith('«') ? short : `«${short}»`)
      const pool = named ? [{ id: 'MEMORY_ITEM_' + item, t: `Помнишь, я отдал тебе ${named}? Всё ещё у тебя?`, prio: 2 }, ...MEMORY] : MEMORY
      const t = game.line('MEMORY', pool)
      if (t) { await game.say([t]); game.unlock('memory') } else await game.excuseTurn()
    },
  },
  // «помнишь, деньги в сейфе?» — после Дня выплаты деньги «отданы», старые версии уже не продолжаются
  { name: 'Turn_Callback', event: 'AlikTurn', when: [is('callbackReady'), missing(payday.chain)], specificity: 0, weight: 6, cooldown: { days: 5 }, respond: ({ game }) => game.callback() },
  { name: 'Turn_Sticker', event: 'AlikTurn', when: [], specificity: 0, weight: W.sticker, respond: ({ game }) => game.sticker() },
  { name: 'Turn_Forward', event: 'AlikTurn', when: [], specificity: 0, weight: W.fwd, respond: ({ game }) => game.forward() },
  { name: 'Turn_Transfer', event: 'AlikTurn', when: [], specificity: 0, weight: transferW, respond: ({ game }) => game.transfer() },
  { name: 'Turn_Job', event: 'AlikTurn', when: [], specificity: 0, weight: W.job, respond: ({ game }) => game.job() },
  // на «фото платёжки» — баран на фоне Арарата: с этого момента бараны — знакомая тема
  { name: 'Turn_Photo', event: 'AlikTurn', when: [], specificity: 0, weight: W.photo, remember: meet('baran'), respond: ({ game }) => game.photo() },
  { name: 'Turn_Voice', event: 'AlikTurn', when: [], specificity: 0, weight: W.voice, respond: ({ game }) => game.voice() },
  { name: 'Turn_Short', event: 'AlikTurn', when: [], specificity: 0, weight: W.short, respond: ({ game }) => game.shortReply() },
  {
    // отмазка забирает всё, что осталось до 100 — как в оригинале, где недоступные ветки отдавали долю отмазке
    name: 'Turn_Excuse', event: 'AlikTurn', when: [], specificity: 0,
    weight: (f) => {
      const sent = Number(f.sent ?? 0)
      const active = (sent >= 3 ? W.scene + W.quest : 0) + (sent >= 8 ? 7 : 0) + (sent >= 2 && f.arcAvailable ? W.arc : 0) + (sent >= 8 ? W.group : 0) + (sent >= 5 ? W.wrong : 0)
        + W.sticker + W.fwd + W.job + W.photo + W.voice + W.short + transferW(f)
      return Math.max(20, 100 - active)
    },
    respond: ({ game }) => game.excuseTurn(),
  },
]

// Событие AlikIdle — Алик пишет сам, если игрок молчит
const idleW = { notif: 15, text: 35, sticker: 12, fwd: 14, deleted: 10, voice: 8, period: 6 }
export const idleRules: R[] = [
  // пока Алик «пропал» — только уведомления телефона. Посреди сцены болтовня Алика (приоритет chatter)
  // отклоняется порогом приоритета, остаются уведомления (system) — отдельное правило больше не нужно
  { name: 'Idle_Offline', event: 'AlikIdle', when: [AlikOffline], priority: 'system', respond: ({ game }) => game.randomNotif() },
  { name: 'Idle_Notif', event: 'AlikIdle', when: [], specificity: 0, weight: idleW.notif, priority: 'system', respond: ({ game }) => game.randomNotif() },
  {
    name: 'Idle_Text', event: 'AlikIdle', when: [], specificity: 0, priority: 'chatter', weight: idleW.text,
    respond: async ({ game }) => {
      await game.sleep(300)
      await game.say([game.addrLine('IDLE', IDLE)])
      game.unlock('idle')
      game.setCtx({ type: 'idle' })
    },
  },
  { name: 'Idle_Sticker', event: 'AlikIdle', when: [], specificity: 0, priority: 'chatter', weight: idleW.sticker, respond: ({ game }) => game.sticker() },
  { name: 'Idle_Forward', event: 'AlikIdle', when: [], specificity: 0, priority: 'chatter', weight: idleW.fwd, respond: ({ game }) => game.forward() },
  { name: 'Idle_Deleted', event: 'AlikIdle', when: [], specificity: 0, priority: 'chatter', weight: idleW.deleted, respond: async ({ game }) => { game.setCtx(null); await game.deletedMsg() } },
  { name: 'Idle_Voice', event: 'AlikIdle', when: [], specificity: 0, priority: 'chatter', weight: idleW.voice, respond: ({ game }) => game.voice() },
  { name: 'Idle_Period', event: 'AlikIdle', when: [], specificity: 0, priority: 'chatter', weight: (f) => (f.period === 'day' ? 0 : idleW.period), respond: ({ game }) => game.periodLine(game.period()) },
]

// Событие AlikAway — одно сообщение пачки «пока тебя не было»; смерть, блок, телефон у Карине молчат правилами Quiet_* своих состояний
const awayW = { text: 35, sticker: 15, fwd: 15, deleted: 10, voice: 10, transfer: 7, excuse: 8 }
export const awayRules: R[] = [
  // пропал — не пишет; уведомление телефона, как у Idle_Offline, в пачке ни к чему
  { name: 'Away_Offline', event: 'AlikAway', when: [AlikOffline], respond: () => {} },
  ...(Object.keys(awayW) as (keyof typeof awayW)[]).map((kind): R => ({
    name: 'Away_' + kind.charAt(0).toUpperCase() + kind.slice(1), event: 'AlikAway', when: [], specificity: 0, weight: awayW[kind],
    respond: ({ game }) => game.awayMsg(kind),
  })),
]
