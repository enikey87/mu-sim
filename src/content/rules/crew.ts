// Звонок с объекта (docs/design/crew-call.md, #325): Тарон (чайнос) звонит один раз в середине
// партии и сообщает, что всех рассчитали, кроме игрока. Дальше на звонок опираются упрёки
// игрока и ответы Алика (#577) — через факт crew.paid.
import type { Game } from '../../engine/game'
import { type Rule, gte, missing, set } from '../fact'
import type { GameEvent, Offer } from './events'
import { alikDead, blocked, crewPaid, endgame } from '../memkeys'
import { CREW_CALL } from '../crew'
import { meet } from '../world'
import { sayFresh } from './rude'

type R = Rule<Game, GameEvent, Offer>

/** Середина партии: звонок не звучит на первой неделе — тогда шутка пустая (#325). */
const CREW_CALL_MIN_DAY = 200

export const crewRules: R[] = [
  {
    name: 'Beat_CrewCall', event: 'AlikIdle', once: true, priority: 'cinematic',
    remember: meet('taron'),
    // гейты — факты мира: середина партии, нет блокировки, смерти Алика, эндгейма и открытой сцены
    when: [gte('day', CREW_CALL_MIN_DAY), missing(blocked), missing(alikDead), missing(endgame.active), missing('scene')],
    respond: async ({ game }) => {
      // пропущенный звонок с объекта — строка системы; Тарон пишет следом и этим входит в историю
      game.sys('Пропущенный звонок: Тарон (объект)')
      await game.sleep(600)
      await sayFresh(game, 'CREW_CALL', CREW_CALL)
      await game.sleep(300)
      // дальше на звонок опираются упрёки игрока и ответы Алика (#577) — факт пишется там же,
      // где звонок состоялся
      game.rules.applyOps([set(crewPaid, true)], {})
    },
  },
]
