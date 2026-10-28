// Реестр окна первого сообщения (#994): кто входит в историю своим первым сообщением, каким фактом
// штампуется ход окна и каким пулом игрок отвечает. Источник правды для линта (`first-windows.test.ts`):
// участник, умеющий писать сам (SPEAKS), обязан быть здесь или в исключениях с причиной — новый
// участник красит сюит на месте, а не в плейтесте через раунд. Офферы и потребление окна ответом —
// как были (#951), тексты пулов не менялись.
import { arsenTrackAt, avitoReviewAt, bathAskedAt, borisAskAt, borisSaleAt, collectorsAskAt, collectorsEpAt, countersuitAt, courtVerdictAt, crewPaidAt, grantBathAt, grantHouseAt, grantTileAt, inhDoneAt, internAt, kettleAt, lawyerAt, mamaMarketAt, mamaVoiceAt, mooAt, muenAt, moustachePhotoAt, nivaBackAt, offendedAskAt, photoAt, ramPhotoAt, rubikAskAt, rubikHoleAt, rubikProposalAt, samvelDivorceAt, saleAt, seryogaAskAt, tamadaDoneAt, tileAdAt, tileCourtAt, tileLawyerAt, tileMonumentAt, tileSlipAt, transferAt, vacancyAt, hhJobAt, seryogaLoanAt, dachaAskAt, evictAt, collectorsEchoAt, threatGovAt, fraudCardAt } from './memkeys'
import type { Criterion } from '../engine/rules'

/**
 * Окно события: в условии оффера есть стемп свежести `<событие>Fresh` — ход события и 1–3 после.
 * Кнопки срока (`ctx.whenFresh`) — окно контекста, а не событие: у них свой документ
 * (docs/design/deadline-replies.md). Тот же признак ищет окно без записи в реестре (сюит #1030),
 * и по нему же сборщик вариантов берёт режим лейбла: кнопка-действие окна не несёт хвостов игрока (#1270).
 */
export const isEventWindow = (when: readonly Criterion[]): boolean =>
  when.some((c) => (c.op === 'all'
    ? isEventWindow(c.all ?? [])
    : String(c.key).endsWith('Fresh') && !String(c.key).startsWith('ctx.when')))

/** Общий дебютный слот (#973): `wrote.<who>`/`debutWho`/`debutAt` ставит первое сообщение участника. */
export const DEBUT_SLOT = 'debut'

export interface FirstWindow {
  /** Участник, чьё первое сообщение открывает окно (ключ SPEAKS/CAST). */
  who: string
  /** Где звучит первое сообщение — для человека и ревью; текст игра не читает. */
  source: string
  /** Факт-ход окна: ключ памяти, которым источник штампует ход; DEBUT_SLOT — общий слот;
   *  null — окно закрывает серия сама (счётчик сериала двигает её). */
  at: string | null
  /** Оффер ответа: имя в сборке вариантов (правило `Opt_<offer>`). */
  offer: string
  /** Пул кнопок игрока (ключ реестра PLAYER_POOLS). */
  pool: string
}

export const FIRST_WINDOWS: readonly FirstWindow[] = [
  { who: 'arsen', source: 'rude-цепочка, строка семьи (RUDE_FAMILY.arsen)', at: DEBUT_SLOT, offer: 'DebutArsen', pool: 'P_DEBUT_ARSEN' },
  // трек «Плиточник» — событие rude-цепочки со своим штампом (#1351): окно дебюта к этому ходу обычно
  // закрыто (три отправки), а трек-вопросы жили мёртвым контентом. Пул и контракт ответа те же, слот общий
  { who: 'arsen', source: 'rude-цепочка, строка трека «Плиточник» (stamp строки)', at: arsenTrackAt, offer: 'ArsenTrack', pool: 'P_DEBUT_ARSEN' },
  { who: 'arsen', source: 'судовая ступень 1: первое сообщение юриста (COURT[1], COURT_LAWYER_AGAIN)', at: lawyerAt, offer: 'LawyerFirst', pool: 'P_LAWYER' },
  { who: 'samvel', source: 'хор (CHORUS.samvel)', at: DEBUT_SLOT, offer: 'DebutSamvel', pool: 'P_DEBUT_SAMVEL' },
  { who: 'boris', source: 'хор (CHORUS.boris, «Бее»)', at: DEBUT_SLOT, offer: 'DebutBoris', pool: 'P_DEBUT_BORIS' },
  { who: 'niva', source: 'серия «Би-бип» (arcs niva eps[4])', at: DEBUT_SLOT, offer: 'DebutNiva', pool: 'P_DEBUT_NIVA' },
  { who: 'nune', source: 'серия бухгалтера (arcs nune eps[1], первое письмо)', at: DEBUT_SLOT, offer: 'DebutNune', pool: 'P_NUNE_DEBUT' },
  { who: 'grant', source: 'серия «плитка — орудие» (stamp строки)', at: grantTileAt, offer: 'GrantTile', pool: 'P_GRANT_TILE' },
  { who: 'grant', source: 'хор легенды beton_law (первое личное сообщение, общий слот)', at: DEBUT_SLOT, offer: 'DebutGrant', pool: 'P_DEBUT_GRANT' },
  { who: 'taron', source: 'звонок с объекта (crew.ts, штамп звонка)', at: crewPaidAt, offer: 'CrewCall', pool: 'P_CREW_CALL' },
  // окно держит счётчик серии: следующая серия двигает arc.collectors и вопрос уходит (#888)
  { who: 'collectors', source: 'дебют арки коллекторов (серия eps[0])', at: null, offer: 'CollectorsDebut', pool: 'P_COLLECTORS_DEBUT' },
]

