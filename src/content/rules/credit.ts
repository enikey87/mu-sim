// Кредитная лестница: платёж по календарю; предложение и выбор — карточка банка в ленте (Game.answerCard, #287).
import type { Game } from '../../engine/game'
import { type Rule } from '../fact'
import type { GameEvent, Offer } from './events'
import { LOANS, type LoanId } from '../credit'

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
]
