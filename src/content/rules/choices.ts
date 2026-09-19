// Событие BuildChoices — какие контекстные реплики предложить игроку.
// Берутся два самых приоритетных (специфичность + bonus); из одного слота — только одна.
import type { Game } from '../../engine/game'
import type { Choice, Tone } from '../../engine/state'
import { type Rule, type Facts, type Criterion, eq, is, exists, gt } from '../../engine/rules'
import { D, cap } from '../excuses'
import { ARCS, WRONG_Q } from '../arcs'
import * as L from '../life'
import { GROUP_Q } from '../misc'
import { P_LIE } from '../lies'
import { fmtDayMonth } from '../../engine/time'

type R = Rule<Game>

interface OfferSpec {
  name: string
  when: Criterion[]
  act?: string
  tone: Tone
  text: (game: Game, facts: Facts) => string
  arg?: (game: Game, facts: Facts) => string | number | undefined
  bonus?: number
  specificity?: number
  slot?: string
  weight?: number
  odds?: number
}

const fromD = (game: Game, key: string, map: Record<string, string> = {}) =>
  game.playerLine(() => game.X.fill(game.draw(key, D[key]), map))
const fromArr = (game: Game, key: string, arr: readonly string[]) => game.playerLine(() => game.draw(key, arr))

const offer = (o: OfferSpec): R => ({
  name: `Opt_${o.name}`,
  event: 'BuildChoices',
  when: o.when,
  bonus: o.bonus,
  specificity: o.specificity,
  slot: o.slot ?? o.name,
  weight: o.weight,
  odds: o.odds,
  offer: ({ game, facts }): Choice => ({ text: o.text(game, facts), tone: o.tone, act: o.act, arg: o.arg?.(game, facts) }),
})

export const choiceRules: R[] = [
  // поймать на лжи — важнее всего: момент уходит со следующей репликой
  offer({
    name: 'CatchLie', when: [exists('lie.old')], act: 'catchLie', tone: 'neutral', bonus: 6,
    text: (g) => { const l = g.lie()!; return g.playerLine(() => g.X.fill(g.draw('P_LIE', P_LIE), { old: l.old.say, new: l.new.say })) },
  }),
  // извиниться после грубости
  offer({ name: 'Sorry', when: [is('ctx.offended')], act: 'sorry', tone: 'polite', bonus: 5, text: (g) => fromD(g, 'P_SORRY') }),

  // ответ на то, ЧТО прислал Алик
  offer({ name: 'Photo', when: [eq('ctx.type', 'photo')], act: 'photo', tone: 'neutral', bonus: 3, text: (g) => fromD(g, 'P_PHOTO') }),
  offer({ name: 'VoiceCow', slot: 'voice', weight: 0.4, when: [eq('ctx.type', 'voice')], act: 'voice', tone: 'neutral', bonus: 3, text: (g) => fromD(g, 'P_VOICE') }),
  offer({ name: 'VoiceText', slot: 'voice', weight: 0.6, when: [eq('ctx.type', 'voice')], act: 'voiceText', tone: 'neutral', bonus: 3, text: (g) => fromD(g, 'P_VOICE2') }),
  offer({ name: 'Transfer', when: [eq('ctx.type', 'transfer')], act: 'transferQ', tone: 'neutral', bonus: 3, text: (g) => fromD(g, 'P_TRANSFER') }),
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
  offer({ name: 'ReactOnly', when: [eq('ctx.type', 'reactOnly')], act: 'reactQ', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'REACT_Q', L.REACT_Q) }),
  offer({ name: 'Deleted', when: [is('ctx.deleted')], act: 'deletedQ', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'DEL_Q', L.DEL_Q) }),
  offer({ name: 'Group', when: [is('ctx.group')], act: 'group', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'GQ', GROUP_Q) }),
  offer({ name: 'Wrong', when: [is('ctx.wrong')], act: 'wrong', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'WQ', WRONG_Q) }),
  offer({ name: 'Legend', when: [is('ctx.legendary')], act: 'legendQ', tone: 'polite', bonus: 2, text: (g) => fromD(g, 'P_LEGEND') }),

  // срок обещания
  offer({
    name: 'When', when: [exists('ctx.when')], act: 'promiseCheck', tone: 'neutral', bonus: 1,
    text: (g, f) => fromD(g, 'P_WHEN', { t: String(f['ctx.when']), T: cap(String(f['ctx.when'])) }), arg: (_g, f) => String(f['ctx.when']),
  }),

  // родственник: спросить «при чём тут он» / поздравить / посочувствовать — одна кнопка на слот
  offer({
    name: 'WhyRel', slot: 'rel', specificity: 2, weight: 1, when: [exists('ctx.rel')], act: 'whyRel', tone: 'neutral',
    text: (g, f) => fromD(g, 'P_WHY_REL', { n: String(f['ctx.rel']) }),
  }),
  offer({ name: 'Congrats', slot: 'rel', specificity: 2, weight: 1, when: [exists('ctx.rel'), eq('ctx.sad', false)], act: 'congrats', tone: 'polite', text: (g) => fromD(g, 'P_CONGRATS') }),
  offer({ name: 'Condole', slot: 'rel', specificity: 2, weight: 1, when: [exists('ctx.rel'), is('ctx.sad')], act: 'condole', tone: 'polite', text: (g) => fromD(g, 'P_CONDOLE') }),

  offer({ name: 'Doubt', when: [is('ctx.constr')], act: 'defend', tone: 'neutral', bonus: 1, text: (g) => fromD(g, 'P_DOUBT') }),

  // напомнить о просроченном обещании из журнала
  offer({
    name: 'Prev', when: [gt('lateCount', 0)], act: 'prev', tone: 'neutral', bonus: 1, odds: 0.35,
    ...(() => {
      let idx = -1
      return {
        text: (g: Game) => {
          const late = g.S.promises.filter((p) => p.due != null && p.due < g.S.day && !p.asked)
          const p = late[g.rnd(late.length)]
          idx = g.S.promises.indexOf(p)
          return fromD(g, 'P_PREV', { t: p.t, date: fmtDayMonth(p.made) })
        },
        arg: () => idx,
      }
    })(),
  }),

  // сериалы: про текущий — всегда, про любой незаконченный — иногда
  offer({
    name: 'Arc', slot: 'arc', when: [exists('ctx.arc')], act: 'arc', tone: 'polite', bonus: 1,
    text: (g, f) => fromArr(g, 'F_' + f['ctx.arc'], ARCS[String(f['ctx.arc'])].follow), arg: (_g, f) => String(f['ctx.arc']),
  }),
  offer({
    name: 'ArcAny', slot: 'arc', when: [exists('arcUnfinished')], odds: 0.2, act: 'arc', tone: 'polite',
    text: (g, f) => fromArr(g, 'F_' + f.arcUnfinished, ARCS[String(f.arcUnfinished)].follow), arg: (_g, f) => String(f.arcUnfinished),
  }),

  offer({ name: 'Cow', when: [gt('moo', 0)], odds: 0.2, tone: 'cow', text: (g) => fromD(g, 'P_COW') }),
]
