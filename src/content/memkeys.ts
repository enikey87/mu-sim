// Реестр ключей памяти мира (S.mem) и досок персонажей (S.actors). Каждый строковый ключ
// проходит через этот модуль: опечатка в ключе — молча мёртвое условие правила. Точные ключи — здесь;
// семейства (`arc.<id>`, `said.<claim>`…) — до конкретного элемента в factkeys.ts, и им же
// сторожат линтер правил (tools.test.ts) и memkeys.test.ts.

import { momDachaAt, momDachaDays } from './credit'
import { registerDaysSince } from '../engine/rules/days-since'

/** Ключ пары утверждений «пойманы на противоречии»; канонический формат — здесь, lies.ts реэкспортирует. */
export const pairKey = (a: string, b: string): string => [a, b].sort().join('|')

export const HEAT = 'rude.heat'
export const blocked = 'blocked'
export const blockedHint = 'blocked.hint'
/** В текущем блоке игроку уже сказали, что статус профиля скрыт: строка звучит один раз за блок. */
export const statusHidden = 'status.hidden'
export const polite = 'polite'
export const alikDead = 'alik_dead'
export const mourning = 'mourning'
export const evicted = 'evicted'
export const vendetta = 'vendetta'
export const court = 'court'
export const courtVerdict = 'court.verdict'
/** Инстанции, которым ступень суда уже объяснила перевод («полиция сказала — это в суд») — список через запятую. */
export const courtReferral = 'court.referral'
/** Судья Ашот вернул госпошлину с извинениями: их ставит утренний источник Дня выплаты — до него об извинениях не вспоминают (#988). */
export const judgeApology = 'court.judgeApology'
/** Игрок сам оглашал план «до Страсбурга» (выбранная реплика в угрозах судом): отклик Арсена про Страсбург — только после этого (#982). */
export const saidStrasburg = 'court.saidStrasburg'
export const ritualCount = 'ritual.count'
export const ritualCut = 'ritual.cut'
export const caughtCount = 'caught'
/** Гарик сам сказал «ничего не брал»: признание в колкости ссылается на это отрицание, а не спорит с ним (#784). */
export const garikDenied = 'garik.denied'
/** День последней поимки на лжи: по нему архив эндгейма отличает свежую поимку от старой (#777).
 *  Имя — по правилу фактов-дней (`mooAt`, `sorryAt`, `thanksAt`): `caught.at` попал бы в легаси-пространство
 *  `caught.<пара утверждений>` и в сторож «новая партия не пишет старые ключи» (`lies.test.ts`). */
export const caughtAt = 'caughtAt'
export const cryptoHodl = 'crypto.hodl'
export const bathAsked = 'bath.asked'
export const mamaCalls = 'mama.calls'
export const phoneKarine = 'phone.karine'
/** Игрок сказал Карине, что Алик ему должен (сцена жены, ветка tell). */
export const karineKnowsDebt = 'karine.knowsDebt'
/** Карине считает игрока налоговой (сцена жены, ветка wrong). */
export const karineThinksTax = 'karine.thinksTax'
/** Алик сбрил усы по ставке — живёт ~40 дней (`during`), пока отрастут. */
export const alikShaved = 'alik.shaved'
/** Ставка «усы» сдержана переводом: факт навсегда — на него опирается архив дела (#608). */
export const moustacheKept = 'moustache.kept'
/** День, когда игрок спросил «как усы?» — перерыв между показами кнопки (#352). */
export const moustacheAskAt = 'moustache.askAt'
export const alikDay = 'alik.day'
/** Дней с последнего сообщения Алика — без события нет значения (#496). */
registerDaysSince('sinceAlik', alikDay)

