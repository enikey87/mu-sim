import type { Game } from '../../engine/game'
import { type Rule, eq, is } from '../../engine/rules'
import type { GameEvent } from './events'
import { endgame } from '../memkeys'

type R = Rule<Game, GameEvent>

const active = is(endgame.active)

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
  {
    name: 'Endgame_Turn', event: 'AlikTurn', when: [active], specificity: 100,
    respond: ({ game }) => game.endgameFormality(),
  },
  {
    name: 'Endgame_Idle', event: 'AlikIdle', when: [active], specificity: 100, priority: 'system',
    respond: ({ game }) => game.endgameFormality(),
  },
  {
    name: 'Endgame_Formality', event: 'StoryBeat', when: [active], specificity: 100, priority: 'cinematic',
    respond: ({ game }) => game.endgameFormality(),
  },
  {
    name: 'Endgame_NoEnding', event: 'CheckEnding', when: [active], specificity: 100, priority: 'system',
    respond: () => undefined,
  },
]
