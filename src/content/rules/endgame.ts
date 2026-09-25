import type { Game } from '../../engine/game'
import { type Rule, eq, exists, is, missing, named } from '../fact'
import type { GameEvent, Offer } from './events'
import { endgame, paydayScene } from '../memkeys'

type R = Rule<Game, GameEvent, Offer>

const active = is(endgame.active)
/** Исход выплаты определён, экран концовки ещё не закрыт: группы ещё нет, но «до выплаты» уже кончилось. */
const paydayOpen = named('paydayOpen', exists(paydayScene), missing(endgame.active))

export const endgameRules: R[] = [
  {
    name: 'Endgame_Money', event: 'PlayerSays', when: [active, eq('intent', 'endgameMoney')], specificity: 100,
    respond: ({ game }) => game.endgameAction('money'),
  },
  {
    name: 'Endgame_Mute', event: 'PlayerSays', when: [active, eq('intent', 'endgameMute')], specificity: 100,
    respond: ({ game }) => game.endgameAction('mute'),
  },
  {
    name: 'Endgame_Leave', event: 'PlayerSays', when: [active, eq('intent', 'endgameLeave')], specificity: 100,
    respond: ({ game }) => game.endgameAction('leave'),
  },
  {
    name: 'Endgame_Request', event: 'PlayerSays', when: [active, eq('intent', 'request')], specificity: 100,
    respond: ({ game }) => game.endgameAction('money'),
  },
  // «Займи 50»: кнопки просьбы отвечают репликой и ачивкой, денег и долга не двигают
  ...([['yes', 'lend50Yes'], ['no', 'lend50No'], ['serious', 'lend50Serious']] as const).map(([answer, intent]): R => ({
    name: 'Lend50_' + answer, event: 'PlayerSays', when: [active, eq('intent', intent)], specificity: 100,
    respond: ({ game }) => game.endgameLend50(answer),
  })),
  {
    name: 'Endgame_Turn', event: 'AlikTurn', when: [active], specificity: 100,
    respond: ({ game }) => game.endgameFormality(),
  },
  {
    name: 'Endgame_Idle', event: 'AlikIdle', when: [active], specificity: 100, priority: 'system',
    respond: ({ game }) => game.endgameFormality(),
  },
  // пока игрока не было, в группе копятся закрывающие акты — не переводы и не отмазки: долг после выплаты не меняется
  {
    name: 'Endgame_Away', event: 'AlikAway', when: [active], specificity: 100, priority: 'system',
    respond: ({ game }) => game.awayMsg('formality'),
  },
  {
    name: 'Endgame_Formality', event: 'StoryBeat', when: [active], specificity: 100, priority: 'cinematic',
    respond: ({ game }) => game.endgameFormality(),
  },
  {
    name: 'Endgame_NoEnding', event: 'CheckEnding', when: [active], specificity: 100, priority: 'system',
    respond: () => undefined,
  },
  // за экраном концовки мир молчит: ни пачки, ни простоя, ни сюжета, ни обещаний, ни хора —
  // иначе после выплаты приходят отмазки, «переводы» и отложенные Mentioned из реплик сцены
  ...(['AlikAway', 'AlikIdle', 'StoryBeat', 'PeriodLine', 'PromiseDue', 'Mentioned'] as GameEvent[]).map((event): R => ({
    name: 'Quiet_PaydayOpen_' + event, event, when: [paydayOpen], specificity: 100, priority: 'system', respond: () => {},
  })),
]
