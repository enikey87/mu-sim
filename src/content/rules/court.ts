// Линия суда: каждая угроза судом двигает дело на ступень (court = номер ступени).
// 0 насмешка → 1 юрист Арсен → 2 досудебная претензия → 3 заседание (сцена) → 4 апелляция → 5 Страсбург → 6 решение; дальше — «опять суд?».
import type { Game } from '../../engine/game'
import { type Rule, eq, gte, lte, add, set } from '../../engine/rules'
import { COURT, COURT_AFTER } from '../quests'
import { THREAT_AGAIN } from '../misc'

type R = Rule<Game>
const threat = eq('tone', 'threat')

async function saySaid(game: Game, lines: ReadonlyArray<readonly [string, string]>): Promise<void> {
  for (const [w, t] of lines) { await game.say([w === 'alik' ? t : { w, t }]); await game.sleep(400) }
}

export const courtRules: R[] = [
  {
    name: 'Court_Start', event: 'PlayerMessage', when: [threat], remember: [add('count.threat'), set('court', 1)],
    respond: async ({ game }) => { game.mood(-1); await game.say([game.uniq(game.X.threat)]); game.goOffline(1) },
  },
  {
    // юрист, претензия, апелляция, Страсбург, решение — по ступеням
    name: 'Court_Step', event: 'PlayerMessage', when: [threat, gte('court', 1), lte('court', 6)], remember: [add('count.threat'), add('court')],
    respond: async ({ game }) => {
      const stage = Number(game.S.mem.court) - 1 // память уже сдвинута на следующую ступень
      game.unlock('memory')
      if (stage === 3) return game.enterNode('court', game.scenes.court.start)
      // Арсен уже писал (племянник, «сам такой») — не «здравствуйте, это Арсен» второй раз
      const known = !!game.S.mem['intro.arsen']
      await saySaid(game, COURT[stage].map(([w, t]) => [w, known && w === 'arsen' ? t.replace(/^Здравствуйте, это Арсен, юрист Алика\./, 'Это снова Арсен. Теперь официально — юрист Алика.') : t] as const))
      if (stage === 5) game.unlock('strasbourg')
    },
  },
  {
    // дело прошло все инстанции
    name: 'Court_After', event: 'PlayerMessage', when: [threat, gte('court', 7)], remember: [add('count.threat')],
    respond: async ({ game }) => {
      await game.say([game.line('COURT_AFTER', [...COURT_AFTER, ...THREAT_AGAIN], { fallback: game.X.threat })!])
    },
  },
]
