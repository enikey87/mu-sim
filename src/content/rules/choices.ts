// Событие BuildChoices — какие контекстные реплики предложить игроку.
// Берутся два самых приоритетных (специфичность + bonus); из одного слота — только одна.
import type { ContentApi } from '../../engine/game'
import type { Choice, Tone } from '../../engine/state'
import { type Rule, type Facts, type Criterion, type Entry, eq, ne, is, exists, missing, gt, gte, lte, isOpen, valueOf, sinceWithin } from '../fact'
import type { GameEvent, Offer } from './events'
import { D, cap, WHEN_YEARS } from '../excuses'
import { talkPairs, talkId } from '../talk'
import { ARCS, WRONG_Q } from '../arcs'
import * as L from '../life'
import { GROUP_Q } from '../misc'
import { P_LIE } from '../lies'
import { TOPICS } from '../topics'
import { P_CREW_PAID } from '../crew'
import { MONEY_ASK, moneyPlaceOf } from '../money-ask'
import { P_HOLIDAY, holidayBefore, type Holiday } from '../holidays'
import { WORLD, SPEAKS } from '../world'
import { fmtDayMonth, fmtDays } from '../../engine/time'
import { HEAT, alikDead, alikShaved, intro, moustacheAskAt, blocked, court, mourning, phoneKarine, crewPaid, endgame } from '../memkeys'
import { requirePlayerPool } from '../player-pools'
import {
  P_VIA_BORIS, P_VIA_KARINE, P_VIA_MAMA, P_MOO, P_MOUSTACHE, P_COURT, P_COLLECTORS_DEBUT,
  P_RAM_PHOTO, P_BORIS_SALE, P_VACANCY, P_AVITO_REVIEW, P_RUBIK_ASK, P_KETTLE,
} from './player-choice-pools'

type R = Rule<ContentApi, GameEvent, Offer>

interface OfferSpec {
  name: string
  when: Criterion[]
  act?: string
  tone: Tone
  text: (game: ContentApi, facts: Facts) => string
  arg?: (game: ContentApi, facts: Facts) => string | number | undefined
  /** Тема вопроса для дедупа блока (#887): два про одно и то же в одной сборке не стоят. */
  topic?: (game: ContentApi, facts: Facts) => string | undefined
  bonus?: number
  specificity?: number
  slot?: string
  weight?: number
  odds?: number
  /** Перерыв от показа: кнопку увидели — пауза пошла (штамп при сборке вариантов, game.ts). */
  cooldown?: { turns?: number; days?: number }
}

/** Тема вопроса: место денег и тема игрока называют ту же тему, что арка (#887) — иначе два вопроса об одном. */
const MONEY_TOPIC: Record<string, string> = { beton: 'arc:beton' }
const TOPIC_ARC: Record<string, string> = { beton: 'arc:beton', wedding: 'arc:samvel', ram: 'arc:boris', niva: 'arc:niva' }

const fromD = (game: ContentApi, key: string, map: Record<string, string> = {}) => {
  requirePlayerPool(`D.${key}`, D[key])
  return game.playerLine(() => game.X.fill(game.draw(key, D[key]), map))
}
const fromArr = (game: ContentApi, key: string, arr: readonly Entry<unknown>[]) => {
  requirePlayerPool(key, arr)
  return game.playerLine(() => game.draw(key, arr as readonly Entry<string>[]))
}
// пул — в реестре кнопок (#491), но строка — как есть, без украшения обращением: обращаемся к посреднику, а не к Алику (#512)
const plainFromArr = (game: ContentApi, key: string, arr: readonly Entry<unknown>[]) => {
  requirePlayerPool(key, arr)
  return game.draw(key, arr as readonly Entry<string>[])
}
const freshFromArr = (game: ContentApi, key: string, arr: readonly Entry<unknown>[]) => {
  requirePlayerPool(key.startsWith('F_') ? `ARCS.${key.slice(2)}.follow` : key, arr)
  return game.freshPlayer(key, arr as readonly Entry<string>[]) ?? ''
}


