// Место денег в партии (#795): пока открыта легенда денег, игрок спрашивает о нынешнем месте — банк,
// фундамент, сейф, крипта, «Нива». Место берётся из открытой легенды (`LEGENDS`), формулировки — по месту
// и без повторов (`freshPlayer` + реестр пулов кнопок #491), ответ — следующая реплика той же легенды.
import { type Entry, gate, is } from './fact'
import { needs } from './world'
import { registerPlayerPool } from './player-pools'
import { taxFrozen } from './memkeys'

/** Чьи легенды к какому месту относятся: банк (счета), фундамент, сейф, крипта, «Нива». */
export const MONEY_PLACES = {
  bank: ['frozen', 'grandpa_deposit'],
  beton: ['beton_money', 'beton_law', 'beton_goar'],
  safe: ['safe_nune', 'safe_baby', 'safe_wrongkey'],
  crypto: ['crypto'],
  niva: ['niva_stuck', 'niva_gone', 'niva_abroad', 'niva_back'],
} as const satisfies Record<string, readonly string[]>

export type MoneyPlace = keyof typeof MONEY_PLACES

/** Место открытой легенды; undefined — легенда не про деньги (или её нет). */
export const moneyPlaceOf = (legend: unknown): MoneyPlace | undefined =>
  (Object.keys(MONEY_PLACES) as MoneyPlace[]).find((p) => (MONEY_PLACES[p] as readonly string[]).includes(String(legend)))

/** Вопрос игрока о том, где деньги сейчас: пул на место, не меньше пяти формулировок. */
export const MONEY_ASK: Record<MoneyPlace, Entry<string>[]> = {
  bank: registerPlayerPool('MONEY_ASK_bank', [
    gate(is(taxFrozen))('Алик, счета всё ещё заморожены?'),
    gate(is(taxFrozen))('Когда разморозят мои деньги?'),
    gate(is(taxFrozen))('Разморозка не сдвинулась?'),
    'Деньги всё ещё в банке?',
    'Банк ещё держит деньги?',
  ]),
  beton: registerPlayerPool('MONEY_ASK_beton', [
    'Деньги всё ещё в фундаменте?',
    'Алик, фундамент не вскрывали?',
    // триггер действия, а не только вопрос о состоянии (#889): предложение достать — в духе «с перфоратором»
    'Может, всё-таки достанем деньги из фундамента?',
    'Дом стоит на моих деньгах?',
    // живая линия бетона: доля дома, а не ещё один вопрос «где» (#920)
    'Раз дом на моих деньгах — мне должна часть дома. Хотя бы комната. Угловая.',
    'Фундамент ещё целый?',
    'Под фундаментом всё лежит?',
  ]),
  safe: registerPlayerPool('MONEY_ASK_safe', [
    'Алик, сейф ещё закрыт?',
    'Что с ключом от сейфа?',
    needs('nune')('Нуне с ключом не вернулась?'),
    'Что там с ключом от сейфа?',
    'Деньги из сейфа достали?',
  ]),
  crypto: registerPlayerPool('MONEY_ASK_crypto', [
    'Алик, крипта ещё жива?',
    'Курс лаваша сегодня смотрел?',
    'Сколько лавашей в моём коине?',
    'Мои деньги всё ещё в «Лаваш-коине»?',
    'Курс вырос или упал?',
  ]),
  niva: registerPlayerPool('MONEY_ASK_niva', [
    // «Нива» упоминается под своим положением (nivaHome/nivaAway), иначе упоминание — догадка
    needs('niva', 'nivaHome')('Алик, «Нива» ещё у тебя?'),
    needs('niva', 'nivaAway')('Где сейчас «Нива»?'),
    needs('niva', 'nivaAway')('«Нива» не вернулась?'),
    needs('niva', 'nivaHome')('Деньги всё ещё в «Ниве»?'),
    needs('niva', 'nivaHome')('«Нива» стоит или поехала?'),
  ]),
}
