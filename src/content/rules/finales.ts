// Финалы сериалов (ArcFinale { arc }) и концовки игры (CheckEnding после каждого хода).
// Обычный финал — правило только с условием на сериал; частные финалы специфичнее и перекрывают его.
import type { Game } from '../../engine/game'
import { type Rule, eq } from '../../engine/rules'
import type { GameEvent, Offer } from './events'
import { ARCS } from '../arcs'
import { FINALES, ENDINGS, type Finale } from '../finales'

type R = Rule<Game, GameEvent, Offer>

const finale = (arc: string, f: Finale | null, when = f?.when ?? [], alt = ''): R => ({
  name: `Finale_${arc}_${f?.id ?? 'default'}${alt}`, event: 'ArcFinale', when: [eq('arc', arc), ...when], priority: 'cinematic',
  respond: ({ game }) => game.playFinale(arc, f),
})

export const finaleRules: R[] = Object.keys(ARCS).flatMap((arc) => [
  finale(arc, null),
  ...(FINALES[arc] ?? []).flatMap((f) => [finale(arc, f), ...(f.orWhen ? [finale(arc, f, f.orWhen, '_or')] : [])]),
])

// Концовка — один раз за игру; самая специфичная (редкое сочетание) побеждает.
export const endingRules: R[] = ENDINGS.map((e) => ({
  name: `Ending_${e.id}`, event: 'CheckEnding', when: e.when, once: true, priority: 'system',
  respond: ({ game }) => game.reachEnding(e.id),
}))
