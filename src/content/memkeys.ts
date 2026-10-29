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
/** Ход, на котором сход объявлен (15-й крик, #1565): окно примирения у поздней вендетты читается
 *  по нему. Штамп ставит сама `Rude_Vendetta` — `remember` пишет только константы, а ход меняется. */
export const vendettaAt = 'vendettaAt'
/** Сход снят извинением (#1570): метку ставит движок в ходу перехода `vendetta: true → false`,
 *  а не список мест снятия — иначе новый канал выхода молчал бы. Статус профиля «Не враг. Пока»
 *  читает её один раз за партию. */
export const vendettaLifted = 'vendetta.lifted'
/** Первое прямое «прости» в живом сходе уже отклонено (#1570): цена выхода названа, мир даёт
 *  только посредник или следующее извинение. Ставит отказ, читает правило принятия. */
export const vendettaPrice = 'vendetta.price'
/** Режим холодной войны после вендетты: Алик говорит сухо и формально, тёплые пулы недоступны.
 *  Ставит сама Вендетта, снимает принятое извинение (ритуал примирения, посредник, обычный sorry)
 *  и объявленный мир — «Мууу» и встречный иск. */
export const coldWar = 'coldWar'
export const court = 'court'
export const courtVerdict = 'court.verdict'
/** Официальное вежливое обращение уже прозвучало, но дело ещё не сдвинулось: вежливый путь двигает ступень
 *  каждым вторым упоминанием (#1435) — флаг и есть это «первое из двух». */
export const courtPolite = 'court.polite'
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
/** Алик впервые назвал код от сейфа (первая строка легенды Гарика): строки и вопросы про «код» звучат только после неё (#1338). */
export const garikCode = 'garik.code'
/** День последней поимки на лжи: по нему архив эндгейма отличает свежую поимку от старой (#777).
 *  Имя — по правилу фактов-дней (`mooAt`, `sorryAt`, `thanksAt`): `caught.at` попал бы в легаси-пространство
 *  `caught.<пара утверждений>` и в сторож «новая партия не пишет старые ключи» (`lies.test.ts`). */
export const caughtAt = 'caughtAt'
/** Сколько РАЗНЫХ пар утверждений игрок поймал (#1481): повторная поимка той же пары — одна поимка.
 *  Валюта концовок «Следователь» и «Мешок мелочи»; тотальный `caught` остаётся ачивкам настойчивости.
 *  Штамп пары — эпизод журнала со статусом `caught` (легаси `caught.<пара>` новая партия не пишет). */
export const caughtUnique = 'caughtUnique'
export const cryptoHodl = 'crypto.hodl'
export const bathAsked = 'bath.asked'
/** Ход, на котором условие Карине про ванную прозвучало (#1382): сцена мира ставит факт, но своего окна
 *  отклика у условия не было — игрок не мог ответить, пока условие актуально. Штамп ставит сама строка
 *  о ванной (`stamp`), окно живёт ход события и три после, ответ игрока его потребляет. */
export const bathAskedAt = 'bath.askedAt'
/** Ответ игрока на условие про ванную (#1382): ветка выбора, а не «ответил вообще» — `debt` значит
 *  «переложу в счёт долга» (согласие на вычет в День выплаты), `later` и `tile` согласия на вычет не дают.
 *  На этот факт опираются строки отказа в Дне выплаты вместо голого `bath.asked` (#862). */
export const bathAnswered = 'bath.answered'
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
/** Ход признания «это я учу английский» и карточки курса mu-en (#1410): по нему открывается окно
 *  отклика (ход события и три после) и он же держит однократность карточки — значение ставится один
 *  раз за партию, поэтому повторная карточка невозможна и после ответа игрока. */
export const muenAt = 'muenAt'
/** Вопросов про корову/фон через оба правила — порог карточки mu-en. */
export const muenAsked = 'muenAsked'
/** Игрок ответил на окно курса mu-en (#1410): окно потреблено выбором, `muenAt` не стирается —
 *  иначе стёртый штамп вернул бы карточку вторым признанием. */
