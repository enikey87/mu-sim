// Все правила игры. Порядок не важен: выбор решает специфичность и вес.
import type { Game } from '../../engine/game'
import type { Rule } from '../../engine/rules'
import type { GameEvent, Offer } from './events'
import { toneRules, ignoreRules, periodRules, turnRules, idleRules, awayRules, storyRules } from './turn'
import { replyRules } from './replies'
import { choiceRules } from './choices'
import { worldRules } from './world'
import { finaleRules, endingRules } from './finales'
import { rudeRules, rudeSaysRules } from './rude'
import { courtRules } from './court'
import { paydayRules } from './payday'
import { endgameRules } from './endgame'
import { billRules } from './bills'
import { creditRules } from './credit'

export const allRules: Rule<Game, GameEvent, Offer>[] = [...toneRules, ...storyRules, ...ignoreRules, ...periodRules, ...turnRules, ...idleRules, ...awayRules, ...replyRules, ...choiceRules, ...worldRules, ...finaleRules, ...endingRules, ...rudeRules, ...rudeSaysRules, ...courtRules, ...paydayRules, ...endgameRules, ...billRules, ...creditRules]
