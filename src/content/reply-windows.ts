// Свип «показал — ответить нельзя» (#1487): реестр всего, что показывается игроку без варианта
// реакции, — с классом и причиной. Механика окна отклика живёт в других местах: карточка или строка
// сцены штампует ход (`stamp`), `facts()` выставляет `<событие>Fresh`, оффер `Opt_<событие>` в
// `rules/choices.ts` даёт кнопку, пул `player-choice-pools.ts` — строки, ответ потребляет штамп.
// Здесь — то, что окна не имеет ПО ЗАМЫСЛУ, чтобы класс не рождался заново по одной находке за раунд:
// линтер (`reply-windows.test.ts`) требует запись для каждой карточки ленты, каждого события телефона,
// каждой развязки сцены и каждого штампа — новая карточка, сцена или окно без классификации красит сюит.
import type { PhoneEvent } from '../engine/state'
import { moneyAt } from './memkeys'

/** Карточка ленты без окна: текст карточки — её ключ (`NOTIF[].t`), менять текст — менять запись. */
export interface SilentCard {
  card: string
  why: string
}

/** Фон ленты (#1487): карточки, которые не обращаются к игроку и не объявляют событие партии.
 *  Флейвор-лента — фон по замыслу: окно убило бы её темп (промпт цикла, «Внимание к задуманному»).
 *  Сюда же — банк и мама: у них свои механики ответа, а не диалоговое окно. */
export const SILENT_CARDS: readonly SilentCard[] = [
  { card: `Списание {spend} ₽. {what}. Баланс: {money} ₽`, why: 'регулярное списание с карты: карточка ничего не спрашивает, ответ — денежными кнопками' },
  { card: `Сынок, ты поел?`, why: 'голос мамы: риторический вопрос, не обращение к игроку' },
  { card: `Сынок, Алик заплатил?`, why: 'голос мамы' },
  { card: `Сынок, позвони маме.`, why: 'голос мамы' },
  { card: `Сынок, с Новым годом. Алик тебя поздравил? А перевёл?`, why: 'праздничное поздравление мамы' },
  { card: `Сынок, с 8 Марта. Цветы Алику не дари — пусть он тебе перевод сделает.`, why: 'праздничное поздравление мамы' },
  { card: `Сынок, скоро женский день. Алика не поздравляй — поторапливай.`, why: 'праздничное поздравление мамы' },
  { card: `Сынок, с Трндезом. Через костёр прыгают влюблённые. Алик пусть прыгнет с переводом.`, why: 'праздничное поздравление мамы' },
  { card: `Сынок, с Днём строителя. Ты строил, Алик обещал. Перевода нет — говорит, профессиональное.`, why: 'праздничное поздравление мамы' },
  { card: `Видела передачу про таких, как твой Алик. Там тоже не заплатили.`, why: 'флейвор ленты: мама и её передачи' },
  { card: `Может, вернёшься домой? Тут тоже есть плитка.`, why: 'флейвор ленты: приглашение домой без вопроса' },
  { card: `Отзывы об «Алик Стройка под ключ» скрыты по жалобе владельца. Всех 48.`, why: 'фон: действие владельца объявления, реакции нет' },
  { card: `Штраф 500 ₽: парковка в неположенном месте.`, why: 'автоматическое списание, вопрос не задаётся' },
  { card: `Ереван +32°. Идеальная погода, чтобы бетон застыл. Не застынет.`, why: 'погода: фон ленты, вопрос не задаётся' },
  { card: `+3° и дождь. Хорошая погода, чтобы ждать.`, why: 'погода: фон ленты, вопрос не задаётся' },
  { card: `Когда за квартиру?`, why: 'регулярное напоминание хозяина, механика коммуналки' },
  { card: `Жду до пятницы. Пятница — это не Аликова пятница.`, why: 'регулярное напоминание хозяина, механика коммуналки' },
  { card: `В Ереване бетон отказался застывать. Эксперты разводят руками.`, why: 'новость ленты' },
  { card: `Баран-прораб из Абовяна дал первое интервью. На вопрос «как платить людям» ответил «бее».`, why: 'новость ленты' },
  { card: `Кредит одобрен! 94% годовых. Поздравляем!`, why: 'фон банка: предложение с кнопками приходит отдельной картой bank.offer' },
  { card: `Спасибо, что пришли сдать кровь! Вы наш герой. Приходите ещё.`, why: 'благодарность донорского центра' },
  { card: `В вашей микроволновке теперь обед грею. Спасибо, что продали.`, why: 'флейвор ленты: соседка и микроволновка' },
  { card: `Покупатель гитары пишет: «струна лопнула, как ваши нервы».`, why: 'флейвор ленты: покупатель гитары' },
  { card: `Плитку с объекта видел на Авито. Красивая была. Твоя была.`, why: 'флейвор ленты: Алик заметил свою плитку' },
  { card: `Зимнюю резину поставили на КамАЗ. Владелец спрашивает, где машина.`, why: 'флейвор ленты: шиномонтаж' },
  { card: `Скидка 10% на похороны для должников… то есть кредиторов Воздухонесяна. Промокод: БРАТДЖАН`, why: 'флейвор ленты: ритуальные услуги' },
  { card: `Анализы готовы: содержание гречки в крови в четыре раза выше нормы.`, why: 'флейвор ленты: поликлиника' },
  { card: `Братан, я тоже работал на Алика. В 2011-м. Жду до сих пор.`, why: 'флейвор ленты: Серёга работал на Алика в 2011-м' },
  { card: `Банк удивлён: переводы по 50 ₽ — это не доход, это хобби.`, why: 'фон банка: переводы по 50 ₽' },
  { card: `В Ереване человек пережил собственные похороны и сказал на них тост.`, why: 'новость ленты: похороны Алика' },
]

