// Линия суда: каждая угроза судом двигает дело на ступень (court = номер ступени).
// 0 насмешка → 1 юрист Арсен → 2 досудебная претензия → 3 заседание (сцена) → 4 апелляция → 5 Страсбург → 6 решение; дальше — «опять суд?».
import type { Game } from '../../engine/game'
import { type Rule, eq, gte, lte, add, set, is, missing } from '../../engine/rules'
import type { GameEvent } from './events'
import { COURT, COURT_AFTER, COURT_LAWYER_AGAIN, COURT_VERDICT_AFTER_LETTER } from '../quests'
import { THREAT_AGAIN } from '../misc'
import { meet } from '../world'
import { count, court, intro, paydayScene } from '../memkeys'

type R = Rule<Game, GameEvent>
const threat = eq('tone', 'threat')

async function saySaid(game: Game, lines: ReadonlyArray<readonly [string, string]>): Promise<void> {
  for (const [w, t] of lines) { await game.say([w === 'alik' ? t : { w, t }]); await game.sleep(400) }
}

export const courtRules: R[] = [
  {
    name: 'Court_Start', event: 'PlayerMessage', when: [threat], remember: [add(count.threat), set(court, 1)],
    respond: async ({ game }) => { game.mood(-1); await game.say([game.uniq(game.X.threat)]); game.goOffline(1) },
  },
  // ступень 1 — юрист: здесь Арсен входит в историю, если его ещё не было
  {
    name: 'Court_Lawyer', event: 'PlayerMessage', when: [threat, eq(court, 1), missing(intro('arsen'))], bonus: 1,
    remember: [add(count.threat), add(court), ...meet('arsen')],
    respond: async ({ game }) => { game.unlock('memory'); await saySaid(game, COURT[1]) },
  },
  {
    name: 'Court_Lawyer_Again', event: 'PlayerMessage', when: [threat, eq(court, 1), is(intro('arsen'))], bonus: 1,
    remember: [add(count.threat), add(court)],
    respond: async ({ game }) => { game.unlock('memory'); await saySaid(game, COURT_LAWYER_AGAIN) },
  },
  {
    // претензия, апелляция, Страсбург, решение — по ступеням
    name: 'Court_Step', event: 'PlayerMessage', when: [threat, gte(court, 1), lte(court, 6)], remember: [add(count.threat), add(court)],
    respond: async ({ game }) => {
      const stage = Number(game.S.mem[court]) - 1 // память уже сдвинута на следующую ступень
      game.unlock('memory')
      if (stage === 3) return game.enterNode('court', game.scenes.court.start)
      await saySaid(game, COURT[stage])
      if (stage === 5) game.unlock('strasbourg')
    },
  },
  {
    // ступень 6, когда письмо из Страсбурга уже пришло в День выплаты: решение не объявляется первым
    name: 'Court_Verdict_Lettered', event: 'PlayerMessage', when: [threat, eq(court, 6), eq(paydayScene, 'strasbourg')], bonus: 1,
    remember: [add(count.threat), add(court)],
    respond: async ({ game }) => { game.unlock('memory'); await saySaid(game, COURT_VERDICT_AFTER_LETTER) },
  },
  {
    // дело прошло все инстанции
    name: 'Court_After', event: 'PlayerMessage', when: [threat, gte(court, 7)], remember: [add(count.threat)],
    respond: async ({ game }) => {
      await game.say([game.line('COURT_AFTER', [...COURT_AFTER, ...THREAT_AGAIN], { fallback: game.X.threat })!])
    },
  },
]
