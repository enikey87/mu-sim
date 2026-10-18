// Реестр окна первого сообщения (#994): кто входит в историю своим первым сообщением, каким фактом
// штампуется ход окна и каким пулом игрок отвечает. Источник правды для линта (`first-windows.test.ts`):
// участник, умеющий писать сам (SPEAKS), обязан быть здесь или в исключениях с причиной — новый
// участник красит сюит на месте, а не в плейтесте через раунд. Офферы и потребление окна ответом —
// как были (#951), тексты пулов не менялись.
import { crewPaidAt, grantTileAt, lawyerAt, moustachePhotoAt, photoAt } from './memkeys'

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
  { source: 'смена фото без усов (Due_StakeShave / Condition_StakeShave)', at: moustachePhotoAt, offer: 'MoustachePhoto', pool: 'P_MOUSTACHE_PHOTO' },
  { source: 'фото «платёжки» (Turn_Photo / game.photo)', at: photoAt, offer: 'Photo', pool: 'D.P_PHOTO' },
]