/** Карточка движка (`PhoneEvent`): каждое событие либо имеет окно/свои кнопки, либо записано здесь.
 *  Сверка с `PHONE_EVENTS` — линтер: новое событие без записи краснеет. */
export interface PhoneCardNote {
  event: PhoneEvent
  why: string
}

export const PHONE_CARD_NOTES: readonly PhoneCardNote[] = [
  { event: 'bank.summary', why: 'недельная сводка по карте: вопрос не задаётся, разбор — документами банка' },
  { event: 'bank.offer', why: 'свои кнопки: карточка несёт `offer` (взять кредит / продать вещь / не сейчас)' },
  { event: 'bank.refusal', why: 'отказ перевода: ответ — повторная просьба или деньги, отдельного окна не требует' },
  { event: 'bank.level', why: 'уровень остатка: состояние денег, кнопки отчаяния собираются тем же уровнем' },
  { event: 'bank.warn', why: 'предупреждение о сроке списания: механика коммуналки, ответ — кнопка оплаты' },
  { event: 'mom', why: 'помощь мамы: деньги уже пришли, карточка не задаёт вопроса' },
  { event: 'life', why: 'флейвор-лента: разобрана поштучно в SILENT_CARDS' },
  { event: 'battery', why: 'баннер системы: заряд, а не сообщение игроку' },
  { event: 'unread', why: 'баннер системы: счётчик непрочитанных' },
]

/** Развязка сцены без окна: конец опубликованной сцены (`makeScenes`, узел без `opts`).
 *  Сцена, у которой бывает вопрос к игроку, штампует ход — такие узлы здесь не перечислены,
 *  их штампы сверяет линтер с `EVENT_SOURCES`. */
export interface SceneEnding {
  node: string
  why: string
}

/** Концы сцен (#1487): игрок вёл сцену выборами (`opts`), финальная реплика — развязка, а не
 *  обращение; ответ идёт обычным чатом. Служебные узлы без реплик показывать нечего. */
/** Причина большинства развязок: сцена уже держала ответ выборами, финал — развязка, а не вопрос. */
const ENDING_WHY = 'развязка сцены: игрок вёл её выборами, отдельного обращения в финальной реплике нет — ответ обычным чатом'
/** Служебный узел: ни реплик, ни выбора — показывать нечего. */
const EMPTY_WHY = 'служебный узел без реплик: переход или исход сцены, показывать нечего'