export const muenAnswered = 'muen.answered'
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
/** Профессия Бориса («стал прорабом») прозвучала серией: follow «профессия у него серьёзная» — по этому факту, а не по номеру шага арки (#1253). */
export const borisForeman = 'boris.foreman'
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
/** Бабушка Асмик вошла в историю: пришла её открытка с носками. До неё имени в отмазках нет (#1329). */
export const asmikCard = 'asmik.card'
/** Алик хоть раз назвал сроком «завтра» / пятницу — на это слово можно ссылаться. */
export const saidTomorrow = 'said.tomorrow'
export const saidFriday = 'said.friday'
/** Алик сравнил срок с коньяком («созревает. Как коньяк») — только после этого игрок называет число «Лет через двадцать?» (#918). */
export const saidKonak = 'said.konak'
/** Хаш уже прозвучал в партии: вводящие строки пишут факт, угроза «пойду на хаш» ждёт его (#1143). */
export const saidHash = 'said.hash'
/** Алик хоть раз поклялся формой из D.OATH (`{o}` в promiseLine): «Хватит клясться» ждёт этой клятвы, а не «Слово Алика» и не срока без формы клятвы (#1183). */
export const saidOath = 'said.oath'
/** Нуне сама сказала «Не пишите Алику, он нервничает» (интро её арки): вариант-цитата в дебюте Нуне ждёт услышанной фразы (#1148). */
export const saidNuneNoWrite = 'said.nune.noWrite'
/** Хор легенды beton_law: Грант сказал, что конверт стал частью дома — дебютный пул цитирует только эту фразу (#1179). */
export const saidGrantEnvelope = 'said.grant.envelope'
/** Алик сравнил деньги с усами («Деньги — как усы. Отрастут.») — строкой сбривания или ответом на
 *  «как усы?»: цитата «деньги — как усы, говоришь?» в пуле «как усы?» ждёт прозвучавшей фразы (#1171). */
export const saidMoneyMoustache = 'said.moneyMoustache'
/** Алик хоть раз произнёс «регламент» в окне вежливости (ответ на крик или дно-ответ на деньги) —
 *  вариант «Какой ещё регламент?!» ждёт именно этого слова, а не самого факта `polite` (#1230, рецидив #831-2). */
export const saidRegiment = 'said.regiment'

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
  /** Номер текущего блока: Rude_Block растит счёт, вкус блока (чужие каналы → мама → канцелярия → тишина)
   *  читает его в ответе того же правила (#1423). */
  block: 'count.block',
  /** Сколько раз игрок крикнул уже после факта Вендетты (#1425): хроническая грубость после схода ведёт
   *  к раннему финалу «Кровный враг». Ставит движок на каждом грубом ходу (как `rudeAt`), а не правило:
   *  блок и чужие каналы перехватывают ответ, но крик остаётся криком. */
  rudeAfterVendetta: 'count.rudeAfterVendetta',
} as const

export const endgame = {
  active: 'endgame.active', started: 'endgame.started', intro: 'endgame.intro', forms: 'endgame.forms',
  exits: 'endgame.exits', mutes: 'endgame.mutes', renames: 'endgame.renames',
  /** Какие факты архива дела уже прозвучали в группе — одна ссылка на факт, а не на партию (#608). */
  arch: 'endgame.arch',
  /** Терминальный эпилог вражды (#1556): та же заморозка мира, но своя группа и свой цикл, а не День выплаты. */
  vendetta: 'endgame.vendetta',
  /** Терминальный эпилог отлучения (#1571): «Кровный враг» — концовка, а не чекпоинт; свой поток без просьбы. */
  bloodfeud: 'endgame.bloodfeud',
} as const

/** Праздник, который партия уже поздравила: «newYear@2026» — год начала окна (#255). */
export const holidayGreeted = 'holiday.greeted'