const offer = (o: OfferSpec): R => ({
  name: `Opt_${o.name}`,
  event: 'BuildChoices',
  when: o.when,
  bonus: o.bonus,
  specificity: o.specificity,
  slot: o.slot ?? o.name,
  weight: o.weight,
  odds: o.odds,
  cooldown: o.cooldown,
  // пустой текст — нечего предложить (весь пул недавно показывали)
  offer: ({ game, facts }): Choice | null => {
    const text = o.text(game, facts)
    return text ? { text, tone: o.tone, act: o.act, arg: o.arg?.(game, facts), topic: o.topic?.(game, facts) } : null
  },
})

export const choiceRules: R[] = [
  // поймать на лжи — открытый эпизод журнала; в молчании Алика кнопка скрыта, эпизод остаётся
  offer({
    name: 'CatchLie',
    when: [is('lieOpen'), missing(blocked), missing(alikDead), missing(phoneKarine), eq('offline', false)],
    act: 'catchLie', tone: 'neutral', bonus: 6,
    text: (g) => { const l = g.lie()!; return g.playerLine(() => g.X.fill(g.draw('P_LIE', P_LIE), { old: l.old.say, new: l.new.say })) },
  }),
  // упрёк по звонку с объекта: пул живёт только под фактом звонка, в окнах молчания — молчит (#577)
  offer({
    name: 'CrewPaid',
    when: [is(crewPaid), missing(blocked), missing(alikDead)],
    act: 'crewPaid', tone: 'neutral', bonus: 4,
    cooldown: { turns: 10 }, // иначе кнопка занимает слот в 94% кадров выбора до конца партии (#592 → #789)
    text: (g) => fromArr(g, 'P_CREW_PAID', P_CREW_PAID),
  }),
  // праздник в календаре переписки: деньги под ним, один вариант на окно (#585); в окне молчания — молчит.
  // Слот только до дня: «на носу» 1 января — праздник уже прошёл (#828). Пул и окно Алика те же.
  offer({
    name: 'Holiday',
    when: [ne('holiday', false), missing(endgame.active), missing(alikDead), missing(blocked)],
    act: 'holiday', tone: 'neutral', bonus: 4,
    text: (g, facts) => {
      if (!holidayBefore(g.day)) return ''
      const pool = P_HOLIDAY[facts.holiday as Holiday]
      return pool ? fromArr(g, `P_HOLIDAY.${String(facts.holiday)}`, pool) : ''
    },
  }),
  // извиниться после грубости
  offer({ name: 'Sorry', when: [is('ctx.offended')], act: 'sorry', tone: 'polite', bonus: 5, text: (g) => fromD(g, 'P_SORRY') }),
  // лестница грубости: заблокирован — извиниться можно только через Бориса; ссора горячая — можно мычать
  // посредник — лучший из тех, кто есть: Борис, Карине, мама Алика (один вариант на слот); обращение к посреднику — без «Алик, …»
  offer({ name: 'Via_boris', slot: 'via', when: [is(blocked), SPEAKS.boris], act: 'via', arg: () => 'boris', tone: 'polite', bonus: 7, text: (g) => plainFromArr(g, 'P_VIA_BORIS', P_VIA_BORIS) }),
  offer({ name: 'Via_karine', slot: 'via', when: [is(blocked), WORLD.karineHome, WORLD.karine], act: 'via', arg: () => 'karine', tone: 'polite', bonus: 6, text: (g) => plainFromArr(g, 'P_VIA_KARINE', P_VIA_KARINE) }),
  offer({ name: 'Via_mama', slot: 'via', when: [is(blocked)], act: 'via', arg: () => 'mama', tone: 'polite', bonus: 6, text: (g) => plainFromArr(g, 'P_VIA_MAMA', P_VIA_MAMA) }),
  offer({ name: 'Moo', when: [is('ctx.offended'), gte(HEAT, 1)], odds: 0.5, act: 'moo', tone: 'neutral', bonus: 4, text: (g) => fromArr(g, 'P_MOO', P_MOO) }),

  // пока усы отрастают — подколоть Алика (#352); не чаще раза в 5 дней после вопроса,
  // и только пока нить жива: с 31-го дня после бритья кнопка уходит (#921)
  {
    name: 'Opt_Moustache', event: 'BuildChoices', when: [is(alikShaved), ...sinceWithin('shaved', 30)], bonus: 2,
    slot: 'moustache',
    offer: ({ game }) => {
      if (game.day - Number(game.mem()[moustacheAskAt] ?? -99) < 5) return null
      const text = freshFromArr(game, 'P_MOUSTACHE', P_MOUSTACHE)
      return text ? { text, tone: 'neutral' as const, act: 'moustacheAsk' } : null
    },
  },

  // заметные системные события (#927): 1–2 варианта-реакции, пока свежо событие — ход и три после
  offer({ name: 'RamPhoto', when: [is('ramPhotoFresh')], act: 'ramPhoto', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'P_RAM_PHOTO', P_RAM_PHOTO) }),
  offer({ name: 'BorisSale', when: [is('borisSaleFresh')], act: 'borisSale', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'P_BORIS_SALE', P_BORIS_SALE) }),
  offer({ name: 'Vacancy', when: [is('vacancyFresh')], act: 'vacancy', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'P_VACANCY', P_VACANCY) }),
  offer({ name: 'AvitoReview', when: [is('avitoReviewFresh')], act: 'avitoReview', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'P_AVITO_REVIEW', P_AVITO_REVIEW) }),
  offer({ name: 'RubikAsk', when: [is('rubikAskFresh')], act: 'rubikAsk', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'P_RUBIK_ASK', P_RUBIK_ASK) }),
  offer({ name: 'Kettle', when: [is('kettleFresh')], act: 'kettle', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'P_KETTLE', P_KETTLE) }),

  // ответ на то, ЧТО прислал Алик
  offer({ name: 'Photo', when: [eq('ctx.type', 'photo')], act: 'photo', tone: 'neutral', bonus: 3, text: (g) => fromD(g, 'P_PHOTO') }),
  offer({ name: 'VoiceCow', slot: 'voice', weight: 0.4, when: [eq('ctx.type', 'voice')], act: 'voice', tone: 'neutral', bonus: 3, text: (g) => fromD(g, 'P_VOICE') }),
  offer({ name: 'VoiceText', slot: 'voice', weight: 0.6, when: [eq('ctx.type', 'voice')], act: 'voiceText', tone: 'neutral', bonus: 3, text: (g) => fromD(g, 'P_VOICE2') }),
  offer({ name: 'Transfer', when: [eq('ctx.type', 'transfer')], act: 'transferQ', tone: 'neutral', bonus: 3, text: (g, f) => fromD(g, 'P_TRANSFER', { amount: String(f['ctx.amount'] ?? 50) }) }),
  offer({ name: 'Ping', when: [eq('ctx.type', 'readonly')], act: 'ping', tone: 'neutral', bonus: 3, text: (g) => fromD(g, 'P_PING') }),
  // «Завтра» → «это когда?», а «Брат, в пути» → «А подробнее?»
  offer({
    name: 'ShortTime', slot: 'short', when: [eq('ctx.type', 'short'), is('ctx.shortTimey')], act: 'shortQ', tone: 'neutral', bonus: 3,
    text: (g, f) => fromD(g, 'P_SHORT', { s: String(f['ctx.s']).replace(/[.!…,].*$/, '') }), arg: (_g, f) => String(f['ctx.s']),
  }),
  offer({ name: 'ShortOther', slot: 'short', when: [eq('ctx.type', 'short'), eq('ctx.shortTimey', false)], act: 'short2', tone: 'neutral', bonus: 3, text: (g) => fromD(g, 'P_SHORT2') }),
  offer({ name: 'Idle', when: [eq('ctx.type', 'idle')], act: 'idleReply', tone: 'polite', bonus: 3, text: (g) => fromArr(g, 'IDLE_Q', L.IDLE_Q) }),
  offer({ name: 'Sticker', when: [eq('ctx.type', 'sticker')], act: 'stickerQ', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'STICKER_Q', L.STICKER_Q) }),
  offer({ name: 'Fwd', when: [eq('ctx.type', 'fwd')], act: 'fwdQ', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'FWD_Q', L.FWD_Q) }),
  offer({ name: 'ReactOnly', when: [eq('ctx.type', 'reactOnly')], act: 'reactQ', tone: 'neutral', bonus: 3, // «👍 — это да или нет?» — с той реакцией, что Алик поставил на самом деле
    text: (g) => { const m = [...g.msgsView()].reverse().find((x) => x.kind === 'text' && x.from === 'me'); const r = (m?.kind === 'text' && m.react) || '👍'; return fromArr(g, 'REACT_Q', L.REACT_Q).replace('👍', r) } }),
  offer({ name: 'Deleted', when: [is('ctx.deleted')], act: 'deletedQ', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'DEL_Q', L.DEL_Q) }),
  // процитировать можно только то, что в этом чате сказали
  offer({ name: 'Group', when: [is('ctx.group')], act: 'group', tone: 'neutral', bonus: 3, text: (g, f) => (f['ctx.quote'] && g.chance(0.4) ? `«${f['ctx.quote']}»?!` : fromArr(g, 'GQ', GROUP_Q)) }),
  offer({ name: 'Wrong', when: [is('ctx.wrong')], act: 'wrong', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'WQ', WRONG_Q) }),
  offer({ name: 'Legend', when: [is('ctx.legendary')], act: 'legendQ', tone: 'polite', bonus: 2, text: (g) => fromD(g, 'P_LEGEND') }),

  // срок обещания: только пока он ещё впереди относительно даты над перепиской (после +1…3 дня «завтра» уже вчера).
  // Кнопка — по горизонту и роду (docs/design/deadline-replies.md); специфичность прежняя, слот `when` вытесняет других как раньше
  ...(() => {
    const term = [exists('ctx.when'), is('ctx.whenFresh')]
    const args = (f: Facts) => ({ t: String(f['ctx.when']), T: cap(String(f['ctx.when'])), date: String(f['ctx.whenDate'] ?? ''), days: fmtDays(Number(f['ctx.whenDays'] ?? 0)) })
    const when = (o: Pick<OfferSpec, 'name' | 'when' | 'act' | 'tone' | 'weight' | 'arg' | 'text'>) => offer({ slot: 'when', specificity: 3, bonus: 1, ...o })
    const near = [...term, eq('ctx.whenHorizon', 'near')]
    const askPool = (f: Facts): string =>
      f['ctx.whenKind'] === 'holiday' ? 'P_WHEN_CALENDAR' : f['ctx.whenKind'] === 'event' ? 'P_WHEN_EVENT' : 'P_WHEN'
    return [
      when({ name: 'WhenOk', when: near, weight: 0.4, act: 'promiseOk', tone: 'polite', text: (g, f) => fromD(g, f['ctx.whenDate'] ? 'P_WHEN_OK' : 'P_WHEN_OK_EVENT', args(f)) }),
      when({ name: 'WhenCheck', when: near, weight: 0.6, act: 'promiseCheck', tone: 'neutral', text: (g, f) => fromD(g, askPool(f), args(f)), arg: (_g, f) => String(f['ctx.when']) }),
      when({ name: 'WhenPencil', when: [...term, eq('ctx.whenHorizon', 'far')], act: 'promisePencil', tone: 'neutral', text: (g, f) => fromD(g, 'P_WHEN_PENCIL', args(f)) }),
      when({ name: 'WhenFar', when: [...term, eq('ctx.whenHorizon', 'veryFar')], act: 'promiseFar', tone: 'neutral', text: (g, f) => fromD(g, 'P_WHEN_FAR', args(f)), arg: (_g, f) => String(f['ctx.when']) }),
      ...(['never', 'absurd'] as const).map((kind) => {
        let years = false
        return when({
          name: `When_${kind}`, when: [...term, eq('ctx.whenKind', kind)], act: 'promiseNever', tone: 'neutral',
          text: (g, f) => {
            const map = args(f)
            years = false
            requirePlayerPool('D.P_WHEN_NEVER', D.P_WHEN_NEVER)
            return g.playerLine(() => {
              const raw = g.X.fill(g.draw('P_WHEN_NEVER', D.P_WHEN_NEVER), map)
              if (raw === WHEN_YEARS) years = true
              return raw
            })
          },
          arg: (_g, f) => (years ? 'years' : String(f['ctx.when'])),
        })
      }),
    ]
  })(),

  // родственник: спросить «при чём тут он» / поздравить / посочувствовать — одна кнопка на слот
  offer({
    name: 'WhyRel', slot: 'rel', specificity: 2, weight: 1, when: [exists('ctx.rel')], act: 'whyRel', tone: 'neutral',
    // родственник назван словами Алика («мой шофёр Гриша») — у игрока своя форма в словаре («ваш шофёр Гриша»)
    text: (g, f) => fromD(g, 'P_WHY_REL', { n: String(f['ctx.relYou']) }),
  }),
  offer({ name: 'Congrats', slot: 'rel', specificity: 2, weight: 1, when: [exists('ctx.rel'), is('ctx.festive')], act: 'congrats', tone: 'polite', text: (g) => fromD(g, 'P_CONGRATS') }),
  offer({ name: 'Condole', slot: 'rel', specificity: 2, weight: 1, when: [exists('ctx.rel'), is('ctx.sad')], act: 'condole', tone: 'polite', text: (g) => fromD(g, 'P_CONDOLE') }),
  offer({ name: 'Mourn', when: [is(mourning)], odds: 0.5, act: 'condole', tone: 'polite', bonus: 1, text: (g) => fromD(g, 'P_CONDOLE') }),

  offer({ name: 'Doubt', when: [is('ctx.constr')], act: 'defend', tone: 'neutral', bonus: 1, text: (g) => fromD(g, 'P_DOUBT') }),

  // кредитная лестница: кнопки собирает Game.buildChoices напрямую (не через top-2 collect)

  // напомнить о просроченном обещании из журнала
  offer({
    name: 'Prev', when: [gt('lateCount', 0)], act: 'prev', tone: 'neutral', bonus: 1, odds: 0.35,
    ...(() => {
      let idx = -1
      return {
        text: (g: ContentApi) => {
          const late = g.latePromises()
          const p = late[g.rnd(late.length)]
          idx = g.promiseIndexOf(p)
          return fromD(g, 'P_PREV', { t: p.t, date: fmtDayMonth(p.made) })
        },
        arg: () => idx,
      }
    })(),
  }),

  // сериалы: про текущий — всегда, про любой незаконченный — иногда
  // дебют коллекторов (#888): в окне их первой серии у игрока есть вопрос про них самих.
  // Окно закрывает сама серия: следующий эпизод двигает arc.collectors, и вопрос уходит вместе с окном
  offer({
    name: 'CollectorsDebut', slot: 'arc', when: [is(intro('collectors')), eq('arc.collectors', 1)], act: 'arc', tone: 'polite', bonus: 2,
    text: (g) => g.freshPlayer('F_collectors_debut', P_COLLECTORS_DEBUT) ?? g.draw('F_collectors_debut', P_COLLECTORS_DEBUT),
    arg: () => 'collectors',
  }),
  offer({
    // единственный выход из смерти: вопрос не исчезает, даже если все недавно показывали (исключение из окна #824)
    name: 'ArcDeath', slot: 'arc', when: [is(alikDead), is('deathCanAdvance')], act: 'arc', tone: 'polite', bonus: 5,
    text: (g) => g.freshPlayer('F_alik_death', ARCS.alik_death.follow) ?? g.oldestShown(ARCS.alik_death.follow), arg: () => 'alik_death',
  }),
  offer({
    // вопрос про сериал — только если он к чему-то приведёт (иначе «Как Нуне?» трижды подряд → «пока без новостей»)
    name: 'Arc', slot: 'arc', when: [missing(alikDead), exists('ctx.arc'), is('ctx.arcCanAdvance')], act: 'arc', tone: 'polite', bonus: 1,
    // свежая формулировка, а исчерпанный пул — повторяемая: иначе вопрос про сериал пропадает
    // после четырёх формулировок пула `follow`, и счётчики `asked.*` упираются в размер пула —
    // финалы вида «спрашивал 5 раз» (`asked.niva`, `asked.boris`) недостижимы (#753).
    // У `ArcDeath` эта связка была и раньше.
    // окно повтора (#824): пока все формулировки пула в последних PLAYER_REPEAT_TURNS ходах, вопрос молчит, а не повторяется дословно
    text: (g, f) => { const key = 'F_' + f['ctx.arc']; const arr = ARCS[String(f['ctx.arc'])].follow; return g.freshPlayer(key, arr) ?? '' }, arg: (_g, f) => String(f['ctx.arc']),
    topic: (_g, f) => `arc:${String(f['ctx.arc'])}`,
  }),
  // дело в суде открыто — игрок может его продолжить (угроза двигает линию суда)
  offer({
    name: 'Court', when: [gte(court, 1), lte(court, 6)], odds: 0.35, tone: 'threat',
    text: (g) => fromArr(g, 'P_COURT', P_COURT),
  }),
  // «Это корова?» — только сразу после «Мууу», а не всю игру
  // ответить на то, что только что прозвучало: реплику легенды денег, вмешавшегося персонажа, воспоминание Алика,
  // реплику серии («колкость» #683 — окно держит проверка said в паре) или форму клятвы
  ...(['legend', 'chorus', 'memory', 'arc', 'word'] as const).map((kind) => {
    let arg = ''
    return offer({
      name: 'Talk_' + kind,
      when: [kind === 'memory' ? is('ctx.memory') : kind === 'word' ? exists('ctx.when') : exists(`ctx.${kind}`)],
      act: 'talk', tone: 'neutral', bonus: 2, odds: 0.8,
      text: (g, f) => {
        const sub = kind === 'memory' || kind === 'word' ? '' : String(f['ctx.' + kind])
        const said = g.msgsView().slice(-6).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : [])).join(' ')
        const facts = g.lineFacts()
        // окно дословного повтора (#857): показанный вопрос не возвращается дословно 20 ходов — пока окно
        // держит одну пару, берём следующую открытую; контекст живёт дольше окна, поэтому вопрос не пропадает
        const i = talkPairs(kind, sub).findIndex((e, j) => !g.lines.has(talkId(kind, sub, j)) && isOpen(e, facts)
          && (valueOf(e)[2]?.(g, said) ?? true) && !g.offeredInWindow(valueOf(e)[0]))
        if (i < 0) return ''
        arg = `${kind}|${sub}|${i}`
        const q = valueOf(talkPairs(kind, sub)[i])[0]
        g.rememberShown(q)
        return q
      },
      arg: () => arg,
    })
  }),
  offer({ name: 'Cow', when: [is('mooFresh')], odds: 0.8, bonus: 2, tone: 'cow', text: (g) => fromD(g, 'P_COW') }),
  // денежный вопрос — первичная контекстная кнопка (#795): пока открыта легенда денег, игрок спрашивает,
  // где они сейчас. Место — из легенды (банк/фундамент/сейф/крипта/«Нива»), формулировки по месту не
  // повторяются, слот свой: тема может стоять рядом, а не вместо. Ответ — следующая реплика той же легенды
  // (`Says_money` в replies.ts), то есть вопрос ведёт сюжет денег, а не только отвечает на сказанное.
  offer({
    name: 'Money', slot: 'money', when: [exists('legend')], act: 'money', tone: 'neutral', bonus: 3, odds: 0.9,
    text: (g, f) => { const place = moneyPlaceOf(f.legend); return place ? freshFromArr(g, 'MONEY_ASK_' + place, MONEY_ASK[place]) : '' },
    topic: (_g, f) => { const place = moneyPlaceOf(f.legend); return place ? MONEY_TOPIC[place] : undefined },
    arg: (_g, f) => String(f.legend),
  }),
  // ответ по теме: игрок цепляется за то, что Алик только что сказал (после серии сериала — вопрос про сериал важнее)
  offer({
    name: 'Topic', when: [exists('ctx.topic'), missing('ctx.arc')], act: 'topic', tone: 'neutral', odds: 0.85,
    ...(() => {
      let arg = ''
      return {
        // вопрос и ответ идут парой: p[i] ↔ a[i]
        text: (g: ContentApi, f: Facts) => {
          const t = TOPICS[String(f['ctx.topic'])]
          const fits = t.p.filter((_, i) => !t.need?.[i] || t.need[i].test(g.topicText))
          const q = g.freshPlayer('PT_' + f['ctx.topic'], fits)
          arg = q ? `${f['ctx.topic']}:${t.p.findIndex((e) => valueOf(e) === q)}` : ''
          return q ?? ''
        },
        arg: () => arg,
        topic: (_g: ContentApi, f: Facts) => TOPIC_ARC[String(f['ctx.topic'])],
      }
    })(),
  }),
]
