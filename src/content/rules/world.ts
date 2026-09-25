// Правила новых возможностей: выбор сцен, наступившие обещания, хор персонажей, состояния мира.
import type { Game } from '../../engine/game'
import { type Rule, type Facts, type Entry, eq, ne, gte, lte, is, add, of, missing } from '../fact'

import type { GameEvent, Offer } from './events'
import { WORLD, SPEAKS } from '../world'
import { CHORUS_LEGEND } from '../legends'
import { PROMISE_DUE, PROMISE_DUE_COSMIC, PROMISE_DUE_KEPT, PROMISE_MET, CHORUS, CHORUS_FED_UP, WEDDING_NOISE, BORIS_SICK, DEAD_KARINE, DEAD_ALIK } from '../world'
import { alikDead, blocked, count, grantPaid, interjections, intro, met, mourning, payday, sick } from '../memkeys'
import { JournalForAmnesty } from './criteria'

type R = Rule<Game, GameEvent, Offer>

// ---- выбор сцены (PickScene): раньше — случайно из колоды, теперь — по сюжету ----
// Специфичность у всех 0 (выбор по весам), условия — ворота; после показа — перерыв 25 дней.
const scene = (id: string, when: R['when'] = [], weight: R['weight'] = 1): R => ({
  name: `Scene_${id}`, event: 'PickScene', when, specificity: 0, weight, cooldown: { days: 25 }, priority: 'cinematic',
  respond: ({ game }) => game.enterNode(id, game.scenes[id].start),
})
const eveningBoost = (f: Facts) => (f.period === 'evening' || f.period === 'friday' ? 3 : 1)
export const sceneRules: R[] = [
  scene('meet'), scene('card'), scene('barter'), scene('choice'),
  { ...scene('redo'), once: true }, // «заказчик жалуется на плитку» — один раз: игрок уже съездил и проверил
  // истории, которые случаются один раз: «новый объект», «займи 5000», «если спросят — ты не работал», кредит
  { ...scene('newjob'), once: true },
  // «это Арсен, племянник» — знакомство: если Арсен уже в истории (суд, фундамент), второй раз не представляется
  scene('nephew', [missing(intro('arsen'))]),
  // «позвони заказчику сам» — один раз и пока Грант сам не сказал, что заплатил: иначе звонок — повтор новости
  { ...scene('customer', [gte('day', 200), missing(grantPaid)]), once: true },
  { ...scene('lend', [gte('mood', 4), gte('money', 5000)]), once: true }, // «займи 5000» — если на карте есть 5000
  scene('toast', [missing(mourning)], eveningBoost), // застолье — чаще вечером и в пятницу, и не когда в семье прощаются
  { ...scene('tax', [gte(count.threat, 1)], 2), once: true }, // «если спросят — ты у меня не работал» — после угроз судом
  { ...scene('wife', [gte(count.rude, 1), missing(met('karine')), WORLD.karineHome]), once: true }, // Карине знакомится один раз: «Вы кто такой?» дважды — нелепо
  scene('invoice', [gte('day', 215)]),
  { ...scene('loan', [gte('day', 230)]), once: true }, // кредит «на твоё имя» — один раз
  // амнистия обещаний — один раз, при 5+ просроченных и пока не начался День выплаты (после него журнал ни на что не влияет)
  { ...scene('amnesty', [JournalForAmnesty, missing(payday.chain)]), once: true, specificity: 1 }, // распухший журнал важнее розыгрыша обычных сцен
  // умирать Алик начинает, когда дела плохи, и только один раз: после похорон и воскрешения смертный одр уже был
  { ...scene('deathbed', [gte('day', 240), lte('mood', 6), missing(mourning)], 2), once: true },
  { ...scene('heir', [gte('arc.grandpa', 4), gte('arc.boris', 4)], 3), once: true }, // наследство: после того как дедушка переписал завещание и когда Борис уже есть
]

