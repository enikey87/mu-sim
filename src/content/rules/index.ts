// Все правила игры. Порядок не важен: выбор решает специфичность и вес.
import type { Game } from '../../engine/game'
import type { Rule } from '../../engine/rules'
import { toneRules, ignoreRules, periodRules, turnRules, idleRules } from './turn'
import { replyRules } from './replies'
import { choiceRules } from './choices'
import { worldRules } from './world'
import { finaleRules, endingRules } from './finales'
import { rudeRules, rudeSaysRules } from './rude'

export const allRules: Rule<Game>[] = [...toneRules, ...ignoreRules, ...periodRules, ...turnRules, ...idleRules, ...replyRules, ...choiceRules, ...worldRules, ...finaleRules, ...endingRules, ...rudeRules, ...rudeSaysRules]
