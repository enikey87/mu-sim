// Платежи по календарю: предупреждение за день, списание или неоплата с последствиями.
import type { Game } from '../../engine/game'
import { type Rule, is, set } from '../../engine/rules'
import type { GameEvent } from './events'
import {
  BILLS, billDue, lightOff, netRation, phoneWarn, type BillId,
} from '../bills'

type R = Rule<Game, GameEvent>

const billOf = (facts: { bill?: unknown }): BillId | null => {
  const id = String(facts.bill ?? '')
  return BILLS.some((b) => b.id === id) ? id as BillId : null
}

export const billRules: R[] = [
  {
    name: 'Bill_Warn', event: 'BillWarn', when: [], priority: 'system',
    respond: ({ game, facts }) => {
      const id = billOf(facts)
      if (!id || game.moneySealed()) return
      const bill = BILLS.find((b) => b.id === id)!
      if (bill.skip?.(game.S.mem)) return
      game.rules.applyOps([set(billDue(id), true)], {})
      game.notify('🏦', 'Банк', `Завтра списание: ${bill.label}, ${bill.amount.toLocaleString('ru-RU')} ₽. Успейте накопить достоинство.`)
    },
  },
  {
    name: 'Bill_Due', event: 'BillDue', when: [], priority: 'system',
    respond: ({ game, facts }) => {
      const id = billOf(facts)
      if (!id || game.moneySealed()) return
      game.chargeBill(id)
    },
  },
  // комедия: Алик замечает последствия, только если факт есть
  {
    name: 'Turn_LightOff', event: 'AlikTurn', when: [is(lightOff)], specificity: 0, weight: 6, cooldown: { turns: 5 },
    respond: async ({ game }) => {
      await game.say(['Свет отключили? Брат, это знак — экономь. Я тоже экономлю: не плачу.'])
    },
  },
  {
    name: 'Turn_NetRation', event: 'AlikTurn', when: [is(netRation)], specificity: 0, weight: 5, cooldown: { turns: 5 },
    respond: async ({ game }) => {
      await game.say(['Интернет по талонам? Пиши короче. «Мууу» — один талон.'])
    },
  },
  {
    name: 'Idle_PhoneWarn', event: 'AlikIdle', when: [is(phoneWarn)], odds: 0.4, cooldown: { turns: 8 }, priority: 'chatter',
    respond: async ({ game }) => {
      await game.say(['Оператор пишет, что ты ему должен. Знакомое чувство.'])
    },
  },
]