/** «Займи 50» в эндгейме: просьба прозвучала, что игрок ответил, и выдано ли спонсорское имя группы (#1239). */
export const lend50 = { asked: 'lend50.asked', answer: 'lend50.answer', sponsor: 'lend50.sponsor' } as const

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
/** Коллекторы приехали к Алику: третья серия вводит чай, и только с неё «чай длинный» уместен в пуле (#1158). */
export const collectorsTea = 'collectors.tea'
/** Ход эпизода, который поставил факт арки (чай, вербовка, разворот): отклик в этом ходе, не в каденсе follow (#1192). */
export const collectorsEpAt = 'collectors.epAt'
/** Игрок уже спросил «Лет через двадцать?»: ответ один, повтор той же фразы Алика запрещён симуляцией. */
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
/** Ход новейшего денежного события (#1376): эпизода, который сам назвал свою сумму или сдвинул деньги —
 *  допработа, вычет хаша, чайник в счёт долга, аванс пирожками. Реакция на перевод ссылается на сумму,
 *  которую чат уже перекрыл своим денежным ходом: окно перевода живёт, только пока перевод — новейшее
 *  денежное событие партии (`money.at` ≤ `transfer.at`). */
export const moneyAt = 'money.at'
/** Первое сообщение участника в партии (#973): кто и на каком ходу — окно отклика на дебют. */
export const debutWho = 'debut.who'
export const debutAt = 'debut.at'
/** Арсен записал крик игрока на диктофон и собрал трек «Плиточник» (rude-дебют): до этого трек, крик и бит не упоминаются (#982). */
export const arsenTrack = 'arsen.track'
/** Ход строки трека (#1351): у самой строки своё окно отклика — трек приходит из rude-цепочки
 *  независимо от дебюта Арсена, и окно дебюта (три отправки) к тому времени почти всегда закрыто. */
export const arsenTrackAt = 'arsen.trackAt'
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
/** Предложение Карине в 7-й серии Рубика (#1471): строка Карине штампует ход события, и пока он свеж,
 *  окно отклика предлагает пары #920 («Скажи, что подождёшь»). Сам ответ окно не потребляет: пары
 *  одноразовые (`TALK:arc:rubik:*`), а штамп держит только окно кнопки. */
export const rubikProposalAt = 'rubik.proposalAt'
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
/** Кража плиточной рекламы (#1216): финал узла `send` квеста `q_photo` — Алик подписал фото игрока
 *  «Плитка от Алика Воздухонесяна. Сам клал». Заметное событие с окном отклика (ход и три после),
 *  окно потребляет ответ игрока; сам факт «фото ушло» остаётся ачивкой `q_photo`. */
export const tileAdAt = 'tile.adAt'
/** Развязка мини-гэга «Наследство дяди Тиграна» (#1439): обе ветки квеста `q_inherit` кончаются заметным
 *  событием — сгоревшими нотариальными 54 000 ₽ Алика или его обидой. Штамп ставит последняя строка ветки,
 *  окно отклика живёт ход события и три после, ответ игрока его потребляет. */
export const inhDoneAt = 'inh.doneAt'
/** Ветка «радоваться» квеста `q_inherit` (#1439): оба нотариуса оказались мошенниками, Тиграна не существует,
 *  Алик потерял свои 54 000 ₽. На этот факт гейтнуты строки окна отклика и «сгоревшее» продолжение
 *  утверждения `money_inheritance` — в отказной ветке их нет. */
export const inhBurned = 'inh.burned'
/** Ветка «отговорить» квеста `q_inherit` (#1439): Алик обиделся, деньги целы, достижение «Спаситель наследства». */
export const inhRefused = 'inh.refused'
/** Финал квеста-тамады (#1222): узел `yes` квеста `q_tamada` — шесть часов застолья за Алика, работа
 *  +5 000, разбитый сервиз тёти Гоар −6 000 и знакомство с ней. Заметное событие с окном отклика (ход и
 *  три после); окно потребляет ответ игрока, ачивка `q_tamada` и `intro.goar` остаются фактами узла. */
