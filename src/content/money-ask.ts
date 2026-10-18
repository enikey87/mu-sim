// Место денег в партии (#795): пока открыта легенда денег, игрок спрашивает о нынешнем месте — банк,
// фундамент, сейф, крипта, «Нива». Место берётся из открытой легенды (`LEGENDS`), формулировки — по месту
// и без повторов (`freshPlayer` + реестр пулов кнопок #491), ответ — следующая реплика той же легенды.
import { type Entry, type FactOp, gate, gt, is, missing, set } from './fact'
import { needs } from './world'
import { moneyAskAt, taxFrozen, nivaBack } from './memkeys'
import type { ClaimKey } from './ids'

/** Ходов после ответа Алика или его объявления о месте денег: столько вопросы-состояния этого места молчат (#952/#962, образец окна #928/#936). */
export const MONEY_ASK_TURNS = 20
/** Вопрос о состоянии места: молчит окно своего места после ответа на вопрос, свежего объявления или другого подтверждения места (#955/#962/#981); вопросы-действия и срока окна не знают. */
export const stateQuestion = <T>(place: MoneyPlace, e: Entry<T>): Entry<T> => gate(gt(`sinceMoneyAsk.${place}`, MONEY_ASK_TURNS))(e)
/** Место денег прозвучало на ходу `sent` — легенда продолжилась, прозвучал ответ легенды, напоминание или хор (#981): state-вопросы этого места молчат окно. Источники штампа — все, где звучит легенда места вне money-ask. */
export const stampMoneyPlace = (game: { applyFacts: (ops: FactOp[]) => void }, place: MoneyPlace, sent: number): void => {
  game.applyFacts([set(moneyAskAt[place], sent)])
}

/** Утверждения журнала о месте денег (#981): какое утверждение какому месту отвечает. */
const PLACE_CLAIMS: Partial<Record<ClaimKey, MoneyPlace>> = {
  money_deposit: 'bank', money_safe: 'safe', money_foundation: 'beton', money_niva: 'niva', money_crypto: 'crypto',
}
/** Место, которое называет прозвучавшее утверждение (Алик, персонаж легенды, хор); undefined — утверждение не о месте денег. */
export const moneyPlaceOfClaim = (claim: unknown): MoneyPlace | undefined => PLACE_CLAIMS[claim as ClaimKey]

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
  bank: [
    gate(is(taxFrozen))(stateQuestion('bank', 'Алик, счета всё ещё заморожены?')),
    // «когда» — не переспрос состояния: срок живёт и в окне (#952)
    gate(is(taxFrozen))('Когда разморозят мои деньги?'),
    gate(is(taxFrozen))(stateQuestion('bank', 'Разморозка не сдвинулась?')),
    stateQuestion('bank', 'Деньги всё ещё в банке?'),
    stateQuestion('bank', 'Банк ещё держит деньги?'),
  ],
  beton: [
    stateQuestion('beton', 'Деньги всё ещё в фундаменте?'),
    stateQuestion('beton', 'Алик, фундамент не вскрывали?'),
    // триггер действия, а не только вопрос о состоянии (#889): предложение достать — в духе «с перфоратором»
    'Может, всё-таки достанем деньги из фундамента?',
    stateQuestion('beton', 'Дом стоит на моих деньгах?'),
    // живая линия бетона: доля дома, а не ещё один вопрос «где» (#920)
    'Раз дом на моих деньгах — мне должна часть дома. Хотя бы комната. Угловая.',
    stateQuestion('beton', 'Фундамент ещё целый?'),
    stateQuestion('beton', 'Под фундаментом всё лежит?'),
  ],
  safe: [
    stateQuestion('safe', 'Алик, сейф ещё закрыт?'),
    stateQuestion('safe', 'Что с ключом от сейфа?'),
    needs('nune')(stateQuestion('safe', 'Нуне с ключом не вернулась?')),
    stateQuestion('safe', 'Что там с ключом от сейфа?'),
    stateQuestion('safe', 'Деньги из сейфа достали?'),
  ],
  crypto: [
    stateQuestion('crypto', 'Алик, крипта ещё жива?'),
    stateQuestion('crypto', 'Курс лаваша сегодня смотрел?'),
    stateQuestion('crypto', 'Сколько лавашей в моём коине?'),
    stateQuestion('crypto', 'Мои деньги всё ещё в «Лаваш-коине»?'),
    stateQuestion('crypto', 'Курс вырос или упал?'),
  ],
  niva: [
    // «Нива» упоминается под своим положением (nivaHome/nivaAway), иначе упоминание — догадка;
    // после возвращения бардачок пуст, колёса на продаже — вопрос «деньги в Ниве» закрыт (#919)
    needs('niva', 'nivaHome')(gate(missing(nivaBack))(stateQuestion('niva', 'Алик, «Нива» ещё у тебя?'))),
    needs('niva', 'nivaAway')(stateQuestion('niva', 'Где сейчас «Нива»?')),
    needs('niva', 'nivaAway')(stateQuestion('niva', '«Нива» не вернулась?')),
    needs('niva', 'nivaHome')(gate(missing(nivaBack))(stateQuestion('niva', 'Деньги всё ещё в «Ниве»?'))),
    needs('niva', 'nivaHome')(gate(missing(nivaBack))(stateQuestion('niva', '«Нива» стоит или поехала?'))),
    // колёсная ветка: «Нива» вернулась без денег, но с колёсами на продажу (#919)
    needs('niva')(gate(is(nivaBack))(stateQuestion('niva', 'Колёса всё ещё продаются?'))),
    needs('niva')(gate(is(nivaBack))(stateQuestion('niva', 'Покупатель на колёса нашёлся?'))),
  ],
}