export const mooAt = 'mooAt'
export const sorryAt = 'sorryAt'
export const rudeAt = 'rudeAt'
/** Номер хода, на котором «спасибо» подняло настроение, — перерыв между бампами. */
export const thanksAt = 'thanksAt'
export const topicRun = 'topicRun'
export const topicLast = 'topicLast'
export const legendPromiseAt = 'legendPromiseAt'
export const legendId = 'legend.id'
export const legendDay = 'legend.day'
export const legendArc = 'legend.arc'
export const nextTransfer = 'nextTransfer'
export const tileCornerRemoved = 'tile.cornerRemoved'
export const nivaAway = 'niva.away'
/** «Нива» вернулась (серия «Нива вернулась!»). */
export const nivaBack = 'niva.back'
/** «Нива» у игрока после финала «Нива выбрала тебя» (#256). */
export const nivaPlayer = 'niva.player'
/** Машина ушла с продажей зимней резины (покупатель забрал комплектом): продажа машину убирает, а не отрицает (#530). */
export const carGone = 'car.gone'
export const garikConcrete = 'garik.concrete'
export const garikCut = 'garik.cut'
export const houseOnGarik = 'house.onGarik'
export const borisMarried = 'boris.married'
/** Свадьба Размика на кране прошла — как `boris.married`. */
export const razmikMarried = 'razmik.married'
export const borisSmetaReady = 'boris.smetaReady'
export const taxFrozen = 'tax.frozen'
export const taxThawed = 'tax.thawed'
export const actSigned = 'act.signed'
export const grantPaid = 'grant.paid'
export const rubikFined = 'rubik.fined'
/** Игрок сдавал кровь — только тогда донорский центр благодарит. */
export const bloodGiven = 'blood.given'
/** Инстанция, которую игрок назвал в последней угрозе (LegalClaim в engine/input): ответ ищет тот же предмет. */
export const threatClaim = 'threat.claim'
export const nuneKeyPassed = 'nune.keyPassed'
export const nuneDekretOver = 'nune.dekretOver'
export const grandpaDying = 'grandpa.dying'
export const betonSet = 'beton.set'
export const cardSent = 'card.sent'
/** Алик хоть раз назвал сроком «завтра» / пятницу — на это слово можно ссылаться. */
export const saidTomorrow = 'said.tomorrow'
export const saidFriday = 'said.friday'
/** Алик сравнил срок с коньяком («созревает. Как коньяк») — только после этого игрок называет число «Лет двадцать?» (#918). */
export const saidKonak = 'said.konak'
/** Хаш уже прозвучал в партии: вводящие строки пишут факт, угроза «пойду на хаш» ждёт его (#1143). */
export const saidHash = 'said.hash'

export const payday = {
  at: 'payday.at', sum: 'payday.sum', chain: 'payday.chain', caught: 'payday.caught',
  morning: 'payday.morning', contra: 'payday.contra', doubt: 'payday.doubt', refused: 'payday.refused',
  resume: 'payday.resume',
  /** Подводка (#893): день первого штриха — линия признаков началась. */
  lead: 'payday.lead',
  /** Сколько штрихов подводки сыграно (анонс выплаты ждёт двух). */
  signs: 'payday.signs',
  surrender: 'payday.surrender',
  /** Штрих уже звучал сегодня: один штрих в день (during, 1 день). */
  signToday: 'payday.signToday',
} as const

export const count = {
  rude: 'count.rude', cow: 'count.cow', threat: 'count.threat',
  violence: 'count.violence', intimidation: 'count.intimidation', sorry: 'count.sorry',
  /** Сколько раз за партию сработало тёплое «спасибо» (Tone_Thanks*) — третье даёт once-реплику (#354). */
  thanks: 'count.thanks',
} as const

export const endgame = {
  active: 'endgame.active', started: 'endgame.started', intro: 'endgame.intro', forms: 'endgame.forms',
  exits: 'endgame.exits', mutes: 'endgame.mutes', renames: 'endgame.renames',
  /** Какие факты архива дела уже прозвучали в группе — одна ссылка на факт, а не на партию (#608). */
  arch: 'endgame.arch',
} as const

/** Праздник, который партия уже поздравила: «newYear@2026» — год начала окна (#255). */
export const holidayGreeted = 'holiday.greeted'

/** «Займи 50» в эндгейме: просьба прозвучала и что игрок ответил (docs/design/lend-50.md). */
export const lend50 = { asked: 'lend50.asked', answer: 'lend50.answer' } as const

export const cb = <C extends string>(claim: C): `cb.${C}` => `cb.${claim}`
export const met = <W extends string>(who: W): `met.${W}` => `met.${who}`
export const intro = <W extends string>(who: W): `intro.${W}` => `intro.${who}`
export const asked = <A extends string>(arc: A): `asked.${A}` => `asked.${arc}`
export const doneAsked = <A extends string>(arc: A): `doneAsked.${A}` => `doneAsked.${arc}`
export const topic = <K extends string>(k: K): `topic.${K}` => `topic.${k}`
export const topicMute = <K extends string>(k: K): `topicMute.${K}` => `topicMute.${k}`
export const finaleOf = <A extends string>(arc: A): `finale.${A}` => `finale.${arc}`
/** День, когда финал сериала прозвучал: архив группы придерживает свежий финал как новость (#771). */
export const finaleAt = <A extends string>(arc: A): `finale.at.${A}` => `finale.at.${arc}`
/** День, когда серия включила состояние (`state` эпизода: болезнь Бориса, свадьба). Пишет движок при показе серии;
 *  по нему отмазки сверяют дату цитаты с событием мира («тогда Борис заболел», #859). */
