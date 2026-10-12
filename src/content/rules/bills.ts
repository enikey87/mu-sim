// Платежи по календарю: предупреждение за день, списание или неоплата с последствиями.
import type { Game } from '../../engine/game'
import { type Rule, is, named, ne, set } from '../fact'
import type { GameEvent, Offer } from './events'
import {
  BILLS, billDue, lightOff, netRation, phoneWarn, type BillId,
} from '../bills'

type R = Rule<Game, GameEvent, Offer>

const billOf = (facts: { bill?: unknown }): BillId | null => {
  const id = String(facts.bill ?? '')
  return BILLS.some((b) => b.id === id) ? id as BillId : null
}

// Ответ текстом был. Не-текстовый ответ (реакция, стикер, «прочитано»…) держит свой ctx.type,
// пока первый текст Алика не сотрёт его (Game.say), — так что живой не-текстовый тип на StoryBeat
// значит «текста в этом ходу ещё не было»: фон счёта ждёт настоящего ответа, а не звучит первым (#545).
const answeredWithText = named(
  'beatAfterTextAnswer',
  ne('ctx.type', 'reactOnly'), ne('ctx.type', 'sticker'), ne('ctx.type', 'photo'), ne('ctx.type', 'voice'),
  ne('ctx.type', 'transfer'), ne('ctx.type', 'fwd'), ne('ctx.type', 'readonly'),
)

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
  // фоновые последствия — StoryBeat (свой сюжетный ход), не ответ на AlikTurn (#533);
  // один гейт на все три: после хода без текста реплика ждёт следующего (#545).
  // named целиком — специфичность правила остаётся 1, раскладка StoryBeat не меняется.
  {
    name: 'Beat_LightOff', event: 'StoryBeat', when: [named('beatLightOffFresh', is(lightOff), answeredWithText)], once: true, priority: 'chatter',
    respond: async ({ game }) => {
      await game.say(['Свет отключили? Брат, это знак — экономь. Я тоже экономлю: не плачу.'])
    },
  },
  {
    name: 'Beat_NetRation', event: 'StoryBeat', when: [named('beatNetRationFresh', is(netRation), answeredWithText)], once: true, priority: 'chatter',
    respond: async ({ game }) => {
      await game.say(['Интернет по талонам? Пиши короче. «Мууу» — один талон.'])
    },
  },
  {
    name: 'Beat_PhoneWarn', event: 'StoryBeat', when: [named('beatPhoneWarnFresh', is(phoneWarn), answeredWithText)], once: true, priority: 'chatter',
    respond: async ({ game }) => {
      await game.say(['Оператор пишет, что ты ему должен. Знакомое чувство.'])
    },
  },
]
