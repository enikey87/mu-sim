// Линия суда: каждая угроза судом двигает дело на ступень (court = номер ступени).
// 0 насмешка → 1 юрист Арсен → 2 досудебная претензия → 3 заседание (сцена) → 4 апелляция → 5 Страсбург → 6 решение; дальше — «опять суд?».
// Официальное обращение вежливым тоном (#1435) идёт тем же делом, но медленнее: ступень — за два обращения.
import type { ContentApi } from '../../engine/game'
import { type Rule, type Facts, eq, gte, lte, add, set, is, missing } from '../fact'
import type { GameEvent, Offer } from './events'
import { COURT, COURT_AFTER, COURT_LAWYER_AGAIN, COURT_POLITE_ACK, COURT_VERDICT_AFTER_LETTER } from '../quests'
import { THREAT_AGAIN } from '../misc'
import { meet } from '../world'
import { count, court, courtPolite, courtReferral, lawyerAt, paydayScene, saidStrasburg, threatClaim, wrote } from '../memkeys'

type R = Rule<ContentApi, GameEvent, Offer>
const threat = eq('tone', 'threat')
/** Официальное обращение: канцелярская форма, тон вежливый (#1435). */
const polite = [eq('tone', 'polite'), eq('category', 'threat')]

/** Угроза пришла выбранной репликой «до Страсбурга» — факт оглашения для отклика Арсена (#982). */
function strasbourgSaid(game: ContentApi, facts: Facts): void {
  if (String(facts.arg ?? '') === 'strasbourg') game.applyFacts([set(saidStrasburg, true)])
}

async function saySaid(game: ContentApi, lines: ReadonlyArray<readonly [string, string]>): Promise<void> {
  for (const [w, t] of lines) { await game.say([w === 'alik' ? t : { w, t }]); await game.sleep(400) }
}

/** Перевод в суд для инстанции, которой грозил игрок: по факту threat.claim, а не по словам реплики. */
export const REFERRAL: Record<string, string> = {
  police: 'Полиция? Полиция сказала — это в суд.',
  prosecutor: 'Прокурор? Прокурор сказал — это в суд.',
  tax: 'Налоговая? Налоговая сказала — это в суд.',
  collectors: 'Коллекторы? Коллекторы сказали — это в суд.',
  lawyer: 'Адвокат? Адвокат сказал — это в суд.',
  statement: 'Заявление? Заявление приняли и отправили в суд.',
}

/** Префикс к реплике ступени, а не отдельное сообщение: реплик не больше, поток розыгрыша не сдвигается. */
function referred(game: ContentApi, lines: ReadonlyArray<readonly [string, string]>): ReadonlyArray<readonly [string, string]> {
  const claim = String(game.mem()[threatClaim] ?? '')
  const said = String(game.mem()[courtReferral] ?? '').split(',').filter(Boolean)
  const i = lines.findIndex(([w]) => w === 'alik')
  if (!REFERRAL[claim] || said.includes(claim) || i < 0) return lines
  game.applyFacts([set(courtReferral, [...said, claim].join(','))])
  return lines.map((l, j): readonly [string, string] => (j === i ? [l[0], `${REFERRAL[claim]} ${l[1]}`] : l))
}

/** Ступень дела одна на оба тона: устная угроза и официальное обращение двигают одни и те же факты.
 *  `stage` — ступень, на которую дело встало после записи: 0 — насмешка, 1 — юрист, 3 — заседание, 5 — Страсбург. */
