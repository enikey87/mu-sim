// Событие PlayerSays { intent, arg } — ответ Алика на контекстную реплику игрока.
// Общее правило по intent + более специфичные для частных случаев (память, контекст).
import type { ContentApi } from '../../engine/game'
import { fmtDays } from '../../engine/time'
import { type Rule, eq, ne, is, gte, add, set, matches, spec, valueOf, isOpen } from '../fact'
import { muenTurn } from './muen'
import type { GameEvent, Offer } from './events'
import { AlikOffline, ThickJournal } from './criteria'
import { cooldown } from './rude'
import { TOPICS, TOPIC_FALLBACK, TOPIC_NAME, TOPIC_OBSESSED, DESPERATE_PAIRS } from '../topics'
import { D, low, cap } from '../excuses'
import { GREET_A, WHEN_COND, SWING } from '../misc'
import { type TalkKind, talkPairs, talkId, TALK_REMEMBER } from '../talk'
import { saidClaims, saidText, type Said } from '../fact'
import { LEGENDS } from '../legends'
import { moneyPlaceOf, moneyAskOwn, stampMoneyPlace } from '../money-ask'
import { ARCS, NO_NEWS_A, NO_NEWS_B, GROUP_SEEN_A, GROUP_SEEN_B, WRONG_A, WRONG_B } from '../arcs'
import * as L from '../life'
import { SORRY_AGAIN, CONDOLE_REVIVED, PREV_MANY, PROMISE_NEVER, PROMISE_PENCIL, PROMISE_FAR, PROMISE_YEARS, KONAK_LINE, WHEELS_NEVER } from '../misc'
import { CREW_PAID } from '../crew'
import { HOLIDAY_MONEY, type Holiday } from '../holidays'
import { LIE_OPEN, LIE_EXPLAIN, LIE_GRANDPA, LIE_CUSTOMER, LIE_THIRD, LIE_NOCRED, LIE_NIVA, LIE_PROMISE, LIE_ENVELOPES } from '../lies'
import { HEAT, alikShaved, arsenTrackAt, avitoReviewAt, bathAnswered, bathAskedAt, borisAskAt, borisSaleAt, coldWar, collectorsAskAt, collectorsEpAt, countersuitAt, courtVerdictAt, tileCourtAt, tileLawyerAt, tileMonumentAt, tileSlipAt, nivaBackAt, saleAt, crewPaidAt, debutAt, grantBathAt, grantTileAt, inhDoneAt, internAccepted, internAt, internDeclined, kettleAt, lawyerAt, moustacheAskAt, offendedAskAt, ramPhotoAt, rubikAskAt, rubikHoleAt, moustachePhotoAt, photoAt, tileAdAt, tamadaDoneAt, mamaMarketAt, mamaVoiceAt, samvelDivorceAt, grantHouseAt, seryogaAskAt, transferAt, vacancyAt, muenAnswered, hhJobAt, seryogaLoanAt, dachaAskAt, evictAt, collectorsEchoAt, threatGovAt, fraudCardAt, inhRefused, asked, caughtCount, count, doneAsked, finaleOf, nextTransfer, sick, saidKonak, stateAt, topic, topicLast, topicMute, topicRun, whenYears } from '../memkeys'
import type { ArcId, TopicId } from '../ids'
import { BATH_ANSWER } from './player-choice-pools'
import { PROMISE_SHAVE_ASK, BORIS_MEMORY_B, MOUSTACHE_PHOTO_B, MAMA_MARKET_B, TILE_AD_B, TAMADA_DONE_B, MAMA_VOICE_B, SAMVEL_DIVORCE_B, GRANT_HOUSE_B, COURT_VERDICT_B, TILE_SLIP_B, TILE_COURT_B, TILE_LAWYER_B, TILE_MONUMENT_B, NIVA_BACK_B, SOLD_B, RAM_PHOTO, BORIS_SALE, VACANCY, VACANCY_START_B, VACANCY_SOON_B, SERYOGA_B, GRANT_BATH_B, OFFENDED_ASK_B, BATH_ASK_B, MUEN_ASK_B, INH_BURNED_B, INH_REFUSED_B, AVITO_REVIEW, RUBIK_ASK, KETTLE, CREW_CALL_B, LAWYER_B, COLLECTORS_ASK_B, COLLECTORS_EP_B, INTERN_B, HOLE_B, COUNTERSUIT_B, DEBUT_ARSEN_B, DEBUT_SAMVEL_B, DEBUT_BORIS_B, DEBUT_NIVA_B, NUNE_DEBUT_B, DEBUT_GRANT_B, GRANT_TILE_B, HH_JOB_B, SERYOGA_LOAN_B, DACHA_ASK_B, EVICT_B, COLLECTORS_ECHO_B, THREAT_GOV_B, FRAUD_CARD_B, KONVERTY_B } from '../world'

type R = Rule<ContentApi, GameEvent, Offer>
const says = (intent: string, rest: Partial<R> & Pick<R, 'respond'>, extra: R['when'] = []): R => ({
  name: `Says_${intent}${extra.length ? '_' + extra.map((c) => (c.key + (typeof c.value === 'string' ? '_' + c.value : c.value === true || c.value === undefined ? '' : c.value)).replace(/[^\wа-я]/gi, '')).join('_') : ''}`,
  event: 'PlayerSays',
  when: [eq('intent', intent), ...extra],
  ...rest,
})

function takeSorryMark(game: ContentApi): void {
  const mark = game.X.pullSorryMark()
  if (mark?.length) game.applyFacts(mark)
}

async function sorry(game: ContentApi, line: string): Promise<void> {
  cooldown(game, 1) // извинение остужает ссору
  game.mood(3)
  // принятое извинение кончает холодную войну: ритуал примирения остаётся выходом из режима (`coldWar`)
  game.applyFacts([set(coldWar, false)])
  game.unlock('sorry')
  game.forgiveOffline()
  await game.say([line])
  game.setCtx(null)
}

