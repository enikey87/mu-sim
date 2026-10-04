// Платежи по календарю: предупреждение за день, списание или неоплата с последствиями.
import type { Game } from '../../engine/game'
import { type Rule, is, set } from '../fact'
import type { GameEvent, Offer } from './events'
import {
  BILLS, billDue, lightOff, netRation, phoneWarn, type BillId,
} from '../bills'

type R = Rule<Game, GameEvent, Offer>

const billOf = (facts: { bill?: unknown }): BillId | null => {
  const id = String(facts.bill ?? '')
  return BILLS.some((b) => b.id === id) ? id as BillId : null
}

export const billRules: R[] = [
  {
    name: 'Bill_Warn', event: 'BillWarn', when: [], priority: 'system',
    respond: ({ game, facts }) => {
      const id = billOf(facts)
      if (!id || game.moneySealed() || !game.billEventLive(id, facts.at, 'BillWarn')) return
      if (id !== 'rent') return // warn в расписании только у коммуналки (#251)
      const bill = BILLS.find((b) => b.id === id)!
      if (bill.skip?.(game.S.mem)) return
      game.rules.applyOps([set(billDue(id), true)], {})
      game.notify('🏦', 'Банк', `Завтра списание: ${bill.label}, ${bill.amount.toLocaleString('ru-RU')} ₽. Успейте накопить достоинство.`, { event: 'bank.warn' })
    },
  },
  {
    name: 'Bill_Due', event: 'BillDue', when: [], priority: 'system',
    respond: ({ game, facts }) => {
      const id = billOf(facts)
      if (!id || game.moneySealed() || !game.billEventLive(id, facts.at, 'BillDue')) return
      game.chargeBill(id)
    },
  },
  // фоновые последствия — StoryBeat (свой сюжетный ход), не ответ на AlikTurn (#533)
  {
    name: 'Beat_LightOff', event: 'StoryBeat', when: [is(lightOff)], once: true, priority: 'chatter',
    respond: async ({ game }) => {
      await game.say(['Свет отключили? Брат, это знак — экономь. Я тоже экономлю: не плачу.'])
    },
  },
  {
    name: 'Beat_NetRation', event: 'StoryBeat', when: [is(netRation)], once: true, priority: 'chatter',
    respond: async ({ game }) => {
      await game.say(['Интернет по талонам? Пиши короче. «Мууу» — один талон.'])
    },
  },
  {
    name: 'Beat_PhoneWarn', event: 'StoryBeat', when: [is(phoneWarn)], once: true, priority: 'chatter',
    respond: async ({ game }) => {
      await game.say(['Оператор пишет, что ты ему должен. Знакомое чувство.'])
    },
  },
]
