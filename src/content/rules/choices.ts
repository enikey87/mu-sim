// Событие BuildChoices — какие контекстные реплики предложить игроку.
// Берутся два самых приоритетных (специфичность + bonus); из одного слота — только одна.
import type { Game } from '../../engine/game'
import type { Choice, Tone } from '../../engine/state'
import { type Rule, type Facts, type Criterion, type Entry, eq, is, exists, missing, gt, gte, lte, isOpen, valueOf } from '../../engine/rules'
import { D, cap } from '../excuses'
import { talkPairs, talkId } from '../talk'
import { ARCS, WRONG_Q } from '../arcs'
import * as L from '../life'
import { GROUP_Q } from '../misc'
import { P_LIE } from '../lies'
import { TOPICS } from '../topics'
import { WORLD, SPEAKS, needs } from '../world'
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
const fromArr = (game: Game, key: string, arr: readonly Entry<string>[]) => game.playerLine(() => game.draw(key, arr))
const freshFromArr = (game: Game, key: string, arr: readonly Entry<string>[]) => game.freshPlayer(key, arr) ?? ''


const offer = (o: OfferSpec): R => ({
  name: `Opt_${o.name}`,
  event: 'BuildChoices',
  when: o.when,
  bonus: o.bonus,
  specificity: o.specificity,
  slot: o.slot ?? o.name,
  weight: o.weight,
  odds: o.odds,
  // пустой текст — нечего предложить (весь пул недавно показывали)
  offer: ({ game, facts }): Choice | null => { const text = o.text(game, facts); return text ? { text, tone: o.tone, act: o.act, arg: o.arg?.(game, facts) } : null },
})

