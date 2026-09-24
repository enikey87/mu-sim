// Кредитная лестница: предложение на дне, платёж по календарю, мама-запаска.
import type { Game } from '../../engine/game'
import { type Rule, eq, is } from '../fact'
import type { GameEvent, Offer } from './events'
import { LOANS, creditOffer, type LoanId } from '../credit'

type R = Rule<Game, GameEvent, Offer>

const loanOf = (facts: { credit?: unknown }): LoanId | null => {
  const id = String(facts.credit ?? '')
  return LOANS.some((l) => l.id === id) ? id as LoanId : null
}

export const creditRules: R[] = [
  {
    name: 'Credit_Due', event: 'CreditDue', when: [], priority: 'system',
    respond: ({ game, facts }) => {
      const id = loanOf(facts)
      if (!id || game.moneySealed() || !game.creditEventLive(id, facts.at)) return
      game.chargeCredit(id)
    },
  },
  {
    name: 'Says_creditTake', event: 'PlayerSays', when: [eq('intent', 'creditTake'), is(creditOffer)], bonus: 8,
    respond: ({ game }) => { game.takeCredit(); game.setCtx(null) },
  },
  {
    name: 'Says_creditSell', event: 'PlayerSays', when: [eq('intent', 'creditSell'), is(creditOffer)], bonus: 8,
    respond: ({ game }) => { game.sellThing(); game.setCtx(null) },
  },
]
