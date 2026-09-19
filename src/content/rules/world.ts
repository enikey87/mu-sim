// Правила новых возможностей: выбор сцен, наступившие обещания, хор персонажей, состояния мира.
import type { Game } from '../../engine/game'
import { type Rule, type Facts, gte, lte, is, add, of } from '../../engine/rules'
import { CHORUS_LEGEND } from '../legends'
import { PROMISE_DUE, PROMISE_DUE_COSMIC, PROMISE_DUE_KEPT, CHORUS, CHORUS_FED_UP, WEDDING_NOISE, BORIS_SICK, DEAD_KARINE, DEAD_ALIK } from '../world'

type R = Rule<Game>

// ---- выбор сцены (PickScene): раньше — случайно из колоды, теперь — по сюжету ----
// Специфичность у всех 0 (выбор по весам), условия — ворота; после показа — перерыв 25 дней.
const scene = (id: string, when: R['when'] = [], weight: R['weight'] = 1): R => ({
  name: `Scene_${id}`, event: 'PickScene', when, specificity: 0, weight, cooldown: { days: 25 }, priority: 'cinematic',
  respond: ({ game }) => game.enterNode(id, game.scenes[id].start),
})
const eveningBoost = (f: Facts) => (f.period === 'evening' || f.period === 'friday' ? 3 : 1)
export const sceneRules: R[] = [
  scene('meet'), scene('card'), scene('barter'), scene('nephew'), scene('redo'), scene('newjob'), scene('choice'),
  scene('customer', [gte('day', 200)]),
  scene('lend', [gte('mood', 4)]),
  scene('toast', [], eveningBoost), // застолье — чаще вечером и в пятницу
  scene('tax', [gte('count.threat', 1)], 2), // «если спросят — ты у меня не работал» — после угроз судом
  { ...scene('wife', [gte('count.rude', 1)]), once: true }, // Карине знакомится один раз: «Вы кто такой?» дважды — нелепо
  scene('invoice', [gte('day', 215)]),
  scene('loan', [gte('day', 230)]),
  scene('deathbed', [gte('day', 240), lte('mood', 6)], 2), // умирать Алик начинает, когда дела плохи
  { ...scene('heir', [gte('arc.grandpa', 4)], 3), once: true }, // наследство — один раз, после того как дедушка переписал завещание
]

// ---- мини-квесты (PickQuest): свой слот в ходе Алика, каждый — один раз за игру ----
// квест — один раз за игру: во второй раз та же история уже не смешная
const quest = (id: string, when: R['when'] = []): R => ({ ...scene(id, when), name: `Quest_${id}`, event: 'PickQuest', once: true, cooldown: undefined })
export const questRules: R[] = [
  quest('q_hash'), quest('q_niva'), quest('q_tamada'), quest('q_lottery'), quest('q_parking'),
  quest('q_mama'), quest('q_crypto', [gte('day', 200)]), quest('q_photo'), quest('q_witness', [gte('day', 210)]), quest('q_goat'),
]

// ---- обещание наступило (PromiseDue — отложенное событие на день срока) ----
const promiseText = (game: Game, f: Facts) => game.S.promises[Number(f.promise)]
const dueLine = (game: Game, f: Facts, key: string, arr: string[]) => {
  const p = promiseText(game, f)!
  return game.uniq(() => `${game.X.g('ADDR')}, ${game.X.fill(game.draw(key, arr), { t: p.t })}`)
}
// срок актуален: обещание есть и его не «переписали» в когда-нибудь
const live = { key: 'promiseLive', op: '==' as const, value: true }
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
    respond: async ({ game }) => { await game.say([game.uniq(() => game.draw('DUE_KEPT', PROMISE_DUE_KEPT))]); await game.transfer() },
  },
]

// ---- хор (Mentioned, target — упомянутый персонаж) ----
const chorus = (who: string): R => ({
  name: `Chorus_${who}`, event: 'Mentioned', target: who, when: [], odds: 0.3, cooldown: { turns: 12 }, priority: 'chatter',
  remember: [add('interjections', 1, { scope: 'target' })],
  respond: async ({ game }) => {
    // сначала реплики в рамках легенды денег (Нуне не скажет «денег нет», пока деньги в сейфе)
    const t = game.line('CH_' + who, [...(CHORUS_LEGEND[who] ?? []), ...CHORUS[who]])
    if (!t) return false // новых реплик нет — молчит
    await game.say([{ w: who, t }])
  },
})
const fedUp = (who: string): R => ({
  name: `Chorus_${who}_FedUp`, event: 'Mentioned', target: who, when: [gte('interjections', 3, 'target')], odds: 0.5, cooldown: { turns: 12 }, priority: 'chatter',
  remember: [add('interjections', 1, { scope: 'target' })],
  // по порядку и один раз: нарастание, а не случайная реплика
  respond: async ({ game }) => {
    const t = game.decks.next('FED_' + who, CHORUS_FED_UP[who], { mode: 'sequential', noRepeat: true })
    if (!t) return false
    await game.say([{ w: who, t }])
  },
})
export const chorusRules: R[] = [...Object.keys(CHORUS).map(chorus), ...Object.keys(CHORUS_FED_UP).map(fedUp)]

// ---- состояния мира со сроком: окрашивают обычный ход ----
const noise = (key: string, arr: string[]) => async ({ game }: { game: Game }) => {
  await game.say([game.uniq(() => game.draw(key, arr))])
}
export const stateRules: R[] = [
  { name: 'Turn_Wedding', event: 'AlikTurn', when: [is('wedding')], specificity: 0, weight: 12, cooldown: { turns: 3 }, respond: noise('WEDDING', WEDDING_NOISE) },
  { name: 'Turn_BorisSick', event: 'AlikTurn', when: [of('boris', is('sick'))], specificity: 0, weight: 10, cooldown: { turns: 3 }, respond: noise('BORIS_SICK', BORIS_SICK) },
  {
    // пока Алик «мёртв», это состояние перекрывает обычный ход целиком (специфичность выше весовых правил)
    name: 'Turn_WhileDead', event: 'AlikTurn', when: [is('alik_dead')],
    respond: async ({ game }) => {
      if (game.chance(0.5)) await game.say([{ w: 'karine', t: game.uniq(() => game.draw('DEAD_K', DEAD_KARINE)) }])
      else await game.say([game.uniq(() => game.draw('DEAD_A', DEAD_ALIK))])
    },
  },
]

export const worldRules: R[] = [...sceneRules, ...questRules, ...promiseRules, ...chorusRules, ...stateRules]
