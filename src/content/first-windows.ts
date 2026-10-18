// Реестр окна первого сообщения (#994): кто входит в историю своим первым сообщением, каким фактом
// штампуется ход окна и каким пулом игрок отвечает. Источник правды для линта (`first-windows.test.ts`):
// участник, умеющий писать сам (SPEAKS), обязан быть здесь или в исключениях с причиной — новый
// участник красит сюит на месте, а не в плейтесте через раунд. Офферы и потребление окна ответом —
// как были (#951), тексты пулов не менялись.
import { avitoReviewAt, borisSaleAt, collectorsAskAt, countersuitAt, courtVerdictAt, crewPaidAt, grantHouseAt, grantTileAt, internAt, kettleAt, lawyerAt, mamaMarketAt, mooAt, moustachePhotoAt, photoAt, ramPhotoAt, rubikAskAt, rubikHoleAt, samvelDivorceAt, transferAt, vacancyAt } from './memkeys'

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
  { who: 'arsen', source: 'судовая ступень 1: первое сообщение юриста (COURT[1], COURT_LAWYER_AGAIN)', at: lawyerAt, offer: 'LawyerFirst', pool: 'P_LAWYER' },
  { who: 'samvel', source: 'хор (CHORUS.samvel)', at: DEBUT_SLOT, offer: 'DebutSamvel', pool: 'P_DEBUT_SAMVEL' },
  { who: 'boris', source: 'хор (CHORUS.boris, «Бее»)', at: DEBUT_SLOT, offer: 'DebutBoris', pool: 'P_DEBUT_BORIS' },
  { who: 'niva', source: 'серия «Би-бип» (arcs niva eps[4])', at: DEBUT_SLOT, offer: 'DebutNiva', pool: 'P_DEBUT_NIVA' },
  { who: 'grant', source: 'серия «плитка — орудие» (stamp строки)', at: grantTileAt, offer: 'GrantTile', pool: 'P_GRANT_TILE' },
  { who: 'taron', source: 'звонок с объекта (crew.ts, штамп звонка)', at: crewPaidAt, offer: 'CrewCall', pool: 'P_CREW_CALL' },
  // окно держит счётчик серии: следующая серия двигает arc.collectors и вопрос уходит (#888)
  { who: 'collectors', source: 'дебют арки коллекторов (серия eps[0])', at: null, offer: 'CollectorsDebut', pool: 'P_COLLECTORS_DEBUT' },
]

/** Участники SPEAKS, чьё первое сообщение ведёт не кнопка окна, а линия: чем отвечает игра.
 *  Формат — объекты, а не пары [кто, текст]: пара читается линтером упоминаний как реплика персонажа. */
export interface Exempt { who: string; why: string }
export const EXEMPT: readonly Exempt[] = [
  { who: 'karine', why: 'первое сообщение — сцена жены; отклик — хор, отдельного пула окна нет' },
  { who: 'nune', why: 'первое сообщение — серия бухгалтера; отклик ведут follow-вопросы линии' },
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
  { source: 'предложение стажировки «Деньги-Ара» (финал арки)', at: internAt, offer: 'InternOffer', pool: 'P_INTERN' },
  { source: 'вопрос «дырку заделаешь?» (серия Рубика, stamp)', at: rubikHoleAt, offer: 'RubikHole', pool: 'P_HOLE' },
  { source: 'фото «платёжки» (Turn_Photo / game.photo)', at: photoAt, offer: 'Photo', pool: 'D.P_PHOTO' },
  { source: 'перевод от Алика (правило и пачка непрочитанных)', at: transferAt, offer: 'Transfer', pool: 'D.P_TRANSFER' },
  { source: 'смена фото без усов (Due_StakeShave / Condition_StakeShave)', at: moustachePhotoAt, offer: 'MoustachePhoto', pool: 'P_MOUSTACHE_PHOTO' },
  { source: 'конец квеста «мама на рынке» (q_mama, узел drive)', at: mamaMarketAt, offer: 'MamaMarket', pool: 'P_MAMA_MARKET' },
  { source: 'развод дяди Самвела на свадьбе (серия samvel, stamp)', at: samvelDivorceAt, offer: 'SamvelDivorce', pool: 'P_SAMVEL_DIVORCE' },
  { source: 'вердикт суда (сцена court, узлы debt/screens/moo, stamp)', at: courtVerdictAt, offer: 'CourtVerdict', pool: 'P_COURT_VERDICT' },
]