/** Участники SPEAKS, чьё первое сообщение ведёт не кнопка окна, а линия: чем отвечает игра.
 *  Формат — объекты, а не пары [кто, текст]: пара читается линтером упоминаний как реплика персонажа. */
export interface Exempt { who: string; why: string }
export const EXEMPT: readonly Exempt[] = [
  { who: 'karine', why: 'первое сообщение — сцена жены; отклик — хор, отдельного пула окна нет' },
  { who: 'mkrtich', why: 'первое сообщение — серия бетона (подтверждение конверта); своего пула нет' },
  { who: 'razmik', why: 'первое сообщение — серия крановщика и очереди; отклик — follow-вопросы линии' },
  { who: 'rubik', why: 'первое сообщение — серия инспектора; прямые вопросы — отдельные окна (#958)' },
  { who: 'garik', why: 'первое сообщение — серия (фундамент); отклик — follow-вопросы арки' },
]

/** Источники окна, которые не участник, а системное событие (#1013): смена фото профиля — заметное
 *  событие ставки «усы». Заказ окна тот же, что у дебютов: факт-ход (`at`), пул кнопок (`pool`),
 *  оффер ответа (`offer`). В `FIRST_WINDOWS` такая запись не встаёт: там `who` — ключ SPEAKS/CAST,
 *  а у системной строки своего голоса нет; реестр ведёт линтер так же, как дебюты. */
export interface EventSource {
  /** Что за событие — для человека и ревью; текст игра не читает. */
  source: string
  /** Факт-ход события: ключ памяти, который ставит источник. */
  at: string
  /** Оффер ответа: имя в сборке вариантов (правило `Opt_<offer>`). */
  offer: string
  /** Пул кнопок игрока (ключ реестра PLAYER_POOLS). */
  pool: string
}

