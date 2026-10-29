// Режим мира «вражда» (#1558): две поверхности окна холодной войны — семья-посредник и слухи
// о жизни Алика. Сериалы в режиме стоят (гейт в движке, `availableArcs`/`arcCanAdvance`), поэтому
// ход заполняют эти два бита: они и есть сжатый мир.
import type { ContentApi } from '../../engine/game'
import { type Rule, missing } from '../fact'
import type { GameEvent, Offer } from './events'
import { WORLD } from '../world'
import { alikDead, endgame, mourning } from '../memkeys'

type R = Rule<ContentApi, GameEvent, Offer>

/** Общие гейты режима: сход жив (извинение снимает `vendetta`), Алик не мёртв и в семье не прощаются. */
const inMode = [WORLD.enmity, missing(alikDead), missing(mourning), missing(endgame.active)]

export const enmityRules: R[] = [
  {
    name: 'Beat_EnmityFamily', event: 'StoryBeat', when: inMode, odds: 0.5, cooldown: { turns: 3 }, priority: 'chatter',
    respond: ({ game }) => game.enmityFamily(),
  },
  {
    name: 'Beat_EnmityRumor', event: 'StoryBeat', when: inMode, odds: 0.5, cooldown: { turns: 3 }, priority: 'chatter',
    respond: ({ game }) => game.enmityRumor(),
  },
]