export const tamadaDoneAt = 'tamada.doneAt'
/** Голосовое-плач мамы Алика (#1085): ход строки `RUDE_CALLS_VOICE` серии звонков — событие с окном
 *  отклика (ход и три после); штамп ставит только строка плача, болтовня мамы и голосовое Самвела — нет. */
export const mamaVoiceAt = 'mama.voiceAt'
/** Игрок отказался от стажировки коллекторов (#1041): выбор переключает финал арки с «Стажёра» на обычный. */
export const internDeclined = 'intern.declined'
/** Игрок согласился на стажировку коллекторов (#1335): строки согласия пула `P_INTERN` (индексы 0 и 2).
 *  Единственный источник утверждений «взяли на стажировку» в эпилоге: stored finale `intern` пишется до
 *  оффера (#1056), поэтому ни молчание окна, ни отказ стажировкой не считаются. */
export const internAccepted = 'intern.accepted'
/** Второй дебют Гранта (#1041): дом выставлен на продажу «с кладом» — заметное событие с окном отклика. */
export const grantHouseAt = 'grant.houseAt'
/** Фото «платёжки» от Алика (#1017): заметное событие — ход фото, ход и PHOTO_FRESH_TURNS после
 *  которого кнопка отклика жива; окно потребляет ответ игрока. */
export const photoAt = 'photo.photoAt'
/** Прямой вопрос Алика о баране по памяти партии (#1252): «Помнишь, я отдал тебе «баран Борис»?
 *  Всё ещё у тебя?» — заметное событие с окном отклика (ход вопроса и три после), окно потребляет
 *  ответ игрока. Штамп ставит сама строка памяти, а не ход Алика: другие воспоминания окна не открывают. */
export const borisAskAt = 'boris.askAt'
/** Развод дяди Самвела на свадьбе (#1037): заметное событие серии — ход строки серии, ход и три
 *  после которого кнопка отклика жива; окно потребляет ответ игрока. */
export const samvelDivorceAt = 'samvel.divorceAt'
/** Карточка друга Серёги «Ну что, заплатил твой Алик?» (#1292): заметное событие — карточка штампует
 *  ход, окно отклика живёт ход и три после; повторная карточка (перерыв 40 ходов) открывает окно заново.
 *  Окно потребляет ответ игрока. */
export const seryogaAskAt = 'seryoga.askAt'
/** Строка Гранта «Алик, завтра в бане как договорились. Ой. Не тот чат.» (#1292): заметное событие
 *  серии — ход строки и три после; окно потребляет ответ игрока, серия идёт дальше. */
export const grantBathAt = 'grant.bathAt'
/** Вопрос Алика «ты обиделся?» после тишины (#1292): заметное событие Idle_Offended / Away_Offended —
 *  ход вопроса и три после. Строка живёт в своём пуле (`IDLE_ASK`), поэтому штамп ставит производитель
 *  события, а не сравнение готового текста. Окно потребляет ответ игрока. */
export const offendedAskAt = 'offended.askAt'
/** Вердикт суда (#1058): кульминация линии — ход строки вердикта, ход и три после которого живёт
 *  окно отклика; сам вердикт уже хранит `courtVerdict`, это только штамп хода. */
export const courtVerdictAt = 'court.verdictAt'
/** Мошеннический кредит на имя игрока (#1069): сцена `loan` объявляет остаток 300 000 ₽ — состояние
 *  мира остаётся на доске, чтобы банк напомнил о нём после сцены (факт-состояние, не штамп хода). */
export const fraudLoan = 'bank.fraudLoan'

/** Первая серия плиточной арки (#1059): заказчик поскользнулся на плитке игрока — ход строки,
 *  ход и три после которого живёт окно отклика (следующие серии отвечают только с arc.tile ≥ 2). */
export const tileSlipAt = 'tile.slipAt'
/** Второй эпизод плиточной арки, суд (#1317): «Заказчик в гипсе. Подаёт в суд. На тебя» — первое событие
 *  партии про фигурантство самого игрока. Штамп ставит сама строка эпизода: без неё события нет, значит
 *  нет и окна отклика. */
