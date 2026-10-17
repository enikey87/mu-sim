// Место денег в партии (#795): пока открыта легенда денег, игрок спрашивает о нынешнем месте — банк,
// фундамент, сейф, крипта, «Нива». Место берётся из открытой легенды (`LEGENDS`), формулировки — по месту
// и без повторов (`freshPlayer` + реестр пулов кнопок #491), ответ — следующая реплика той же легенды.
import { type Entry, gate, gt, is, missing } from './fact'
import { needs } from './world'
import { registerPlayerPool } from './player-pools'
import { taxFrozen, nivaBack } from './memkeys'

/** Ходов после ответа Алика о месте денег: столько вопросы-состояния молчат, чтобы не переспрашивать подтверждённое (#952, образец окна #928/#936). */
export const MONEY_ASK_TURNS = 20
/** Вопрос о состоянии места («всё ещё», «не вскрывали», «целый») — молчит окно после ответа; вопросы-действия и срока окна не знают. */
const state = <T>(e: Entry<T>): Entry<T> => gate(gt('sinceMoneyAsk', MONEY_ASK_TURNS))(e)

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
    gate(is(taxFrozen))(state('Алик, счета всё ещё заморожены?')),
    // «когда» — не переспрос состояния: срок живёт и в окне (#952)
    gate(is(taxFrozen))('Когда разморозят мои деньги?'),
    gate(is(taxFrozen))(state('Разморозка не сдвинулась?')),
    state('Деньги всё ещё в банке?'),
    state('Банк ещё держит деньги?'),
  ]),
  beton: registerPlayerPool('MONEY_ASK_beton', [
    state('Деньги всё ещё в фундаменте?'),
    state('Алик, фундамент не вскрывали?'),
    // триггер действия, а не только вопрос о состоянии (#889): предложение достать — в духе «с перфоратором»
    'Может, всё-таки достанем деньги из фундамента?',
    state('Дом стоит на моих деньгах?'),
    // живая линия бетона: доля дома, а не ещё один вопрос «где» (#920)
    'Раз дом на моих деньгах — мне должна часть дома. Хотя бы комната. Угловая.',
    state('Фундамент ещё целый?'),
    state('Под фундаментом всё лежит?'),
  ]),
  safe: registerPlayerPool('MONEY_ASK_safe', [
    state('Алик, сейф ещё закрыт?'),
    state('Что с ключом от сейфа?'),
    needs('nune')(state('Нуне с ключом не вернулась?')),
    state('Что там с ключом от сейфа?'),
    state('Деньги из сейфа достали?'),
  ]),
  crypto: registerPlayerPool('MONEY_ASK_crypto', [
    state('Алик, крипта ещё жива?'),
    state('Курс лаваша сегодня смотрел?'),
    state('Сколько лавашей в моём коине?'),
    state('Мои деньги всё ещё в «Лаваш-коине»?'),
    state('Курс вырос или упал?'),
  ]),
  niva: registerPlayerPool('MONEY_ASK_niva', [
    // «Нива» упоминается под своим положением (nivaHome/nivaAway), иначе упоминание — догадка;
    // после возвращения бардачок пуст, колёса на продаже — вопрос «деньги в Ниве» закрыт (#919)
    needs('niva', 'nivaHome')(gate(missing(nivaBack))(state('Алик, «Нива» ещё у тебя?'))),
    needs('niva', 'nivaAway')(state('Где сейчас «Нива»?')),
    needs('niva', 'nivaAway')(state('«Нива» не вернулась?')),
    needs('niva', 'nivaHome')(gate(missing(nivaBack))(state('Деньги всё ещё в «Ниве»?'))),
    needs('niva', 'nivaHome')(gate(missing(nivaBack))(state('«Нива» стоит или поехала?'))),
    // колёсная ветка: «Нива» вернулась без денег, но с колёсами на продажу (#919)
    needs('niva')(gate(is(nivaBack))(state('Колёса всё ещё продаются?'))),
    needs('niva')(gate(is(nivaBack))(state('Покупатель на колёса нашёлся?'))),
  ]),
}
