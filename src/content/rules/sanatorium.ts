// Первый возврат из пропажи — санаторий «Солнышко» (#1701): реплика Алика и карточка пансионата
// одним ходом. Разовость держит факт `sanatoriumAt`, который пишется здесь же, где происходит акция.
import { type Rule, missing, set } from '../fact'
import { D, SANATORIUM_CARD, SANATORIUM_LINK } from '../excuses'
import { alikDead, blocked, endgame, phoneKarine, sanatoriumAt } from '../memkeys'
import type { ContentApi } from '../../engine/game'
import type { GameEvent, Offer } from './events'

/** Возврат из пропажи без акции — в смерти, блоке, у Карине и в эндгейме: там Алик молчит или говорит
 *  своей линией, а карточка пансионата спорила бы с состоянием мира. */
export const sanatoriumRules: Rule<ContentApi, GameEvent, Offer>[] = [
  {
    name: 'Back_Sanatorium', event: 'OfflineReturn',
    when: [missing(sanatoriumAt), missing(alikDead), missing(blocked), missing(phoneKarine), missing(endgame.active)],
    respond: async ({ game, facts }) => {
      game.applyFacts([set(sanatoriumAt, Number(facts.sent))])
      await game.say([game.uniq(() => `${game.draw('SANATORIUM_A', D.SANATORIUM_A)}, ${game.draw('SANATORIUM_B', D.SANATORIUM_B)}`)])
      game.push({ kind: 'sanatorium', text: SANATORIUM_CARD, link: SANATORIUM_LINK })
    },
  },
]