// ---- мини-квесты (PickQuest): свой слот в ходе Алика, каждый — один раз за игру ----
// квест — один раз за игру: во второй раз та же история уже не смешная
const quest = (id: string, when: R['when'] = []): R => ({ ...scene(id, when), name: `Quest_${id}`, event: 'PickQuest', once: true, cooldown: undefined })
/** Условия квестов — общие для слота квестов и для запуска из разговора. */
export const QUEST_WHEN: Record<string, R['when']> = {
  q_niva: [eq('legend', 'niva_stuck')], // «толкни „Ниву“» — эпизод сериала «Нива», а не его повторная завязка
  q_crypto: [gte('day', 200), missing('legend')],
  q_witness: [gte('day', 210)],
  q_tamada: [missing(mourning)], // вести застолье, пока в семье прощаются, — нельзя
}
export const questRules: R[] = [
  quest('q_hash'), quest('q_niva', QUEST_WHEN.q_niva), quest('q_tamada', QUEST_WHEN.q_tamada), quest('q_lottery'), quest('q_parking'),
  quest('q_mama'), quest('q_crypto', QUEST_WHEN.q_crypto), quest('q_photo'), quest('q_witness', QUEST_WHEN.q_witness), quest('q_goat'),
]

// ---- обещание наступило (PromiseDue — отложенное событие на день срока) ----
const promiseText = (game: Game, f: Facts) => game.S.promises[Number(f.promise)]
const dueLine = (game: Game, f: Facts, key: string, arr: readonly Entry<string>[]) => {
  const p = promiseText(game, f)!
  return game.uniq(() => `${game.X.g('ADDR')}, ${game.X.fill(game.draw(key, arr), { t: p.t })}`)
}
// срок актуален: обещание есть и его не «переписали» в когда-нибудь
const live = eq('promiseLive', true)
export const promiseRules: R[] = [
  {
    // не через ход: наступивший срок — событие, а не фон
    name: 'Due_Default', event: 'PromiseDue', when: [live], odds: 0.5, cooldown: { days: 6 }, priority: 'chatter',
    respond: async ({ game, facts }) => { await game.say([dueLine(game, facts, 'DUE', PROMISE_DUE)]) },
  },
  {
    name: 'Due_Cosmic', event: 'PromiseDue', when: [live, gte('tier', 3)], odds: 0.6, cooldown: { days: 3 }, priority: 'chatter',
    respond: async ({ game, facts }) => { await game.say([dueLine(game, facts, 'DUE3', PROMISE_DUE_COSMIC)]) },
  },
  {
    // в хорошем настроении Алик «держит слово» — 50 рублей ровно в срок
    name: 'Due_Kept', event: 'PromiseDue', when: [live, gte('mood', 8)], odds: 0.5, cooldown: { days: 10 }, priority: 'chatter',
    respond: async ({ game, facts }) => {
      await game.say([dueLine(game, facts, 'DUE_KEPT', PROMISE_DUE_KEPT)])
      await game.transfer()
      // сдержал (на 50 ₽) — в журнале больше не «просрочено», упрекать нечем; `kept` — чтобы досье не звало это «припомнил»
      const p = game.S.promises[Number(facts.promise)]
      if (p) { p.asked = true; p.kept = true }
    },
  },
  {
    name: 'Condition_Met', event: 'PromiseConditionMet', when: [live, missing(alikDead)], priority: 'chatter',
    respond: async ({ game, facts }) => { await game.say([dueLine(game, facts, 'MET', PROMISE_MET)]) },
  },
]

// ---- хор (Mentioned, target — упомянутый персонаж) ----
const speaks = (who: string) => (SPEAKS[who] ? [SPEAKS[who]] : [])
const chorus = (who: string): R => ({
  name: `Chorus_${who}`, event: 'Mentioned', target: who, when: speaks(who), odds: 0.3, cooldown: { turns: 12 }, priority: 'chatter',
  remember: [add(interjections, 1, { scope: 'target' })],
  respond: async ({ game }) => {
    // сначала реплики в рамках легенды денег (Нуне не скажет «денег нет», пока деньги в сейфе)
    const t = game.line('CH_' + who, [...(CHORUS_LEGEND[who] ?? []), ...CHORUS[who]])
    if (!t) return false // новых реплик нет — молчит
    await game.say([{ w: who, t }])
    game.S.ctx = { ...(game.S.ctx ?? {}), chorus: who } // можно ответить самому персонажу
  },
})
const fedUp = (who: string): R => ({
  name: `Chorus_${who}_FedUp`, event: 'Mentioned', target: who, when: [gte(interjections, 3, 'target'), ...speaks(who)], odds: 0.5, cooldown: { turns: 12 }, priority: 'chatter',
  remember: [add(interjections, 1, { scope: 'target' })],
  // по порядку и один раз: нарастание, а не случайная реплика
  respond: async ({ game }) => {
    const t = game.decks.next('FED_' + who, CHORUS_FED_UP[who], { mode: 'sequential', noRepeat: true })
    if (!t) return false
    await game.say([{ w: who, t }])
  },
})
export const chorusRules: R[] = [...Object.keys(CHORUS).map(chorus), ...Object.keys(CHORUS_FED_UP).map(fedUp)]