export const tileCourtAt = 'tile.courtAt'
/** Четвёртый эпизод плиточной арки (#1303): «я твой адвокат… из твоего долга вычту» — крупнейшее
 *  единичное изменение долга партии (fx.debt −10 000). Штамп ставит сама строка эпизода: без неё
 *  вычета не было (`ctx.debtMoved`), значит и окна отклика нет. */
export const tileLawyerAt = 'tile.lawyerAt'
/** Пятый эпизод плиточной арки, реестр памятников (#1317): «внесли в реестр памятников. Теперь с неё
 *  нельзя ничего требовать» — строка сама объявляет смену статуса плитки и требований по ней. Штамп
 *  ставит строка эпизода: без неё смены статуса не прозвучало, значит нет и окна отклика. */
export const tileMonumentAt = 'tile.monumentAt'
/** Возврат «Нивы» (#1306): серия «вернулась! Без денег. Но с новыми колёсами и грузинскими номерами» —
 *  заметное событие арки (отзыв claim `money_niva`, `nivaAway` снят, `nivaBack` поставлен). Штамп ставит
 *  сама строка эпизода: без неё события нет, значит нет и окна отклика. */
export const nivaBackAt = 'niva.backAt'
/** Продажа имущества со дна (#1084): ход продажи и что именно продано — заметное системное событие,
 *  отклик живёт ход продажи и три после; сам факт `sold.<id>` хранит, что вещь ушла. */
export const saleAt = 'sale.at'
export const saleWhat = 'sale.what'
/** Свип карточек без окна отклика (#1487): каждая карточка, которая обращена к игроку или объявляет
 *  событие партии, штампует свой ход — по нему `<событие>Fresh` открывает оффер, ответ игрока
 *  потребляет штамп. Фон ленты штампов не получает и записан в реестре `reply-windows.ts`. */
export const hhJobAt = 'hh.jobAt'
export const seryogaLoanAt = 'seryoga.loanAt'
export const dachaAskAt = 'dacha.askAt'
export const evictAt = 'evict.at'
export const collectorsEchoAt = 'collectors.echoAt'
export const threatGovAt = 'threat.gov.at'
export const fraudCardAt = 'bank.fraudCard.at'
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
  'items', 'latestItem', 'legend', 'mooFresh', 'sinceRude', 'sinceCrew', 'sorrySwing', 'vendettaFall', 'promiseLive', 'promisePassed', 'promiseStake',
  'debutWho', 'debutFresh', 'arsenTrackFresh', 'bathAskFresh', 'transferFresh', 'transferAmount',
  'ramPhotoFresh', 'borisSaleFresh', 'vacancyFresh', 'avitoReviewFresh', 'rubikAskFresh', 'kettleFresh',
  'lawyerFresh', 'collectorsAskFresh', 'collectorsEpFresh', 'internFresh', 'rubikHoleFresh', 'rubikProposalFresh', 'countersuitFresh', 'grantTileFresh', 'moustachePhotoFresh', 'mamaMarketFresh', 'mamaVoiceFresh', 'photoFresh', 'tileAdFresh', 'inhDoneFresh', 'tamadaDoneFresh', 'samvelDivorceFresh', 'courtVerdictFresh', 'tileSlipFresh', 'tileCourtFresh', 'tileLawyerFresh', 'tileMonumentFresh', 'nivaBackFresh', 'saleFresh', 'saleItem', 'grantHouseFresh', 'borisAskFresh', 'seryogaFresh', 'grantBathFresh', 'offendedAskFresh', 'muenFresh',
  'hhJobFresh', 'seryogaLoanFresh', 'dachaAskFresh', 'evictFresh', 'collectorsEchoFresh', 'threatGovFresh', 'fraudCardFresh',
  'period', 'night', 'offline', 'scene', 'sinceAlik', 'lateCount', 'arcAvailable',
  'arcsStarted', 'arcsDone', 'arcsMature', 'quests', 'callbackReady', 'lieOpen', 'lieKind', 'lieAlikOld', 'deathCanAdvance', 'collectorsCanAdvance',
  'intent', 'tone', 'arg', 'category', 'arc', 'argArcDone', 'greet', 'promise', 'somedayCount', 'promiseRecordDays', 'promiseRecordNew', 'promiseRecordSeen', 'promiseRecordVoice', 'promiseRecordDue', momDachaDays,
] as const
export type EventKey = (typeof EVENT_KEY_LIST)[number]
export const EVENT_KEYS: ReadonlySet<string> = new Set(EVENT_KEY_LIST)