async function courtStage(game: ContentApi, facts: Facts, stage: number): Promise<void> {
  if (stage === 0) {
    game.mood(-1)
    await game.say([game.uniq(game.X.threat)])
    game.goOffline(1)
    return
  }
  game.unlock('memory')
  strasbourgSaid(game, facts)
  if (stage === 3) { await game.enterNode('court', game.scenes.court.start); return }
  // письмо из Страсбурга пришло в День выплаты: решение не объявляется первым (тот же выбор, что у устного пути)
  const lettered = stage === 6 && String(game.mem()[paydayScene] ?? '') === 'strasbourg'
  const lines = lettered ? COURT_VERDICT_AFTER_LETTER
    : stage === 1 ? (game.mem()[wrote('arsen')] ? COURT_LAWYER_AGAIN : COURT[1])
    : COURT[stage]
  // Арсен входит ролью юриста на первой ступени, а окно отклика штампуется ходом его письма (как в #958/#1017)
  if (stage === 1) game.applyFacts([set(lawyerAt, Number(facts.sent)), ...meet('arsen')])
  await saySaid(game, referred(game, lines))
  if (stage === 5) game.unlock('strasbourg')
}

export const courtRules: R[] = [
  {
    name: 'Court_Start', event: 'PlayerMessage', when: [threat], remember: [add(count.threat), set(court, 1)],
    respond: async ({ game, facts }) => { await courtStage(game, facts, 0) },
  },
  // ступень 1 — юрист: здесь Арсен входит в историю, если сам ещё не писал (#1017: упоминание в бетоне
  // ставит intro, но не письмо — «здравствуйте, это Арсен» остаётся верным, а «снова» — нет)
  {
    name: 'Court_Lawyer', event: 'PlayerMessage', when: [threat, eq(court, 1), missing(wrote('arsen'))], bonus: 1,
    remember: [add(count.threat), add(court)],
    respond: async ({ game, facts }) => { await courtStage(game, facts, 1) },
  },
  {
    name: 'Court_Lawyer_Again', event: 'PlayerMessage', when: [threat, eq(court, 1), is(wrote('arsen'))], bonus: 1,
    remember: [add(count.threat), add(court)],
    respond: async ({ game, facts }) => { await courtStage(game, facts, 1) },
  },
  {
    // претензия, апелляция, Страсбург, решение — по ступеням
    name: 'Court_Step', event: 'PlayerMessage', when: [threat, gte(court, 1), lte(court, 6)], remember: [add(count.threat), add(court)],
    respond: async ({ game, facts }) => { await courtStage(game, facts, Number(game.mem()[court]) - 1) },
  },
  {
    // ступень 6, когда письмо из Страсбурга уже пришло в День выплаты: решение не объявляется первым
    name: 'Court_Verdict_Lettered', event: 'PlayerMessage', when: [threat, eq(court, 6), eq(paydayScene, 'strasbourg')], bonus: 1,
    remember: [add(count.threat), add(court)],
    respond: async ({ game, facts }) => { await courtStage(game, facts, 6) },
  },
  {
    // дело прошло все инстанции
    name: 'Court_After', event: 'PlayerMessage', when: [threat, gte(court, 7)], remember: [add(count.threat)],
    respond: async ({ game }) => {
      await game.say([game.line('COURT_AFTER', [...COURT_AFTER, ...THREAT_AGAIN], { fallback: game.X.threat })!])
    },
  },

  // вежливый путь (#1435): официальное обращение канцелярия заносит в журнал, ступень двигает каждое второе
  {
    name: 'Court_Polite_Ack', event: 'PlayerMessage', when: [...polite, missing(courtPolite), lte(court, 6)],
    remember: [set(courtPolite, true), add(count.threat)],
    respond: async ({ game }) => { await game.say([game.uniq(() => game.draw('COURT_POLITE_ACK', COURT_POLITE_ACK))]) },
  },
  {
    name: 'Court_Polite_Step', event: 'PlayerMessage', when: [...polite, is(courtPolite), lte(court, 6)],
    remember: [set(courtPolite, false), add(count.threat), add(court)],
    respond: async ({ game, facts }) => { await courtStage(game, facts, Number(game.mem()[court]) - 1) },
  },
  {
    // дело уже прошло все инстанции: отклик тот же, что у устного пути
    name: 'Court_Polite_After', event: 'PlayerMessage', when: [...polite, gte(court, 7)],
    respond: async ({ game }) => {
      await game.say([game.line('COURT_AFTER', [...COURT_AFTER, ...THREAT_AGAIN], { fallback: game.X.threat })!])
    },
  },
]