export const stateAt = (key: string, who?: string): string => (who === undefined ? `state.at.${key}` : `state.at.${key}.${who}`)
export const legendOf = <A extends string>(arc: A): `legend.of.${A}` => `legend.of.${arc}`
export const wedding = <W extends string>(who: W): `wedding.${W}` => `wedding.${who}`
/** Активная сцена Дня выплаты (id узла) — факт на доске мира. */
export const paydayScene = 'payday'
export const lightOff = 'light.off'
export const netRation = 'net.ration'
export const phoneWarn = 'phone.warn'
/** Кредитная лестница / мама-запаска — точные ключи; семейства sold./mom./credit.<loan>.* — в factkeys. */
export const creditStage = 'credit.stage'
export const creditOffer = 'credit.offer'
export const creditBroke = 'credit.broke'
export const momDone = 'mom.done'
export const creditDeclined = 'credit.declined'
/** Первое дно: до Дня выплаты уровень не возвращается в «норму» (#279 / docs/design/money.md). */
export const moneyPoor = 'money.poor'
/** День последней карточки «остаток критический»: банк повторяет её не чаще раза в POOR_REPEAT_DAYS (#337). */
export const criticalAt = 'money.criticalAt'
/** Сумма, названная в открытом предложении кредита: банк даёт ровно её (#337). */
export const creditOfferSum = 'credit.offerSum'
/** Коллекторы остались на объекте Алика — микрозайм с игрока больше не требуют (#128). */
export const collectorsRecruited = 'collectors.recruited'
/** Взыскание развернулось: коллекторы работают на игрока, а не на Алика (#679). */
export const collectorsTurned = 'collectors.turned'
/** Игрок уже спросил «Лет двадцать?»: ответ один, повтор той же фразы Алика запрещён симуляцией. */
export const whenYears = 'when.years'
/** Звонок с объекта состоялся: «всех рассчитали, кроме игрока» (#325, docs/design/crew-call.md). */
export const crewPaid = 'crew.paid'
/** Ход звонка: «кто звонил» без имени живёт только несколько ходов после него (#928). */
export const crewPaidAt = 'crew.paidAt'
/** Ход подтверждения места денег — ответ игроку, объявление, легенда, напоминание или хор (#952/#955, объявления — #962, остальные источники — #981): state-вопросы этого места молчат окно после него. */
export const moneyAskAt = {
  bank: 'money.askAt.bank', beton: 'money.askAt.beton', safe: 'money.askAt.safe',
  crypto: 'money.askAt.crypto', niva: 'money.askAt.niva',
} as const

/** Ход последнего перевода 50 ₽ (#1003): окно отклика на перевод — кнопка реакции не зависит от ctx. */
export const transferAt = 'transfer.at'
/** Сумма последнего перевода: подстановка в реакции игрока (#1003). */
export const transferAmount = 'transfer.amount'
/** Первое сообщение участника в партии (#973): кто и на каком ходу — окно отклика на дебют. */
export const debutWho = 'debut.who'
export const debutAt = 'debut.at'
/** Арсен записал крик игрока на диктофон и собрал трек «Плиточник» (rude-дебют): до этого трек, крик и бит не упоминаются (#982). */
export const arsenTrack = 'arsen.track'
/** Участник уже писал сам: повторные сообщения окно дебюта не открывают (#973); пара суда спрашивает
 *  именно письмо, а не знакомство-упоминание (#1017) — generic хранит литерал для типизированных условий. */
export const wrote = <W extends string>(who: W): `wrote.${W}` => `wrote.${who}`
/** Звонок с объекта утверждает, что «всем рассчитали, кроме игрока» (#1057): ставится только
 *  вариантами звонка, где это прозвучало; вариант «плиточнику — в следующий раз» и список Мкртича
 *  такого не говорят, и утверждающие упрёки без факта молчат. */
