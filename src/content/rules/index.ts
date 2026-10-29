// Все правила игры. Порядок не важен: выбор решает специфичность и вес.
import type { ContentApi } from '../../engine/game'
import type { Rule } from '../../engine/rules'
import type { GameEvent, Offer } from './events'
import { toneRules, ignoreRules, periodRules, turnRules, idleRules, awayRules, storyRules } from './turn'
import { replyRules } from './replies'
import { choiceRules } from './choices'
import { worldRules } from './world'
import { finaleRules, endingRules } from './finales'
import { rudeRules, rudeSaysRules } from './rude'
import { crewRules } from './crew'
import { courtRules } from './court'
import { paydayRules } from './payday'
import { endgameRules } from './endgame'
import { billRules } from './bills'
import { creditRules } from './credit'
import { enmityRules } from './enmity'

export const allRules: Rule<ContentApi, GameEvent, Offer>[] = [...toneRules, ...storyRules, ...ignoreRules, ...periodRules, ...turnRules, ...idleRules, ...awayRules, ...replyRules, ...choiceRules, ...worldRules, ...finaleRules, ...endingRules, ...rudeRules, ...rudeSaysRules, ...crewRules, ...courtRules, ...paydayRules, ...endgameRules, ...billRules, ...creditRules, ...enmityRules]
