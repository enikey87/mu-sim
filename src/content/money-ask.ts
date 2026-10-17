// Место денег в партии (#795): пока открыта легенда денег, игрок спрашивает о нынешнем месте — банк,
// фундамент, сейф, крипта, «Нива». Место берётся из открытой легенды (`LEGENDS`), формулировки — по месту
// и без повторов (`freshPlayer` + реестр пулов кнопок #491), ответ — следующая реплика той же легенды.
import { type Entry, gate, gt, is, missing } from './fact'
import { needs } from './world'
import { registerPlayerPool } from './player-pools'
import { taxFrozen, nivaBack } from './memkeys'

/** Ходов после ответа Алика или его объявления о месте денег: столько вопросы-состояния этого места молчат (#952/#962, образец окна #928/#936). */
export const MONEY_ASK_TURNS = 20
/** Вопрос о состоянии места: молчит окно своего места после ответа на вопрос или свежего объявления (#955/#962); вопросы-действия и срока окна не знают. */
const state = <T>(place: MoneyPlace, e: Entry<T>): Entry<T> => gate(gt(`sinceMoneyAsk.${place}`, MONEY_ASK_TURNS))(e)

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
    gate(is(taxFrozen))(state('bank', 'Алик, счета всё ещё заморожены?')),
    // «когда» — не переспрос состояния: срок живёт и в окне (#952)
    gate(is(taxFrozen))('Когда разморозят мои деньги?'),
    gate(is(taxFrozen))(state('bank', 'Разморозка не сдвинулась?')),
    state('bank', 'Деньги всё ещё в банке?'),
    state('bank', 'Банк ещё держит деньги?'),
  ]),
  beton: registerPlayerPool('MONEY_ASK_beton', [
    state('beton', 'Деньги всё ещё в фундаменте?'),
    state('beton', 'Алик, фундамент не вскрывали?'),
    // триггер действия, а не только вопрос о состоянии (#889): предложение достать — в духе «с перфоратором»
    'Может, всё-таки достанем деньги из фундамента?',
    state('beton', 'Дом стоит на моих деньгах?'),
    // живая линия бетона: доля дома, а не ещё один вопрос «где» (#920)
    'Раз дом на моих деньгах — мне должна часть дома. Хотя бы комната. Угловая.',
    state('beton', 'Фундамент ещё целый?'),
    state('beton', 'Под фундаментом всё лежит?'),
  ]),
  safe: registerPlayerPool('MONEY_ASK_safe', [
    state('safe', 'Алик, сейф ещё закрыт?'),
    state('safe', 'Что с ключом от сейфа?'),
    needs('nune')(state('safe', 'Нуне с ключом не вернулась?')),
    state('safe', 'Что там с ключом от сейфа?'),
    state('safe', 'Деньги из сейфа достали?'),
  ]),
  crypto: registerPlayerPool('MONEY_ASK_crypto', [
    state('crypto', 'Алик, крипта ещё жива?'),
    state('crypto', 'Курс лаваша сегодня смотрел?'),
    state('crypto', 'Сколько лавашей в моём коине?'),
    state('crypto', 'Мои деньги всё ещё в «Лаваш-коине»?'),
    state('crypto', 'Курс вырос или упал?'),
  ]),
  niva: registerPlayerPool('MONEY_ASK_niva', [
    // «Нива» упоминается под своим положением (nivaHome/nivaAway), иначе упоминание — догадка;
    // после возвращения бардачок пуст, колёса на продаже — вопрос «деньги в Ниве» закрыт (#919)
    needs('niva', 'nivaHome')(gate(missing(nivaBack))(state('niva', 'Алик, «Нива» ещё у тебя?'))),
    needs('niva', 'nivaAway')(state('niva', 'Где сейчас «Нива»?')),
    needs('niva', 'nivaAway')(state('niva', '«Нива» не вернулась?')),
    needs('niva', 'nivaHome')(gate(missing(nivaBack))(state('niva', 'Деньги всё ещё в «Ниве»?'))),
    needs('niva', 'nivaHome')(gate(missing(nivaBack))(state('niva', '«Нива» стоит или поехала?'))),
    // колёсная ветка: «Нива» вернулась без денег, но с колёсами на продажу (#919)
    needs('niva')(gate(is(nivaBack))(state('niva', 'Колёса всё ещё продаются?'))),
    needs('niva')(gate(is(nivaBack))(state('niva', 'Покупатель на колёса нашёлся?'))),
  ]),
}