// ---- состояния мира со сроком: окрашивают обычный ход ----
const noise = (key: string, arr: readonly Entry<string>[]) => async ({ game }: { game: Game }) => {
  await game.say([game.uniq(() => game.draw(key, arr))])
}
/** Факт у каждой свадьбы свой: два срока на одном ключе откатывали бы друг друга. */
const weddingNoise = (who: import('../ids').CastId): R => ({
  name: `Turn_Wedding_${who.charAt(0).toUpperCase()}${who.slice(1)}`, event: 'AlikTurn', when: [is(`wedding.${who}`)],
  specificity: 0, weight: 12, cooldown: { turns: 3 }, respond: noise('WEDDING', WEDDING_NOISE),
})
async function deadTurn(game: Game): Promise<void> {
  game.setCtx(null)
  // Карине ушла к Рубику — о смерти сообщает мама Алика
  if (game.chance(0.5)) await game.say([{ w: game.canSpeak('karine') ? 'karine' : 'mama', t: game.uniq(() => game.draw('DEAD_K', DEAD_KARINE)) }])
  else await game.say([game.uniq(() => game.draw('DEAD_A', DEAD_ALIK))])
}
export const stateRules: R[] = [
  weddingNoise('boris'), weddingNoise('samvel'), weddingNoise('razmik'),
  { name: 'Turn_BorisSick', event: 'AlikTurn', when: [of('boris', is(sick))], specificity: 0, weight: 10, cooldown: { turns: 3 }, respond: noise('BORIS_SICK', BORIS_SICK) },
  // «умер» — значит, умер: ни болтовни простоя, ни сюжетных ходов, ни «доброе утро»; на слова игрока — Карине / «с того света»
  // ход Алика по другим путям (после сцены, после пропажи) — тоже «умер»
  { name: 'Turn_WhileDead', event: 'AlikTurn', when: [is(alikDead)], respond: ({ game }) => deadTurn(game) },
  // пока Алик «мёртв», это состояние перекрывает ответ на любое сообщение игрока (кроме вопроса о сериале — так идут похороны)
  { name: 'Tone_WhileDead', event: 'PlayerMessage', when: [is(alikDead)], bonus: 10, respond: ({ game }) => deadTurn(game) },
  { name: 'Says_WhileDead', event: 'PlayerSays', when: [is(alikDead), ne('intent', 'arc')], bonus: 6, respond: ({ game }) => deadTurn(game) },
  { name: 'Says_OtherArcWhileDead', event: 'PlayerSays', when: [is(alikDead), eq('intent', 'arc'), ne('arg', 'alik_death')], bonus: 6, respond: ({ game }) => deadTurn(game) },
  // PromiseConditionMet не входит: fulfillConditionalPromise выходит до fire при смерти (#102).
  ...(['AlikIdle', 'AlikAway', 'StoryBeat', 'PeriodLine', 'PromiseDue'] as GameEvent[]).map((event): R => ({ name: 'Quiet_Dead_' + event, event, when: [is(alikDead)], bonus: 10, respond: () => {} })),
  // заблокировал — значит, не пишет: ни легенд, ни «обед — святое», ни пачки непрочитанных (пишет разве что через «Ниву» — это ход блокировки)
  // PromiseConditionMet — то же при blocked (#102).
  ...(['AlikAway', 'StoryBeat', 'PeriodLine', 'PromiseDue'] as GameEvent[]).map((event): R => ({ name: 'Quiet_Blocked_' + event, event, when: [is(blocked)], bonus: 10, respond: () => {} })),
]

export const worldRules: R[] = [...sceneRules, ...questRules, ...promiseRules, ...chorusRules, ...stateRules]