export const EVENT_SOURCES: readonly EventSource[] = [
  // семейство #927: заметные карточки и системные строки
  { source: 'фото-баран (движок, 25-е сообщение)', at: ramPhotoAt, offer: 'RamPhoto', pool: 'P_RAM_PHOTO' },
  { source: 'объявление о продаже Бориса (карточка Авито)', at: borisSaleAt, offer: 'BorisSale', pool: 'P_BORIS_SALE' },
  { source: 'вакансия «оплата сразу» (карточка hh.ru)', at: vacancyAt, offer: 'Vacancy', pool: 'P_VACANCY' },
  { source: 'отзыв Авито «терпеливый» (карточка)', at: avitoReviewAt, offer: 'AvitoReview', pool: 'P_AVITO_REVIEW' },
  { source: 'прямой вопрос Рубика (строка серии, stamp)', at: rubikAskAt, offer: 'RubikAsk', pool: 'P_RUBIK_ASK' },
  { source: 'выигрыш чайника (узел квеста, stamp)', at: kettleAt, offer: 'Kettle', pool: 'P_KETTLE' },
  { source: 'встречный иск (rude-правило, applyFacts)', at: countersuitAt, offer: 'Countersuit', pool: 'P_COUNTERSUIT' },
  { source: '«Мууу» в ленте (движок)', at: mooAt, offer: 'Cow', pool: 'D.P_COW' },
  // первые сообщения и заметные события персонажей (#958/#983/#1003/#1013/#1030)
  { source: 'первое сообщение заказчика Гранта (серия, stamp)', at: grantTileAt, offer: 'GrantTile', pool: 'P_GRANT_TILE' },
  { source: 'второй дебют Гранта: дом «с кладом» (серия, stamp)', at: grantHouseAt, offer: 'GrantHouse', pool: 'P_GRANT_HOUSE' },
  { source: 'вопрос «тебе коллекторы пишут?» (серия 2 арки, stamp)', at: collectorsAskAt, offer: 'CollectorsAsk', pool: 'P_COLLECTORS_ASK' },
  { source: 'эпизод арки коллекторов: чай, вербовка или разворот (stamp)', at: collectorsEpAt, offer: 'CollectorsEp', pool: 'P_COLLECTORS_EP' },
  { source: 'предложение стажировки «Деньги-Ара» (финал арки)', at: internAt, offer: 'InternOffer', pool: 'P_INTERN' },
  { source: 'вопрос «дырку заделаешь?» (серия Рубика, stamp)', at: rubikHoleAt, offer: 'RubikHole', pool: 'P_HOLE' },
  { source: 'фото «платёжки» (Turn_Photo / game.photo)', at: photoAt, offer: 'Photo', pool: 'D.P_PHOTO' },
  { source: 'перевод от Алика (правило и пачка непрочитанных)', at: transferAt, offer: 'Transfer', pool: 'D.P_TRANSFER' },
  { source: 'смена фото без усов (Due_StakeShave / Condition_StakeShave)', at: moustachePhotoAt, offer: 'MoustachePhoto', pool: 'P_MOUSTACHE_PHOTO' },
  { source: 'конец квеста «мама на рынке» (q_mama, узел drive)', at: mamaMarketAt, offer: 'MamaMarket', pool: 'P_MAMA_MARKET' },
  { source: 'кража плиточной рекламы (q_photo, узел send: подпись «Сам клал»)', at: tileAdAt, offer: 'TileAd', pool: 'P_TILE_AD' },
  { source: 'вопрос о баране по памяти партии (Turn_Memory, строка «Всё ещё у тебя?») — реплика штампует ход', at: borisAskAt, offer: 'BorisMemory', pool: 'P_BORIS_MEMORY' },
  { source: 'финал квеста-тамады (q_tamada, узел yes: застолье, сервиз тёти Гоар и знакомство)', at: tamadaDoneAt, offer: 'TamadaDone', pool: 'P_TAMADA_DONE' },
  // развязка «Наследства дяди Тиграна» (#1439): последняя строка каждой ветки квеста `q_inherit` —
  // сгоревшие нотариальные 54 000 ₽ (горелая) или обида Алика (отказная). Штамп ставит сама строка,
  // пул ответа у ветки свой: горелая пара говорит о нотариусах, отказная — об обиде
  { source: 'развязка «Наследства дяди Тиграна», горелая ветка (q_inherit, узел believe, штамп строки)', at: inhDoneAt, offer: 'InhBurned', pool: 'P_INH_BURNED' },
  { source: 'развязка «Наследства дяди Тиграна», отказная ветка (q_inherit, узел refuse, штамп строки)', at: inhDoneAt, offer: 'InhRefused', pool: 'P_INH_REFUSED' },
  { source: 'голосовое-плач мамы (Rude_Calls, строка MAMA_VOICE_CRY)', at: mamaVoiceAt, offer: 'MamaVoice', pool: 'P_MAMA_VOICE' },
  { source: 'развод дяди Самвела на свадьбе (серия samvel, stamp)', at: samvelDivorceAt, offer: 'SamvelDivorce', pool: 'P_SAMVEL_DIVORCE' },
  { source: 'вердикт суда (сцена court, узлы debt/screens/moo, stamp)', at: courtVerdictAt, offer: 'CourtVerdict', pool: 'P_COURT_VERDICT' },
  { source: 'первая серия плиточной арки: заказчик упал на плитке (серия, stamp)', at: tileSlipAt, offer: 'TileSlip', pool: 'P_TILE_SLIP' },
  { source: 'эпизод плиточной арки «я твой адвокат»: вычет 10 000 ₽ из долга (серия, stamp)', at: tileLawyerAt, offer: 'TileLawyer', pool: 'P_TILE_LAWYER' },
  { source: 'эпизод плиточной арки «заказчик подаёт в суд. На тебя» (серия, stamp)', at: tileCourtAt, offer: 'TileCourt', pool: 'P_TILE_COURT' },
  { source: 'эпизод плиточной арки «внесли в реестр памятников» (серия, stamp)', at: tileMonumentAt, offer: 'TileMonument', pool: 'P_TILE_MONUMENT' },
  { source: 'эпизод арки «Нива» — возврат машины без денег, с новыми колёсами (серия, stamp)', at: nivaBackAt, offer: 'NivaBack', pool: 'P_NIVA_BACK' },
  { source: 'продажа имущества со дна (карточка банка, sellThing)', at: saleAt, offer: 'Sold', pool: 'P_SOLD' },
  // глубокие раунды 119–121 (#1292): заметные события без окна отклика
  { source: 'карточка друга Серёги «Ну что, заплатил твой Алик?» (уведомление телефона, stamp)', at: seryogaAskAt, offer: 'Seryoga', pool: 'P_SERYOGA' },
  { source: 'строка Гранта «Алик, завтра в бане как договорились. Ой. Не тот чат.» (серия, stamp)', at: grantBathAt, offer: 'GrantBath', pool: 'P_GRANT_BATH' },
  { source: 'вопрос Алика «ты обиделся?» после тишины (Idle_Offended / Away_Offended, stamp)', at: offendedAskAt, offer: 'OffendedAsk', pool: 'P_OFFENDED_ASK' },
  // условие Карине «переложите нам ванную» (#1382): сцена мира ставила только факт `bath.asked`,
  // окна отклика у условия не было — до Дня выплаты игрок ответить не мог. Штамп ставит сама строка о ванной
  { source: 'условие Карине «переложите нам ванную» (сцена ritual, узел text, строка о ванной — stamp)', at: bathAskedAt, offer: 'BathAsk', pool: 'P_BATH_ASK' },
  // признание «учу английский» + карточка курса mu-en (#1410): развязка лестницы мычания — заметное
  // событие, у которого не было своего окна отклика (прецеденты #927/#1292). Штамп ставит muenTurn
  { source: 'признание «это я учу английский» и карточка курса mu-en (muenTurn, stamp)', at: muenAt, offer: 'Muen', pool: 'P_MUEN' },
  // предложение Карине в 7-й серии Рубика (#1471): просьба «Скажи, что подождёшь» — прямая просьба к
  // игроку, пары #920 получили своё окно отклика: общий Talk_arc не выигрывал слот у муэна и звонка
  { source: 'предложение Карине в 7-й серии Рубика, строка «Скажи, что подождёшь» (stamp строки)', at: rubikProposalAt, offer: 'RubikProposal', pool: 'P_RUBIK_PROPOSAL' },
  // свип «показал — ответить нельзя» (#1487): карточки ленты, которые обращаются к игроку или
  // объявляют событие партии, а ответить на них было нечем. Окно то же, что у #927/#1292
  { source: 'вакансия hh.ru «150 000 ₽, оплата каждую пятницу. Откликнуться?» (карточка, stamp)', at: hhJobAt, offer: 'HhJob', pool: 'P_HH_JOB' },
  { source: 'Серёга «Братан, займи до зарплаты» (карточка, stamp)', at: seryogaLoanAt, offer: 'SeryogaLoan', pool: 'P_SERYOGA_LOAN' },
  { source: 'мама «продала дачу… Помогло?» (карточка, stamp)', at: dachaAskAt, offer: 'DachaAsk', pool: 'P_DACHA_ASK' },
  { source: 'хозяин квартиры «Выселяю» (карточка, stamp; она же ставит `evicted`)', at: evictAt, offer: 'Evict', pool: 'P_EVICT' },
  { source: 'коллекторы «Он нам тоже должен. Давайте дружить» (карточка-эхо арки, stamp)', at: collectorsEchoAt, offer: 'CollectorsEcho', pool: 'P_COLLECTORS_ECHO' },
  { source: 'Госуслуги «Ваша угроза зарегистрирована» (карточка, stamp)', at: threatGovAt, offer: 'ThreatGov', pool: 'P_THREAT_GOV' },
  { source: 'банк «Кредит на ваше имя: остаток 300 000» (карточка, stamp)', at: fraudCardAt, offer: 'FraudCard', pool: 'P_FRAUD_CARD' },
]