export const choiceRules: R[] = [
  // поймать на лжи — важнее всего: момент уходит со следующей репликой
  offer({
    name: 'CatchLie', when: [exists('lie.old')], act: 'catchLie', tone: 'neutral', bonus: 6,
    text: (g) => { const l = g.lie()!; return g.playerLine(() => g.X.fill(g.draw('P_LIE', P_LIE), { old: l.old.say, new: l.new.say })) },
  }),
  // извиниться после грубости
  offer({ name: 'Sorry', when: [is('ctx.offended')], act: 'sorry', tone: 'polite', bonus: 5, text: (g) => fromD(g, 'P_SORRY') }),
  // лестница грубости: заблокирован — извиниться можно только через Бориса; ссора горячая — можно мычать
  // посредник — лучший из тех, кто есть: Борис, Карине, мама Алика (один вариант на слот); обращение к посреднику — без «Алик, …»
  offer({ name: 'Via_boris', slot: 'via', when: [is('blocked'), SPEAKS.boris], act: 'via', arg: () => 'boris', tone: 'polite', bonus: 7, text: (g) => g.draw('P_VIA_BORIS', ['Борис, передай Алику: прости меня', 'Попросить Бориса передать извинения', 'Борис, скажи ему «бее» от меня. Мирное']) }),
  offer({ name: 'Via_karine', slot: 'via', when: [is('blocked'), WORLD.karineHome], act: 'via', arg: () => 'karine', tone: 'polite', bonus: 6, text: (g) => g.draw('P_VIA_KARINE', ['Карине, передайте Алику: я извиняюсь', 'Попросить Карине передать извинения']) }),
  offer({ name: 'Via_mama', slot: 'via', when: [is('blocked')], act: 'via', arg: () => 'mama', tone: 'polite', bonus: 6, text: (g) => g.draw('P_VIA_MAMA', ['Попросить маму Алика передать извинения']) }),
  offer({ name: 'Moo', when: [is('ctx.offended'), gte('rude.heat', 1)], odds: 0.5, act: 'moo', tone: 'neutral', bonus: 4, text: (g) => fromArr(g, 'P_MOO', ['Мууу.', 'Мууууу 🐄', 'Му. (Это значит «мир».)']) }),

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
    text: (g) => { const m = [...g.S.msgs].reverse().find((x) => x.kind === 'text' && x.from === 'me'); const r = (m?.kind === 'text' && m.react) || '👍'; return fromArr(g, 'REACT_Q', L.REACT_Q).replace('👍', r) } }),
  offer({ name: 'Deleted', when: [is('ctx.deleted')], act: 'deletedQ', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'DEL_Q', L.DEL_Q) }),
  // процитировать можно только то, что в этом чате сказали
  offer({ name: 'Group', when: [is('ctx.group')], act: 'group', tone: 'neutral', bonus: 3, text: (g, f) => (f['ctx.quote'] && g.chance(0.4) ? `«${f['ctx.quote']}»?!` : fromArr(g, 'GQ', GROUP_Q)) }),
  offer({ name: 'Wrong', when: [is('ctx.wrong')], act: 'wrong', tone: 'neutral', bonus: 3, text: (g) => fromArr(g, 'WQ', WRONG_Q) }),
  offer({ name: 'Legend', when: [is('ctx.legendary')], act: 'legendQ', tone: 'polite', bonus: 2, text: (g) => fromD(g, 'P_LEGEND') }),

  // срок обещания: переспросить (Алик клянётся) или принять к сведению (Алик подтверждает)
  offer({
    name: 'When', slot: 'when', weight: 0.6, when: [exists('ctx.when')], act: 'promiseCheck', tone: 'neutral', bonus: 1,
    text: (g, f) => fromD(g, 'P_WHEN', { t: String(f['ctx.when']), T: cap(String(f['ctx.when'])) }), arg: (_g, f) => String(f['ctx.when']),
  }),
  offer({
    name: 'WhenOk', slot: 'when', weight: 0.4, when: [exists('ctx.when')], act: 'promiseOk', tone: 'polite', bonus: 1,
    text: (g, f) => fromD(g, 'P_WHEN_OK', { t: String(f['ctx.when']), T: cap(String(f['ctx.when'])) }),
  }),

  // родственник: спросить «при чём тут он» / поздравить / посочувствовать — одна кнопка на слот
  offer({
    name: 'WhyRel', slot: 'rel', specificity: 2, weight: 1, when: [exists('ctx.rel')], act: 'whyRel', tone: 'neutral',
    // родственник назван словами Алика («мой шофёр Гриша») — у игрока своя форма в словаре («ваш шофёр Гриша»)
    text: (g, f) => fromD(g, 'P_WHY_REL', { n: String(f['ctx.relYou']) }),
  }),
  offer({ name: 'Congrats', slot: 'rel', specificity: 2, weight: 1, when: [exists('ctx.rel'), is('ctx.festive')], act: 'congrats', tone: 'polite', text: (g) => fromD(g, 'P_CONGRATS') }),
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
    name: 'ArcDeath', slot: 'arc', when: [is('alik_dead'), is('deathCanAdvance')], act: 'arc', tone: 'polite', bonus: 2,
    text: (g) => freshFromArr(g, 'F_alik_death', ARCS.alik_death.follow), arg: () => 'alik_death',
  }),
  offer({
    // вопрос про сериал — только если он к чему-то приведёт (иначе «Как Нуне?» трижды подряд → «пока без новостей»)
    name: 'Arc', slot: 'arc', when: [missing('alik_dead'), exists('ctx.arc'), is('ctx.arcCanAdvance')], act: 'arc', tone: 'polite', bonus: 1,
    text: (g, f) => freshFromArr(g, 'F_' + f['ctx.arc'], ARCS[String(f['ctx.arc'])].follow), arg: (_g, f) => String(f['ctx.arc']),
  }),
  offer({
    name: 'ArcAny', slot: 'arc', when: [missing('alik_dead'), exists('arcUnfinished')], odds: 0.2, act: 'arc', tone: 'polite',
    text: (g, f) => freshFromArr(g, 'F_' + f.arcUnfinished, ARCS[String(f.arcUnfinished)].follow), arg: (_g, f) => String(f.arcUnfinished),
  }),

  // дело в суде открыто — игрок может его продолжить (угроза двигает линию суда)
  offer({
    name: 'Court', when: [gte('court', 1), lte('court', 6)], odds: 0.35, tone: 'threat',
    text: (g) => fromArr(g, 'P_COURT', ['Увидимся в суде, Алик.', 'Я подаю в суд. Серьёзно.', 'Мой адвокат с вами свяжется.', 'Жду повестку, Алик.', 'До встречи в зале суда.', 'Суд всё решит.', needs('arsen')('Передайте Арсену: я готов.'), 'Я иду до конца. До самого Страсбурга.', 'Готовьте документы, Алик.', 'Суд — не свадьба, там не отмажешься.', 'Я нашёл юриста. Настоящего, с дипломом.', 'Иск готов. Осталось распечатать.']),
  }),
  // «Это корова?» — только сразу после «Мууу», а не всю игру
  // ответить на то, что только что прозвучало: реплику легенды денег, вмешавшегося персонажа, воспоминание Алика
  ...(['legend', 'chorus', 'memory'] as const).map((kind) => {
    let arg = ''
    return offer({
      name: 'Talk_' + kind, when: [kind === 'memory' ? is('ctx.memory') : exists('ctx.' + kind)], act: 'talk', tone: 'neutral', bonus: 2, odds: 0.8,
      text: (g, f) => {
        const sub = kind === 'memory' ? '' : String(f['ctx.' + kind])
        const said = g.S.msgs.slice(-6).flatMap((m) => (m.kind === 'text' && m.from === 'alik' ? [m.text] : [])).join(' ')
        const facts = g.lineFacts()
        const i = talkPairs(kind, sub).findIndex((e, j) => !g.lines.has(talkId(kind, sub, j)) && isOpen(e, facts) && (valueOf(e)[2]?.(g.S, said) ?? true))
        if (i < 0) return ''
        arg = `${kind}|${sub}|${i}`
        return valueOf(talkPairs(kind, sub)[i])[0]
      },
      arg: () => arg,
    })
  }),
  offer({ name: 'Cow', when: [is('mooFresh')], odds: 0.8, bonus: 2, tone: 'cow', text: (g) => fromD(g, 'P_COW') }),
  // ответ по теме: игрок цепляется за то, что Алик только что сказал (после серии сериала — вопрос про сериал важнее)
  offer({
    name: 'Topic', when: [exists('ctx.topic'), missing('ctx.arc')], act: 'topic', tone: 'neutral', odds: 0.85,
    ...(() => {
      let arg = ''
      return {
        // вопрос и ответ идут парой: p[i] ↔ a[i]
        text: (g: Game, f: Facts) => {
          const t = TOPICS[String(f['ctx.topic'])]
          const fits = t.p.filter((_, i) => !t.need?.[i] || t.need[i].test(g.topicText))
          const q = g.freshPlayer('PT_' + f['ctx.topic'], fits)
          arg = q ? `${f['ctx.topic']}:${t.p.findIndex((e) => valueOf(e) === q)}` : ''
          return q ?? ''
        },
        arg: () => arg,
      }
    })(),
  }),
]