export const SCENE_ENDINGS: readonly SceneEnding[] = [
  { node: 'meet/obj2', why: ENDING_WHY },
  { node: 'meet/cafe2', why: ENDING_WHY },
  { node: 'meet/cafe3', why: ENDING_WHY },
  { node: 'meet/home2', why: ENDING_WHY },
  { node: 'meet/transfer_pls', why: ENDING_WHY },
  { node: 'card/comm', why: ENDING_WHY },
  { node: 'card/sbp2', why: ENDING_WHY },
  { node: 'card/knows_no', why: ENDING_WHY },
  { node: 'barter/take', why: ENDING_WHY },
  { node: 'barter/refuse', why: ENDING_WHY },
  { node: 'customer/other', why: ENDING_WHY },
  { node: 'customer/bag', why: ENDING_WHY },
  { node: 'customer/end', why: EMPTY_WHY },
  { node: 'nephew/caught2', why: ENDING_WHY },
  { node: 'nephew/age', why: ENDING_WHY },
  { node: 'nephew/pass', why: ENDING_WHY },
  { node: 'lend/yes', why: ENDING_WHY },
  { node: 'lend/no2', why: ENDING_WHY },
  { node: 'lend/logic', why: ENDING_WHY },
  { node: 'redo/look2', why: ENDING_WHY },
  { node: 'redo/ramq', why: ENDING_WHY },
  { node: 'redo/no', why: ENDING_WHY },
  { node: 'toast/good', why: ENDING_WHY },
  { node: 'toast/debt', why: ENDING_WHY },
  { node: 'toast/mom', why: ENDING_WHY },
  { node: 'newjob/go', why: ENDING_WHY },
  { node: 'newjob/first', why: ENDING_WHY },
  { node: 'tax/truth2', why: ENDING_WHY },
  { node: 'tax/ok', why: ENDING_WHY },
  { node: 'tax/mad', why: ENDING_WHY },
  { node: 'wife/tell2', why: ENDING_WHY },
  { node: 'wife/wrong', why: ENDING_WHY },
  { node: 'choice/pick', why: ENDING_WHY },
  { node: 'deathbed/legal', why: ENDING_WHY },
  { node: 'deathbed/cold', why: ENDING_WHY },
  { node: 'amnesty/yes', why: ENDING_WHY },
  { node: 'amnesty/no', why: ENDING_WHY },
  { node: 'invoice/rob', why: ENDING_WHY },
  { node: 'invoice/plan', why: ENDING_WHY },
  { node: 'invoice/sign', why: ENDING_WHY },
  { node: 'loan/where', why: ENDING_WHY },
  { node: 'loan/bank', why: ENDING_WHY },
  { node: 'heir/ram', why: ENDING_WHY },
  { node: 'heir/boris', why: ENDING_WHY },
  { node: 'tribunal/guilty', why: ENDING_WHY },
  { node: 'tribunal/lawyer', why: ENDING_WHY },
  { node: 'tribunal/moo', why: ENDING_WHY },
  { node: 'ritual/hash', why: ENDING_WHY },
  { node: 'ritual/moo', why: ENDING_WHY },
  { node: 'q_hash/eat', why: ENDING_WHY },
  { node: 'q_hash/money', why: ENDING_WHY },
  { node: 'q_niva/push', why: ENDING_WHY },
  { node: 'q_niva/no', why: ENDING_WHY },
  { node: 'q_tamada/no', why: ENDING_WHY },
  { node: 'q_lottery/no', why: ENDING_WHY },
  { node: 'q_parking/wait', why: ENDING_WHY },
  { node: 'q_parking/no', why: ENDING_WHY },
  { node: 'q_mama/no', why: ENDING_WHY },
  { node: 'q_crypto/lavash', why: ENDING_WHY },
  { node: 'q_crypto/hodl', why: ENDING_WHY },
  { node: 'q_photo/no', why: ENDING_WHY },
  { node: 'q_witness/truth', why: ENDING_WHY },
  { node: 'q_witness/lie', why: ENDING_WHY },
  { node: 'q_goat/climb', why: ENDING_WHY },
  { node: 'q_goat/no', why: ENDING_WHY },
  { node: 'payday/bag', why: ENDING_WHY },
  { node: 'payday/witness', why: ENDING_WHY },
  { node: 'payday/doubt', why: ENDING_WHY },
  { node: 'payday/share', why: ENDING_WHY },
  { node: 'payday/shareSamvel', why: ENDING_WHY },
  { node: 'payday/refuse', why: ENDING_WHY },
  { node: 'payday/catch', why: EMPTY_WHY },
  { node: 'payday/accept', why: ENDING_WHY },
  { node: 'payday/moo', why: ENDING_WHY },
]

/** Карточка ленты, у которой нет ни окна, ни записи в реестре: класс «показал — ответить нельзя».
 *  Чистая функция — один и тот же вердикт читают линтер и сканер `pool-scan` (#1487);
 *  отрицательный контроль гоняет её на синтетической карточке без штампа. */
export const unclassifiedCards = <T extends { t: string; stamp?: string }>(cards: readonly T[], windowStamps: ReadonlySet<string>): string[] =>
  cards
    .filter((c) => (c.stamp ? !windowStamps.has(c.stamp) && !SILENT_CARDS.some((s) => s.card === c.t) : !SILENT_CARDS.some((s) => s.card === c.t)))
    .map((c) => `«${c.t.slice(0, 60)}»${c.stamp ? ` (штамп ${c.stamp} без окна)` : ''}`)

/** Штамп, который не открывает окна: факт хода для другой механики, а не событие-обращение. */
export interface SilentStamp {
  at: string
  why: string
}

export const SILENT_STAMPS: readonly SilentStamp[] = [
  { at: moneyAt, why: 'движение денег: факт «деньги ходили» для окна перевода (#1376), не событие-обращение' },
]