const simple = (intent: string, line: (g: ContentApi) => Said, after?: (g: ContentApi) => void | Promise<void>): R =>
  says(intent, { respond: async ({ game }) => { await game.say([line(game)]); game.setCtx(null); await after?.(game) } })

/** Ответ Арсена на вопрос пула дебюта/трека — строка DEBUT_ARSEN_B того же номера, что выбранный
 *  вопрос (#1500, #1017): номер уезжает с arg оффера. Прямой fire без номера — колода, как раньше;
 *  закрытая строка пары — тоже колода, чтобы окно не молчало. */
function debutArsenAnswer(game: ContentApi, arg: unknown): { w: string; t: string } {
  const i = Number(arg)
  const line = Number.isInteger(i) ? DEBUT_ARSEN_B[i] : undefined
  return line && isOpen(line, game.lineFacts()) ? valueOf(line) : game.draw('DEBUT_ARSEN_B', DEBUT_ARSEN_B)
}

export const replyRules: R[] = [
  // Алик «пропал» после грубости — на любой вопрос, кроме извинения, отвечает, когда вернётся
  { name: 'Says_WhileOffline', event: 'PlayerSays', when: [AlikOffline, ne('intent', 'sorry'), ne('intent', 'moo')], bonus: 5, respond: ({ game }) => game.alikTurn('neutral') },

  // Свободно введённая просьба о деньгах всегда получает отмазку, а не случайный стикер или сцену.
  // Грубая просьба: отмазка + нагрев ссоры (без отдельной обиженной реплики Tone_Rude).
  says('request', {
    bonus: 1,
    remember: [add(count.rude), add(HEAT)],
    trigger: [{ event: 'RudeCool', delay: 20 }],
    respond: ({ game }) => game.excuseTurn(),
  }, [eq('tone', 'rude')]),
  says('request', { respond: ({ game }) => game.excuseTurn() }),

  says('sorry', { remember: [add(count.sorry)], respond: ({ game }) => { const line = game.uniq(game.X.sorry); takeSorryMark(game); return sorry(game, line) } }),
  says('sorry', {
    remember: [add(count.sorry)],
    respond: ({ game }) => {
      game.unlock('memory')
      // свежая фраза «опять мир?», а кончились — обычное прощение из генератора
      game.X.pullSorryMark()
      const line = game.line('SORRY_AGAIN', SORRY_AGAIN, { fallback: game.X.sorry })!
      takeSorryMark(game)
      return sorry(game, line)
    },
  }, [gte(count.sorry, 2)]),
  // третий «мир» за 6 ходов — «качели»: Алик замечает, и ссору это уже не остужает
  says('sorry', {
    remember: [add(count.sorry), set(coldWar, false)], bonus: 3,
    respond: async ({ game }) => {
      game.unlock('memory')
      game.mood(1) // мир всё-таки, хоть и качели
      game.X.pullSorryMark()
      const line = game.line('SWING', SWING, { fallback: game.X.sorry })!
      takeSorryMark(game)
      await game.say([line])
      game.setCtx(null)
    },
  }, [gte('sorrySwing', 3)]),

  // ответ на реплику легенды / персонажа / воспоминание: отвечает тот, к кому обратились
  says('talk', {
    respond: async ({ game, facts }) => {
      const [kind, sub, i] = String(facts.arg).split('|') as [TalkKind, string, string]
      const e = talkPairs(kind, sub)[Number(i)]
      const pair = e && valueOf(e)
      if (!pair) return false // молчание не трогает ctx: следующее правило отвечает на тот же контекст
      game.setCtx(null)
      // ответ легенды о месте денег прозвучал — state-вопросы места молчат окно (#981)
      if (kind === 'legend') {
        const place = moneyPlaceOf(sub)
        if (place) stampMoneyPlace(game, place, Number(facts.sent))
      }
      const id = talkId(kind, sub, Number(i))
      game.lines.mark(id)
      game.applyFacts(TALK_REMEMBER[id] ?? [])
      await game.say([kind === 'chorus' ? { w: sub, t: saidText(pair[1]), claims: saidClaims(pair[1]) } : pair[1]])
    },
  }),

  // вопрос «где деньги сейчас» (#795): Алик продолжает ту же легенду — следующая её реплика; легенда
  // исчерпана (все реплики сказаны) — обычная отмазка, как у `Opt_Arc` с пулом `follow`
  says('money', {
    respond: async ({ game, facts }) => {
      // arg: `легенда` либо `легенда|номер строки` — у выбора со своим ответом (#1252) отвечаем по строке
      const [legend, own] = String(facts.arg ?? '').split('|')
      const l = LEGENDS[legend]
      if (!l) return false
      // вопрос прозвучал и получает ответ: вопросы-состояния того же места молчат окно свежести (#952)
      const place = moneyPlaceOf(legend)
      if (place) stampMoneyPlace(game, place, Number(facts.sent))
      const i = own ? Number(own) : -1
      const ownLine = place && Number.isInteger(i) && i >= 0 ? moneyAskOwn(place, i) : undefined
      if (ownLine) {
        // свой ответ строки не тратит колоду легенды: генерик остаётся ёмкостью (#1252)
        game.markTopical(await game.say([ownLine]))
      } else {
        const p = game.linePicked('LEG_' + legend, l.lines)
        if (!p) return game.excuseTurn()
        game.markTopical(await game.say([{ t: p.text, claims: p.spec.claims ?? [] }]))
      }
      game.setCtx({ ...(game.ctx ?? {}), legend })
    },
  }),
  // отклик на фото «платёжки» (#1017): ответ потребляет окно события, как у окон #927/#951
  simple('photo', (g) => g.uniq(g.X.photo), (g) => g.clearFact(photoAt)),
  // отклик на вопрос о баране по памяти партии (#1252): ответ потребляет окно события (#951)
  says('borisMemory', {
    respond: async ({ game }) => {
      await game.say([game.draw('BORIS_MEMORY_B', BORIS_MEMORY_B)])
      game.clearFact(borisAskAt)
      game.setCtx(null)
    },
  }),
  // «Что за „Мууу“ на фоне?» — второй путь коровьего вопроса: тот же счётчик и та же
  // эскалация mu-en, что у Tone_Cow (порог в muenTurn считают оба)
  says('voice', {
    remember: [add(count.cow)],
    respond: async ({ game, facts }) => {
      if (await muenTurn(game, facts)) return
      await game.say([game.uniq(game.X.cow)])
      game.setCtx(null)
    },
  }),
  simple('voiceText', (g) => g.pair('VOICE_A', D.VOICE_A, 'VOICE_B', D.VOICE_B)),
  says('transferQ', {
    respond: async ({ game }) => {
      game.clearFact(transferAt) // ответ потребил окно перевода (#951/#1003)
      const reply = game.uniq(game.X.transferQ)
      if (reply.nextTransfer) game.applyFacts([set(nextTransfer, reply.nextTransfer)])
      await game.say([reply.text])
      game.setCtx(null)
    },
  }),
  says('legendQ', { respond: async ({ game }) => { game.mood(1); await game.say([game.uniq(game.X.legendQ)]); game.setCtx(null) } }),
  says('shortQ', { respond: async ({ game, facts }) => { await game.say([game.uniq(() => game.X.shortQ(String(facts.arg ?? '')))]); game.setCtx(null) } }),
  simple('short2', (g) => g.pair('SHORT2_A', D.SHORT2_A, 'SHORT2_B', D.SHORT2_B)),

  says('moustacheAsk', {
    respond: async ({ game }) => {
      game.applyFacts([set(moustacheAskAt, game.day)])
      // linePicked, а не draw: строка сама объявляет «ставку» своим remember (#1029)
      const line = game.linePicked('PROMISE_SHAVE_ASK', PROMISE_SHAVE_ASK)
      await game.say([line?.text ?? ''])
      game.setCtx(null)
    },
  }, [is(alikShaved)]),
  // отклик на второй дебют Гранта (#1041): ответ потребляет окно события (#951), говорит сам Грант
  says('grantHouse', {
    respond: async ({ game }) => {
      // говорит сам Грант: пул несёт `{ w, t }` — рисуем `draw`, как у окна #983, а не `linePicked` (он вернул бы только текст)
      await game.say([game.draw('GRANT_HOUSE_B', GRANT_HOUSE_B)])
      game.clearFact(grantHouseAt)
      game.setCtx(null)
    },
  }),
  // отклик на конец квеста «мама на рынке» (#1030): ответ потребляет окно события (#951), строка своя
  says('mamaMarket', {
    respond: async ({ game }) => {
      const line = game.linePicked('MAMA_MARKET_B', MAMA_MARKET_B)
      await game.say([line?.text ?? ''])
      game.clearFact(mamaMarketAt)
      game.setCtx(null)
    },
  }),
  // отклик на кражу плиточной рекламы (#1216): ответ потребляет окно события, как у окон #927/#951
  says('tileAd', {
    respond: async ({ game }) => {
      await game.say([game.draw('TILE_AD_B', TILE_AD_B)])
      game.clearFact(tileAdAt)
      game.setCtx(null)
    },
  }),
  // отклик на финал квеста-тамады (#1222): ответ потребляет окно события, как у окон #927/#951
  says('tamadaDone', {
    respond: async ({ game }) => {
      await game.say([game.draw('TAMADA_DONE_B', TAMADA_DONE_B)])
      game.clearFact(tamadaDoneAt)
      game.setCtx(null)
    },
  }),
  // отклик на развязку «Наследства дяди Тиграна» (#1439): обе ветки квеста `q_inherit` кончаются
  // заметным событием — ответ потребляет окно события, как у окон #927/#951. Пулы разделены по ветке,
  // и ответ идёт по выбранной строке (arg), как у ванной и стажёра (#1017): без номера — колода ветки
  says('inhDone', {
    respond: async ({ game, facts }) => {
      const i = Number(facts.arg)
      const pool = game.mem()[inhRefused] === true ? INH_REFUSED_B : INH_BURNED_B
      const line = Number.isInteger(i) && i >= 0 && i < pool.length ? pool[i] : undefined
      await game.say([line ?? game.draw('INH_ANSWER', pool)])
      game.clearFact(inhDoneAt)
      game.setCtx(null)
    },
  }),
  // отклик на голосовое-плач мамы (#1085): ответ потребляет окно события, как у окон #927/#951
  says('mamaVoice', {
    respond: async ({ game }) => {
      await game.say([game.draw('MAMA_VOICE_B', MAMA_VOICE_B)])
      game.clearFact(mamaVoiceAt)
      game.setCtx(null)
    },
  }),
  // отклик на развод дяди Самвела (#1037): ответ потребляет окно события, как у окон #927/#951
  says('samvelDivorce', {
    respond: async ({ game }) => {
      await game.say([game.draw('SAMVEL_DIVORCE_B', SAMVEL_DIVORCE_B)])
      game.clearFact(samvelDivorceAt)
      game.setCtx(null)
    },
  }),
  // отклик на вердикт суда (#1058): ответ потребляет окно события, как у окон #927/#951
  says('courtVerdict', {
    respond: async ({ game }) => {
      await game.say([game.draw('COURT_VERDICT_B', COURT_VERDICT_B)])
      game.clearFact(courtVerdictAt)
      game.setCtx(null)
    },
  }),
  // отклик на первую серию плиточной арки (#1059): ответ потребляет окно события
  says('tileSlip', {
    respond: async ({ game }) => {
      await game.say([game.draw('TILE_SLIP_B', TILE_SLIP_B)])
      game.clearFact(tileSlipAt)
      game.setCtx(null)
    },
  }),
  // отклик на иск заказчика, второй эпизод плиточной арки (#1317): ответ потребляет окно события
  says('tileCourt', {
    respond: async ({ game }) => {
      await game.say([game.draw('TILE_COURT_B', TILE_COURT_B)])
      game.clearFact(tileCourtAt)
      game.setCtx(null)
    },
  }),
  // отклик на эпизод «я твой адвокат» (#1303): ответ потребляет окно события, как у #1059/#927
  says('tileLawyer', {
    respond: async ({ game }) => {
      await game.say([game.draw('TILE_LAWYER_B', TILE_LAWYER_B)])
      game.clearFact(tileLawyerAt)
      game.setCtx(null)
    },
  }),
  // отклик на реестр памятников, пятый эпизод плиточной арки (#1317): окно потребляется так же
  says('tileMonument', {
    respond: async ({ game }) => {
      await game.say([game.draw('TILE_MONUMENT_B', TILE_MONUMENT_B)])
      game.clearFact(tileMonumentAt)
      game.setCtx(null)
    },
  }),
  // отклик на возврат «Нивы» (#1306): ответ потребляет окно события, как у #1059/#1303
  says('nivaBack', {
    respond: async ({ game }) => {
      await game.say([game.draw('NIVA_BACK_B', NIVA_BACK_B)])
      game.clearFact(nivaBackAt)
      game.setCtx(null)
    },
  }),
  // отклик на продажу имущества со дна (#1084): ответ потребляет окно события; строка ответа
  // выбирается по проданной вещи (`saleItem`) до снятия штампа хода
  says('soldQ', {
    respond: async ({ game }) => {
      await game.say([game.draw('SOLD_B', SOLD_B)])
      game.clearFact(saleAt)
      game.setCtx(null)
    },
  }),
  // отклик на смену фото без усов (#1013): ответ потребляет окно события, как у окон #927 (#951)
  says('moustachePhoto', {
    respond: async ({ game }) => {
      const line = game.linePicked('MOUSTACHE_PHOTO_B', MOUSTACHE_PHOTO_B)
      await game.say([line?.text ?? ''])
      game.clearFact(moustachePhotoAt)
      game.setCtx(null)
    },
  }),

  says('promiseCheck', { respond: async ({ game, facts }) => { await game.say([game.uniq(() => game.X.promiseCheck(String(facts.arg ?? '')))]); game.setCtx(null) } }),
  says('promiseOk', { respond: async ({ game }) => { await game.say([game.uniq(() => game.draw('PROMISE_OK', D.PROMISE_OK))]); game.setCtx(null) } }),
  // «Точно «как ключ выйдет»?» — событие не дата, отвечаем про само событие
  says('promiseCheck', {
    respond: async ({ game, facts }) => {
      const t = String(facts['ctx.when'] ?? '')
      await game.say([game.uniq(() => game.draw('WHEN_COND', WHEN_COND).replace('{t}', t).replace('{T}', cap(t)))])
      game.setCtx(null)
    },
    // плавающий событийный срок (#1002) отвечает так же: это событие, а не дата
  }, [matches('ctx.whenKind', /^(event|floating)$/)]),
  says('promiseNever', {
    remember: [set(whenYears, true)],
    bonus: 1,
    respond: async ({ game }) => {
      await game.say([PROMISE_YEARS])
      game.setCtx(null)
    },
  }, [eq('arg', 'years')]),
  // колёсный вопрос «Нивы» (#1549): строка спрашивает про колёса и рассрочку — ответ про них,
  // а не философия пула «никогда». Пара держится строкой вопроса (`arg: 'wheels'` ставит оффер);
  // имя правила задано явно: у общего «никогда» тот же ключ arg со значением-исключением.
  { ...says('promiseNever', {
    bonus: 1,
    respond: async ({ game, facts }) => {
      const t = String(facts['ctx.when'] ?? '')
      await game.say([game.uniq(() => game.X.fill(game.draw('WHEELS_NEVER', WHEELS_NEVER), { t, T: cap(t) }))])
      game.setCtx(null)
    },
  }, [eq('arg', 'wheels')]), name: 'Says_promiseNever_wheels' },
  // карандаш, горизонт и ирония на «никогда» — у каждой кнопки свой акт и свой пул.
  // Философский пул «никогда» отвечает только на упрёк про сам срок: колёсный вопрос получает свой ответ выше (#1549).
  ...([['promisePencil', 'PROMISE_PENCIL', PROMISE_PENCIL, []], ['promiseFar', 'PROMISE_FAR', PROMISE_FAR, []], ['promiseNever', 'PROMISE_NEVER', PROMISE_NEVER, [ne('arg', 'wheels')]]] as const).map(([act, key, pool, extra]) => says(act, {
    respond: async ({ game, facts }) => {
      const t = String(facts['ctx.when'] ?? '')
      const days = fmtDays(Number(facts['ctx.whenDays'] ?? 0))
      // сравнение с коньяком — источник эха «Лет через двадцать?» (#918): факт ставит та же реплика, что и обещает его;
      // сравнение — с сырым текстом из колоды, декор Алика его не касается
      let raw = ''
      const line = game.uniq(() => (raw = game.X.fill(game.draw(key, pool), { t, T: cap(t), days })))
      if (raw === KONAK_LINE) game.applyFacts([set(saidKonak, true)])
      await game.say([line])
      game.setCtx(null)
    },
  }, [...extra])),

  // упрёк по звонку с объекта (#577): отнекивается, перекладывает, винит чай. Голой колодой, без uniq:
  // uniq на пуле таком длины при частых нажатиях вырождается в повторы подряд — колода сама не даёт
  // двух одинаковых ответов рядом (стык циклов)
  says('crewPaid', {
    respond: async ({ game }) => {
      await game.say([game.draw('CREW_PAID', CREW_PAID)])
      game.setCtx(null)
    },
  }),
  // реакции на заметные системные события (#927): ответ — колода своего события, без повторов подряд.
  // Ответ событие потребляет: окно закрывается, иначе вариант живёт ещё ходы и Алик повторяет строку пула (#918)
  says('ramPhoto', {
    respond: async ({ game }) => {
      await game.say([game.draw('RAM_PHOTO', RAM_PHOTO)])
      game.clearFact(ramPhotoAt)
      game.setCtx(null)
    },
  }),
  says('borisSale', {
    respond: async ({ game }) => {
      await game.say([game.draw('BORIS_SALE', BORIS_SALE)])
      game.clearFact(borisSaleAt)
      game.setCtx(null)
    },
  }),
  says('vacancy', {
    respond: async ({ game }) => {
      await game.say([game.draw('VACANCY', VACANCY)])
      game.clearFact(vacancyAt)
      game.setCtx(null)
    },
  }),
  // принятие вакансии (#1292): вопрос «когда выходить?» не висит — ответ-нить из двух сообщений
  // называет срок и что значит «сразу». Согласие — вторая строка окна (`P_VACANCY[1]`), номер уезжает с arg
  says('vacancy', {
    respond: async ({ game }) => {
      await game.say([game.draw('VACANCY_START_B', VACANCY_START_B)])
      await game.say([game.draw('VACANCY_SOON_B', VACANCY_SOON_B)])
      game.clearFact(vacancyAt)
      game.setCtx(null)
    },
  }, [eq('arg', '1')]),
  // карточка друга Серёги «Ну что, заплатил твой Алик?» (#1292): окно события потребляет ответ
  says('seryoga', {
    respond: async ({ game }) => {
      await game.say([game.draw('SERYOGA_B', SERYOGA_B)])
      game.clearFact(seryogaAskAt)
      game.setCtx(null)
    },
  }),
  // свип карточек ленты (#1487): семь карточек, обращённых к игроку, получили окно — ответ
  // идёт по пулу события и потребляет штамп, как у #927/#1292
  says('hhJob', {
    respond: async ({ game }) => {
      await game.say([game.draw('HH_JOB_B', HH_JOB_B)])
      game.clearFact(hhJobAt)
      game.setCtx(null)
    },
  }),
  says('seryogaLoan', {
    respond: async ({ game }) => {
      await game.say([game.draw('SERYOGA_LOAN_B', SERYOGA_LOAN_B)])
      game.clearFact(seryogaLoanAt)
      game.setCtx(null)
    },
  }),
  says('dachaAsk', {
    respond: async ({ game }) => {
      await game.say([game.draw('DACHA_ASK_B', DACHA_ASK_B)])
      game.clearFact(dachaAskAt)
      game.setCtx(null)
    },
  }),
  says('evictAsk', {
    respond: async ({ game }) => {
      await game.say([game.draw('EVICT_B', EVICT_B)])
      game.clearFact(evictAt)
      game.setCtx(null)
    },
  }),
  says('collectorsEcho', {
    respond: async ({ game }) => {
      await game.say([game.draw('COLLECTORS_ECHO_B', COLLECTORS_ECHO_B)])
      game.clearFact(collectorsEchoAt)
      game.setCtx(null)
    },
  }),
  says('threatGov', {
    respond: async ({ game }) => {
      await game.say([game.draw('THREAT_GOV_B', THREAT_GOV_B)])
      game.clearFact(threatGovAt)
      game.setCtx(null)
    },
  }),
  says('fraudCard', {
    respond: async ({ game }) => {
      await game.say([game.draw('FRAUD_CARD_B', FRAUD_CARD_B)])
      game.clearFact(fraudCardAt)
      game.setCtx(null)
    },
  }),
  // строка Гранта «Ой. Не тот чат.» (#1292): отвечает сам Грант, окно события потребляет ответ
  says('grantBath', {
    respond: async ({ game }) => {
      await game.say([game.draw('GRANT_BATH_B', GRANT_BATH_B)])
      game.clearFact(grantBathAt)
      game.setCtx(null)
    },
  }),
  // вопрос Алика «ты обиделся?» (#1292): окно события потребляет ответ
  says('offendedAsk', {
    respond: async ({ game }) => {
      await game.say([game.draw('OFFENDED_ASK_B', OFFENDED_ASK_B)])
      game.clearFact(offendedAskAt)
      game.setCtx(null)
    },
  }),
  // условие Карине «переложите нам ванную» (#1382): окно события потребляет ответ, выбор пишет ветку
  // в `bath.answered`. Ветку читает День выплаты: «в счёт долга» — согласие на вычет, отказ и вопрос
  // о плитке согласием не являются, там строка отказа звучит как прежде (#862). Ответ по выбранной
  // строке (arg), как у стажёра и дырки (#1017); прямой fire без номера — колода, окно не пустует.
  says('bathAsk', {
    respond: async ({ game, facts }) => {
      const i = Number(facts.arg)
      const line = Number.isInteger(i) ? BATH_ASK_B[i] : undefined
      const branch = Number.isInteger(i) ? BATH_ANSWER[i] : undefined
      if (branch) game.applyFacts([set(bathAnswered, branch)])
      await game.say([line ?? game.draw('BATH_ASK_B', BATH_ASK_B)])
      game.clearFact(bathAskedAt)
      game.setCtx(null)
    },
  }),
  // признание «учу английский» + карточка курса mu-en (#1410): окно события потребляет ответ — выбор
  // пишет факт `muen.answered`, а не стирает штамп `muenAt`: он же держит однократность карточки.
  // Ответ по выбранной строке (arg), как у ванной и дырки (#1017); прямой fire без номера — колода,
  // окно не пустует.
  says('muen', {
    respond: async ({ game, facts }) => {
      const i = Number(facts.arg)
      const line = Number.isInteger(i) ? MUEN_ASK_B[i] : undefined
      game.applyFacts([set(muenAnswered, true)])
      await game.say([line ?? game.draw('MUEN_ASK_B', MUEN_ASK_B)])
      game.setCtx(null)
    },
  }),
  says('avitoReview', {
    respond: async ({ game }) => {
      await game.say([game.draw('AVITO_REVIEW', AVITO_REVIEW)])
      game.clearFact(avitoReviewAt)
      game.setCtx(null)
    },
  }),
  says('rubikAsk', {
    respond: async ({ game }) => {
      await game.say([game.draw('RUBIK_ASK', RUBIK_ASK)])
      game.clearFact(rubikAskAt)
      game.setCtx(null)
    },
  }),
  says('kettle', {
    respond: async ({ game }) => {
      await game.say([game.draw('KETTLE', KETTLE)])
      game.clearFact(kettleAt)
      game.setCtx(null)
    },
  }),
  // прямые вопросы и первые сообщения персонажей (#958): ответ потребляет окно события
  says('crewCall', {
    respond: async ({ game }) => {
      await game.say([game.draw('CREW_CALL_B', CREW_CALL_B)])
      game.clearFact(crewPaidAt)
      game.setCtx(null)
    },
  }),
  says('lawyerAsk', {
    respond: async ({ game }) => {
      await game.say([game.draw('LAWYER_B', LAWYER_B)])
      game.clearFact(lawyerAt)
      game.setCtx(null)
    },
  }),
  says('collectorsAsk', {
    respond: async ({ game }) => {
      await game.say([game.draw('COLLECTORS_ASK_B', COLLECTORS_ASK_B)])
      game.clearFact(collectorsAskAt)
      game.setCtx(null)
    },
  }),
  says('collectorsEp', {
    respond: async ({ game, facts }) => {
      const fact = String(facts.arg ?? '')
      const line = COLLECTORS_EP_B.find((e) => (spec(e).when ?? []).some((c) => c.key === fact))
      await game.say([line ? spec(line).t : game.draw('COLLECTORS_EP_B', COLLECTORS_EP_B)])
      game.clearFact(collectorsEpAt)
      game.setCtx(null)
    },
  }),
  says('internOffer', {
    respond: async ({ game, facts }) => {
      // ответ по выбранной строке игрока (#1017): номер согласия/отказа уехал с arg у оффера.
      // Номер без строки (старый путь/прямой fire) — колода, как раньше: окно не пустует.
      const i = Number(facts.arg)
      // выбор пишет факт, на который опирается эпилог (#1041, #1335): отказ (вторая строка пула) снимает
      // «Стажёра», согласие (первая и третья) — единственный источник утверждений о стажировке.
      // Молчание окна не пишет ни одного факта: истечение срока — не выбор игрока.
      if (i === 1) game.applyFacts([set(internDeclined, true)])
      else if (i === 0 || i === 2) game.applyFacts([set(internAccepted, true)])
      const line = Number.isInteger(i) ? INTERN_B[i] : undefined
      await game.say([line ? valueOf(line) : game.draw('INTERN_B', INTERN_B)])
      game.clearFact(internAt)
      game.setCtx(null)
    },
  }),
  says('rubikHole', {
    respond: async ({ game, facts }) => {
      // «ровно/криво/за плату» получают свой ответ B-пула (#1017), а не случайный из колоды
      const i = Number(facts.arg)
      const line = Number.isInteger(i) ? HOLE_B[i] : undefined
      await game.say([line && isOpen(line, game.lineFacts()) ? valueOf(line) : game.draw('HOLE_B', HOLE_B)])
      game.clearFact(rubikHoleAt)
      game.setCtx(null)
    },
  }),
  // дебюты участников (#973): ответ потребляет окно — повторные сообщения нового окна не откроют
  says('debutArsen', {
    respond: async ({ game, facts }) => {
      await game.say([debutArsenAnswer(game, facts.arg)])
      game.clearFact(debutAt)
      game.setCtx(null)
    },
  }),
  // трек «Плиточник» (#1351): у строки трека своё окно, ответ — та же пара DEBUT_ARSEN_B.
  // Окно дебюта не трогаем: у него свой ответ (`debutArsen`), и чужой ответ его не гасит
  says('arsenTrack', {
    respond: async ({ game, facts }) => {
      await game.say([debutArsenAnswer(game, facts.arg)])
      game.clearFact(arsenTrackAt)
      game.setCtx(null)
    },
  }),
  says('debutSamvel', {
    respond: async ({ game }) => {
      await game.say([game.draw('DEBUT_SAMVEL_B', DEBUT_SAMVEL_B)])
      game.clearFact(debutAt)
      game.setCtx(null)
    },
  }),
  says('debutBoris', {
    respond: async ({ game }) => {
      await game.say([game.draw('DEBUT_BORIS_B', DEBUT_BORIS_B)])
      game.clearFact(debutAt)
      game.setCtx(null)
    },
  }),
  says('debutNiva', {
    respond: async ({ game }) => {
      await game.say([game.draw('DEBUT_NIVA_B', DEBUT_NIVA_B)])
      game.clearFact(debutAt)
      game.setCtx(null)
    },
  }),
  says('debutNune', {
    respond: async ({ game }) => {
      await game.say([game.draw('NUNE_DEBUT_B', NUNE_DEBUT_B)])
      game.clearFact(debutAt)
      game.setCtx(null)
    },
  }),
  says('debutGrant', {
    respond: async ({ game }) => {
      await game.say([game.draw('DEBUT_GRANT_B', DEBUT_GRANT_B)])
      game.clearFact(debutAt)
      game.setCtx(null)
    },
  }),
  says('grantTile', {
    respond: async ({ game }) => {
      await game.say([game.draw('GRANT_TILE_B', GRANT_TILE_B)])
      game.clearFact(grantTileAt)
      game.setCtx(null)
    },
  }),
  says('countersuitAsk', {
    respond: async ({ game }) => {
      await game.say([game.draw('COUNTERSUIT_B', COUNTERSUIT_B)])
      game.clearFact(countersuitAt)
      game.setCtx(null)
    },
  }),
  // деньги в окне праздника (#585): ответ пулом этого праздника — ход не уходит в обычную отмазку мимо него
  says('holiday', {
    respond: async ({ game, facts }) => {
      const pool = HOLIDAY_MONEY[String(facts.holiday) as Holiday]
      if (!pool) return false
      // пул гейтится по дню окна (#802): line отдаёт текст уместной строки, не уместных нет — молчание
      const text = game.line('HOLIDAY_MONEY', pool)
      if (text === null) return false
      await game.say([text])
      game.setCtx(null)
    },
  }),
  says('condole', { respond: async ({ game }) => { game.mood(1); await game.say([game.pair('CONDOLE_A', D.CONDOLE_A, 'CONDOLE_B', D.CONDOLE_B)]); game.setCtx(null) } }),
  // соболезнуешь, а покойник уже встал и говорит тост
  says('condole', { respond: async ({ game }) => { await game.say([game.uniq(() => game.draw('CONDOLE_REVIVED', CONDOLE_REVIVED))]); game.setCtx(null) } }, [is('ctx.revived')]),

  says('congrats', {
    respond: async ({ game }) => {
      const rel = game.ctx?.rel
      game.mood(2)
      if (rel) await game.say([game.uniq(() => game.X.congrats(rel))])
      if (game.chance(0.25 + Number(game.facts().mood) * 0.03)) { await game.transfer(); return }
      const r = game.uniq(game.X.ping)
      game.recordPromise(r.p)
      await game.say([`Про деньги — ${low(r.p.text)}.`])
      game.setCtx(game.ctxFromPromise(r.p))
    },
  }),

  says('whyRel', {
    respond: async ({ game }) => {
      const rel = game.ctx?.rel ?? { n: 'он', g: 'него' }
      const r = game.uniq(() => game.X.whyRel(rel))
      game.recordPromise(r.p)
      await game.say([r.text])
      game.setCtx({ ...game.ctxFromPromise(r.p), constr: true })
    },
  }),
  says('defend', { respond: async ({ game }) => { const r = game.uniq(game.X.defend); game.recordPromise(r.p); await game.say([r.text]); game.setCtx(game.ctxFromPromise(r.p)) } }),
  says('ping', { respond: async ({ game }) => { const r = game.uniq(game.X.ping); game.recordPromise(r.p); await game.say([r.text]); game.setCtx(game.ctxFromPromise(r.p)) } }),
  // отчаяние от бедности — не крик: ссора не греется, Алик отвечает человеку, потом отмазывается как обычно
  // общий ответ — в тоне реплики (#480): крик капсом (sentinel «shout») — свой пул, остальные деньги — по тону;
  // moneyReply сам следит за повторами (одноразовый пул + перефраз fallback'ом), поэтому без uniq
  says('desperate', { respond: async ({ game, facts }) => {
    const pair = DESPERATE_PAIRS[String(facts.arg ?? '')]
    if (pair) await game.say([game.uniq(() => pair.answer)])
    else await game.say([game.moneyReply(String(facts.tone ?? 'neutral'), facts.arg === 'shout')])
    await game.excuseTurn()
  } }),

  says('prev', {
    respond: async ({ game, facts }) => {
      const i = Number(facts.arg)
      game.promiseAsked(i)
      // дата цитаты против дня болезни Бориса: отмазка «тогда Борис заболел» не ставит событие раньше самого барана (#859)
      const made = game.promiseAt(i)?.made
      const illAt = Number(game.mem()[stateAt(sick, 'boris')])
      const r = game.uniq(() => game.X.prev({ made, illAt: Number.isFinite(illAt) ? illAt : undefined }))
      game.recordPromise(r.p)
      await game.say([r.text])
      game.setCtx(game.ctxFromPromise(r.p))
    },
  }),
  // обещаний накопилось много — Алик и сам это понимает (не чаще раза в 20 дней: иначе к середине игры это единственный ответ)
  says('prev', {
    cooldown: { days: 20 },
    respond: async ({ game, facts }) => {
      const i = Number(facts.arg)
      game.promiseAsked(i)
      game.unlock('memory')
      await game.promiseLine(game.uniq(() => game.draw('PREV_MANY', PREV_MANY)))
    },
  }, [ThickJournal]),

  // конвертный вопрос свадьбы Самвела (#1549): ответ — пара к выбранной строке (`KONVERTY_B` того же
  // номера), как у дебюта Арсена (#1500), а не следующая серия свадьбы. Факт конвертов ставит легенда;
  // оффер Opt_Konverty открыт только под ним.
  says('konverty', {
    respond: async ({ game, facts }) => {
      const i = Number(facts.arg)
      const line = Number.isInteger(i) ? KONVERTY_B[i] : undefined
      const answer = line && isOpen(line, game.lineFacts()) ? valueOf(line) : game.draw('KONVERTY_B', KONVERTY_B)
      await game.say([answer])
      game.setCtx(null)
    },
  }),

  says('arc', {
    respond: async ({ game, facts }) => {
      const id = String(facts.arg ?? '') as ArcId
      game.applyFacts([add(asked(id), 1)]) // для финалов: «спрашивал про Бориса 3+ раз»
      // на вопрос — следующая серия; второй вопрос подряд в тот же день — «пока без новостей» (не проглатывать сериал)
      if (game.arcStarted(id) && ARCS[id] && game.arcCanAdvance(id, true)) { await game.playArc(id); game.arcByAsk(id); return }
      // «Передавайте привет Борису» — не вопрос: «пока без новостей» на него звучит невпопад
      await game.say([facts.greet ? game.uniq(() => game.draw('GREET_A', GREET_A)) : game.pair('NN_A', NO_NEWS_A, 'NN_B', NO_NEWS_B)])
      game.setCtx(null)
    },
  }),
  // сериал закончился — у каждого свой финальный ответ вместо общего «без новостей»
  says('arc', {
    respond: async ({ game, facts }) => {
      const id = String(facts.arg ?? '') as ArcId
      game.applyFacts([set(doneAsked(id), game.day)])
      const lines = game.arcDoneLines(id) ?? NO_NEWS_A
      await game.say([game.uniq(() => game.draw(`DONE_${id}_${game.mem()[finaleOf(id)] ?? ''}`, lines))])
      game.setCtx(null)
    },
  }, [is('argArcDone')]),

  // ответ по теме (бетон, «Нива», свадьба…): свой пул у каждой темы, исчерпан — общий
  // ответ по теме: вопрос и ответ парой (p[i] ↔ a[i]); ответ уже был — общий
  says('topic', {
    respond: async ({ game, facts }) => {
      const [k, i] = String(facts.arg ?? '').split(':') as [TopicId, string]
      game.applyFacts([add(topic(k), 1)])
      const n = Number(game.mem()[topic(k)] ?? 0)
      game.applyFacts([set(topicRun, game.mem().topicLast === k ? Number(game.mem().topicRun ?? 0) + 1 : 1), set(topicLast, k)])
      // некоторые вопросы сразу превращаются в мини-квест («Приеду поесть» → хаш в 7 утра)
      const quest = TOPICS[k]?.quest?.[Number(i)]
      // квест из разговора — по тем же условиям, что и сам квест, и один раз за игру
      if (quest && game.scenes[quest] && game.questAllowed(quest)) {
        await game.enterNode(quest, game.scenes[quest].start)
        game.takeQuest(quest)
        return
      }
      const a = TOPICS[k]?.a[Number(i)]
      // ответ Алика — тоже тема: разговор может продолжиться
      if (a && !game.seen.has(a)) { game.seen.mark(a); game.markTopical(await game.say([a])) } else await game.say([game.uniq(() => game.draw('TOPIC_FB', TOPIC_FALLBACK))])
      // третий вопрос про одно и то же — Алик замечает и замолкает на эту тему на 20 дней
      if (n >= 3 && TOPIC_NAME[k]) {
        await game.sleep(600)
        await game.say([game.uniq(() => game.draw('TOPIC_OBS', TOPIC_OBSESSED).replace('{n}', TOPIC_NAME[k]))])
        game.unlock('memory')
        game.applyFacts([set(topic(k), 0), set(topicMute(k), game.day + 20)])
      }
      game.setCtx(null)
      if (game.chance(0.35)) await game.promiseLine()
    },
  }),
  says('group', { respond: async ({ game }) => { game.mood(-1); await game.say([game.pair('GS_A', GROUP_SEEN_A, 'GS_B', GROUP_SEEN_B)]); game.setCtx(null) } }),
  simple('wrong', (g) => g.pair('WA', WRONG_A, 'WB', WRONG_B)),
  says('idleReply', { respond: async ({ game }) => { game.setCtx(null); await game.say([game.uniq(() => game.draw('IDLE_A', L.IDLE_A))]); await game.promiseLine() } }),
  simple('stickerQ', (g) => g.uniq(() => g.draw('STICKER_A', L.STICKER_A))),
  simple('fwdQ', (g) => g.uniq(() => g.draw('FWD_A', L.FWD_A))),
  says('reactQ', { respond: async ({ game }) => { game.setCtx(null); await game.say([game.uniq(() => game.draw('REACT_A', L.REACT_A))]); await game.promiseLine() } }),
  simple('deletedQ', (g) => g.uniq(() => g.draw('DEL_A', L.DEL_A))),

  // --- пойман на лжи: общий ответ, частные по теме и по тому, сколько раз уже ловили
  says('catchLie', {
    remember: [add(caughtCount)],
    respond: ({ game }) => {
      const l = game.lie()
      const map = l ? { old: l.old.say, new: l.new.say, Old: cap(l.old.say), New: cap(l.new.say) } : { old: 'одно', new: 'другое', Old: 'Одно', New: 'Другое' }
      return game.caught(game.uniq(() => `${game.draw('LIE_OPEN', LIE_OPEN)} ${game.X.fill(game.draw('LIE_EXPLAIN', LIE_EXPLAIN), map)}`))
    },
  }),
  says('catchLie', { remember: [add(caughtCount)], respond: ({ game }) => game.caught(game.uniq(() => game.draw('LIE_GRANDPA', LIE_GRANDPA))) }, [eq('lieKind', 'grandpa')]),
  says('catchLie', { remember: [add(caughtCount)], respond: ({ game }) => game.caught(game.uniq(() => game.draw('LIE_CUSTOMER', LIE_CUSTOMER))) }, [eq('lieKind', 'customer')]),
  // сюжетные противоречия арок (#1548): ответ про «Ниву», срок или конверты, а не про место денег
  says('catchLie', { remember: [add(caughtCount)], respond: ({ game }) => game.caught(game.uniq(() => game.draw('LIE_NIVA', LIE_NIVA))) }, [eq('lieKind', 'niva')]),
  says('catchLie', { remember: [add(caughtCount)], respond: ({ game }) => game.caught(game.uniq(() => game.draw('LIE_PROMISE', LIE_PROMISE))) }, [eq('lieKind', 'promise')]),
  says('catchLie', { remember: [add(caughtCount)], respond: ({ game }) => game.caught(game.uniq(() => game.draw('LIE_ENVELOPES', LIE_ENVELOPES))) }, [eq('lieKind', 'envelopes')]),
  // третий раз пойман — признаётся (по-своему); дальше — Алику уже никто не верит
  { ...says('catchLie', { remember: [add(caughtCount)], respond: ({ game }) => game.caught(game.uniq(() => game.draw('LIE_THIRD', LIE_THIRD))) }, [gte(caughtCount, 2)]), bonus: 1 },
  { ...says('catchLie', { remember: [add(caughtCount)], respond: ({ game }) => game.caught(game.uniq(() => game.draw('LIE_NOCRED', LIE_NOCRED))) }, [gte(caughtCount, 3)]), bonus: 2 },
]