export const crewAllPaid = 'crew.allPaid'
/** Рубик остался жить на объекте и спит в ванной (#590): до этой серии про ванную не говорят. */
export const rubikBath = 'rubik.bath'
/** Заметные системные события с окном реакции (#927): ход события для «свежих» фактов. */
export const ramPhotoAt = 'ram.photoAt'
export const borisSaleAt = 'boris.saleAt'
export const vacancyAt = 'vacancy.at'
export const avitoReviewAt = 'avito.reviewAt'
export const countersuitAt = 'countersuit.at'
export const rubikAskAt = 'rubik.askAt'
export const kettleAt = 'lottery.kettleAt'
/** Первое сообщение Арсена-юриста (#958): ход входа в историю — окно отклика. */
export const lawyerAt = 'court.lawyerAt'
/** Прямой вопрос Алика «тебе коллекторы пишут?» (#958): ход вопроса. */
export const collectorsAskAt = 'collectors.askAt'
/** Предложение стажировки «Деньги-Ара» (#958): ход предложения. */
export const internAt = 'collectors.internAt'
/** Вопрос про дырку от образца плитки (#958): ход вопроса. */
export const rubikHoleAt = 'rubik.holeAt'
/** Первое сообщение заказчика Гранта («плитка — орудие», #983): ход реплики. */
export const grantTileAt = 'tile.grantAt'
/** Смена фото профиля без усов (#1013): заметное событие ставки — окно отклика игрока; сам факт
 *  «усы сбриты» живёт в `alik.shaved`, а это — ход события, ход и три после которого кнопка реакции жива. */
export const moustachePhotoAt = 'moustache.photoAt'
/** Слово «ставка» прозвучало (#1029): объявитель — строка-ответ окна усов (`MOUSTACHE_PHOTO_B[0]`),
 *  ответ на «как усы?» и строка сбривания; до него вопрос «Ставка сыграла?» ссылался бы на невведённое понятие. */
export const moustacheStakeSaid = 'moustache.stakeSaid'
/** Мама на рынке (#1030): конец узла `drive` квеста `q_mama` — заметное событие с окном отклика (пирожки-аванс). */
export const mamaMarketAt = 'mama.marketAt'
/** Голосовое-плач мамы Алика (#1085): ход строки `RUDE_CALLS_VOICE` серии звонков — событие с окном
 *  отклика (ход и три после); штамп ставит только строка плача, болтовня мамы и голосовое Самвела — нет. */
export const mamaVoiceAt = 'mama.voiceAt'
/** Игрок отказался от стажировки коллекторов (#1041): выбор переключает финал арки с «Стажёра» на обычный. */
export const internDeclined = 'intern.declined'
/** Второй дебют Гранта (#1041): дом выставлен на продажу «с кладом» — заметное событие с окном отклика. */
export const grantHouseAt = 'grant.houseAt'
/** Фото «платёжки» от Алика (#1017): заметное событие — ход фото, ход и PHOTO_FRESH_TURNS после
 *  которого кнопка отклика жива; окно потребляет ответ игрока. */
export const photoAt = 'photo.photoAt'
/** Развод дяди Самвела на свадьбе (#1037): заметное событие серии — ход строки серии, ход и три
 *  после которого кнопка отклика жива; окно потребляет ответ игрока. */
export const samvelDivorceAt = 'samvel.divorceAt'
/** Вердикт суда (#1058): кульминация линии — ход строки вердикта, ход и три после которого живёт
 *  окно отклика; сам вердикт уже хранит `courtVerdict`, это только штамп хода. */
export const courtVerdictAt = 'court.verdictAt'
/** Мошеннический кредит на имя игрока (#1069): сцена `loan` объявляет остаток 300 000 ₽ — состояние
 *  мира остаётся на доске, чтобы банк напомнил о нём после сцены (факт-состояние, не штамп хода). */
export const fraudLoan = 'bank.fraudLoan'

/** Первая серия плиточной арки (#1059): заказчик поскользнулся на плитке игрока — ход строки,
 *  ход и три после которого живёт окно отклика (следующие серии отвечают только с arc.tile ≥ 2). */
export const tileSlipAt = 'tile.slipAt'
/** Продажа имущества со дна (#1084): ход продажи и что именно продано — заметное системное событие,
 *  отклик живёт ход продажи и три после; сам факт `sold.<id>` хранит, что вещь ушла. */
export const saleAt = 'sale.at'
export const saleWhat = 'sale.what'
/** Чёрный список истёк своим сроком молча (#1050): движок ставит метку при тихом снятии блока
 *  (`nextDay`), первый доставленный ход её потребляет и нарративит разблокировку; путь через
 *  посредника снимает блок раньше (`blocked = false`) — метки не появляется. */
export const blockLifted = 'block.lifted'

/** Ключи досок персонажей (S.actors), не мира. */
export const sick = 'sick'
export const interjections = 'interjections'