export const ACTOR_KEY_LIST = [sick, interjections] as const
export type ActorKey = (typeof ACTOR_KEY_LIST)[number]
export const ACTOR_KEYS: ReadonlySet<string> = new Set(ACTOR_KEY_LIST)

export const MEM_KEYS: ReadonlySet<string> = new Set([
  HEAT, muenAt, muenAsked, muenAnswered, blocked, blockedHint, statusHidden, polite, bloodGiven, alikDead, mourning, evicted, vendetta, vendettaAt, vendettaLifted, vendettaPrice, coldWar, court, courtVerdict, courtPolite,
  ritualCount, ritualCut, caughtCount, caughtUnique, caughtAt, garikDenied, garikCode, cryptoHodl, bathAsked, bathAskedAt, bathAnswered, mamaCalls, phoneKarine, karineKnowsDebt, karineThinksTax, alikShaved, moustacheKept, moustacheAskAt, alikDay, mooAt, sorryAt, courtReferral, judgeApology, saidStrasburg,
  rudeAt, thanksAt, topicRun, topicLast, legendPromiseAt, legendId, legendDay, legendArc, nextTransfer, tileCornerRemoved, nivaAway, nivaPlayer, carGone,
  garikConcrete, garikCut, houseOnGarik, borisMarried, razmikMarried, nivaBack, borisSmetaReady, borisForeman, taxFrozen, taxThawed,
  actSigned, grantPaid, rubikFined, nuneKeyPassed, nuneDekretOver, grandpaDying, betonSet, cardSent, asmikCard, paydayScene, threatClaim, saidTomorrow, saidFriday, saidKonak, saidHash, saidOath, saidNuneNoWrite, saidGrantEnvelope, saidMoneyMoustache, saidRegiment,
  lightOff, netRation, phoneWarn, holidayGreeted,
  creditStage, creditOffer, creditBroke, momDone, creditDeclined, moneyPoor, collectorsRecruited, collectorsTurned, collectorsTea, collectorsEpAt, criticalAt, creditOfferSum, momDachaAt, crewPaid, crewPaidAt, crewAllPaid, rubikBath, whenYears, ...Object.values(moneyAskAt), transferAt, transferAmount, moneyAt, moustachePhotoAt, moustacheStakeSaid, mamaMarketAt, mamaVoiceAt, samvelDivorceAt, courtVerdictAt, tileSlipAt, tileCourtAt, tileLawyerAt, tileMonumentAt, nivaBackAt, saleAt, saleWhat, fraudLoan, blockLifted, internDeclined, internAccepted, grantHouseAt, photoAt, tileAdAt, inhDoneAt, inhBurned, inhRefused, tamadaDoneAt, borisAskAt, debutWho, debutAt, arsenTrack, arsenTrackAt,
  ramPhotoAt, borisSaleAt, vacancyAt, avitoReviewAt, rubikAskAt, kettleAt, lawyerAt, collectorsAskAt, internAt, rubikHoleAt, rubikProposalAt, countersuitAt, grantTileAt,
  seryogaAskAt, grantBathAt, offendedAskAt,
  hhJobAt, seryogaLoanAt, dachaAskAt, evictAt, collectorsEchoAt, threatGovAt, fraudCardAt,
  ...Object.values(payday), ...Object.values(count), ...Object.values(endgame), ...Object.values(lend50),
])