/** Факты события (собираются в facts() на каждый fire) — не mem, но валидатор обязан их знать; сверка с facts() — factkeys.test.ts. */
export const EVENT_KEY_LIST = [
  'day', 'dow', 'month', 'dom', 'holiday', 'sent', 'moo', 'tier', 'mood', 'patience', 'money', 'debt', 'fifty', 'paid',
  'moneyNormal', 'moneyLow', 'moneyBottom', 'paymentDueTomorrow',
  'items', 'latestItem', 'legend', 'mooFresh', 'sinceRude', 'sinceCrew', 'sorrySwing', 'promiseLive', 'promisePassed', 'promiseStake',
  'debutWho', 'debutFresh', 'transferFresh', 'transferAmount',
  'ramPhotoFresh', 'borisSaleFresh', 'vacancyFresh', 'avitoReviewFresh', 'rubikAskFresh', 'kettleFresh',
  'lawyerFresh', 'collectorsAskFresh', 'internFresh', 'rubikHoleFresh', 'countersuitFresh', 'grantTileFresh', 'moustachePhotoFresh', 'mamaMarketFresh', 'mamaVoiceFresh', 'photoFresh', 'samvelDivorceFresh', 'courtVerdictFresh', 'tileSlipFresh', 'saleFresh', 'saleItem', 'grantHouseFresh',
  'period', 'night', 'offline', 'scene', 'sinceAlik', 'lateCount', 'arcAvailable',
  'arcsStarted', 'arcsDone', 'arcsMature', 'quests', 'callbackReady', 'lieOpen', 'lieKind', 'lieAlikOld', 'deathCanAdvance', 'collectorsCanAdvance',
  'intent', 'tone', 'arg', 'category', 'arc', 'argArcDone', 'greet', 'promise', 'somedayCount', 'promiseRecordDays', 'promiseRecordNew', 'promiseRecordSeen', momDachaDays,
] as const
export type EventKey = (typeof EVENT_KEY_LIST)[number]
export const EVENT_KEYS: ReadonlySet<string> = new Set(EVENT_KEY_LIST)

export const ACTOR_KEY_LIST = [sick, interjections] as const
export type ActorKey = (typeof ACTOR_KEY_LIST)[number]
export const ACTOR_KEYS: ReadonlySet<string> = new Set(ACTOR_KEY_LIST)

export const MEM_KEYS: ReadonlySet<string> = new Set([
  HEAT, blocked, blockedHint, statusHidden, polite, bloodGiven, alikDead, mourning, evicted, vendetta, court, courtVerdict,
  ritualCount, ritualCut, caughtCount, caughtAt, garikDenied, cryptoHodl, bathAsked, mamaCalls, phoneKarine, karineKnowsDebt, karineThinksTax, alikShaved, moustacheKept, moustacheAskAt, alikDay, mooAt, sorryAt, courtReferral, judgeApology, saidStrasburg,
  rudeAt, thanksAt, topicRun, topicLast, legendPromiseAt, legendId, legendDay, legendArc, nextTransfer, tileCornerRemoved, nivaAway, nivaPlayer, carGone,
  garikConcrete, garikCut, houseOnGarik, borisMarried, razmikMarried, nivaBack, borisSmetaReady, taxFrozen, taxThawed,
  actSigned, grantPaid, rubikFined, nuneKeyPassed, nuneDekretOver, grandpaDying, betonSet, cardSent, paydayScene, threatClaim, saidTomorrow, saidFriday, saidKonak, saidHash,
  lightOff, netRation, phoneWarn, holidayGreeted,
  creditStage, creditOffer, creditBroke, momDone, creditDeclined, moneyPoor, collectorsRecruited, collectorsTurned, criticalAt, creditOfferSum, momDachaAt, crewPaid, crewPaidAt, crewAllPaid, rubikBath, whenYears, ...Object.values(moneyAskAt), transferAt, transferAmount, moustachePhotoAt, moustacheStakeSaid, mamaMarketAt, mamaVoiceAt, samvelDivorceAt, courtVerdictAt, tileSlipAt, saleAt, saleWhat, fraudLoan, blockLifted, internDeclined, grantHouseAt, photoAt, debutWho, debutAt, arsenTrack,
  ramPhotoAt, borisSaleAt, vacancyAt, avitoReviewAt, rubikAskAt, kettleAt, lawyerAt, collectorsAskAt, internAt, rubikHoleAt, countersuitAt, grantTileAt,
  ...Object.values(payday), ...Object.values(count), ...Object.values(endgame), ...Object.values(lend50),
])
