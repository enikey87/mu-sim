// Событие PlayerSays { intent, arg } — ответ Алика на контекстную реплику игрока.
// Общее правило по intent + более специфичные для частных случаев (память, контекст).
import type { Game } from '../../engine/game'
import { type Rule, eq, ne, is, gte, add, valueOf } from '../../engine/rules'
import type { GameEvent, Offer } from './events'
import { AlikOffline, ThickJournal } from './criteria'
import { cooldown } from './rude'
import { TOPICS, TOPIC_FALLBACK, TOPIC_NAME, TOPIC_OBSESSED } from '../topics'
import { D, low, cap } from '../excuses'
import { GREET_A, WHEN_COND, SWING } from '../misc'
import { type TalkKind, talkPairs, talkId, TALK_REMEMBER } from '../talk'
import { ARCS, NO_NEWS_A, NO_NEWS_B, GROUP_SEEN_A, GROUP_SEEN_B, WRONG_A, WRONG_B } from '../arcs'
import * as L from '../life'
import { SORRY_AGAIN, CONDOLE_REVIVED, PREV_MANY, PROMISE_NEVER } from '../misc'
import { LIE_OPEN, LIE_EXPLAIN, LIE_GRANDPA, LIE_CUSTOMER, LIE_SENT, LIE_THIRD, LIE_NOCRED } from '../lies'
import { HEAT, asked, caughtCount, count, doneAsked, finaleOf, lie, nextTransfer, topic, topicMute } from '../memkeys'

type R = Rule<Game, GameEvent, Offer>
const says = (intent: string, rest: Partial<R> & Pick<R, 'respond'>, extra: R['when'] = []): R => ({
  name: `Says_${intent}${extra.length ? '_' + extra.map((c) => (c.key + (typeof c.value === 'string' ? '_' + c.value : c.value === true || c.value === undefined ? '' : c.value)).replace(/[^\wа-я]/gi, '')).join('_') : ''}`,
  event: 'PlayerSays',
  when: [eq('intent', intent), ...extra],
  ...rest,
})

async function sorry(game: Game, line: string): Promise<void> {
  cooldown(game, 1) // извинение остужает ссору
  game.mood(3)
  game.unlock('sorry')
  const wasOff = game.S.offlineDays
  game.S.offlineDays = Math.floor(game.S.offlineDays / 3)
  if (wasOff && game.S.offlineDays) game.nextDay(game.S.offlineDays)
  game.S.offlineDays = 0
  await game.say([line])
  game.setCtx(null)
}

const simple = (intent: string, line: (g: Game) => string, after?: (g: Game) => void | Promise<void>): R =>
  says(intent, { respond: async ({ game }) => { await game.say([line(game)]); game.setCtx(null); await after?.(game) } })

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

  says('sorry', { remember: [add(count.sorry)], respond: ({ game }) => sorry(game, game.uniq(game.X.sorry)) }),
  says('sorry', {
    remember: [add(count.sorry)],
    respond: ({ game }) => {
      game.unlock('memory')
      // свежая фраза «опять мир?», а кончились — обычное прощение из генератора
      return sorry(game, game.line('SORRY_AGAIN', SORRY_AGAIN, { fallback: game.X.sorry })!)
    },
  }, [gte(count.sorry, 2)]),
  // третий «мир» за 6 ходов — «качели»: Алик замечает, и ссору это уже не остужает
  says('sorry', {
    remember: [add(count.sorry)], bonus: 3,
    respond: async ({ game }) => {
      game.unlock('memory')
      game.mood(1) // мир всё-таки, хоть и качели
      await game.say([game.line('SWING', SWING, { fallback: game.X.sorry })!])
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
      const id = talkId(kind, sub, Number(i))
      game.lines.mark(id)
      game.rules.applyOps(TALK_REMEMBER[id] ?? [], {})
      await game.say([kind === 'chorus' ? { w: sub, t: pair[1] } : pair[1]])
    },
  }),

  simple('photo', (g) => g.uniq(g.X.photo)),
  simple('voice', (g) => g.uniq(g.X.cow)),
  simple('voiceText', (g) => g.pair('VOICE_A', D.VOICE_A, 'VOICE_B', D.VOICE_B)),
  says('transferQ', {
    respond: async ({ game }) => {
      const reply = game.uniq(game.X.transferQ)
      if (reply.nextTransfer) game.S.mem[nextTransfer] = reply.nextTransfer
      await game.say([reply.text])
      game.setCtx(null)
    },
  }),
  says('legendQ', { respond: async ({ game }) => { game.mood(1); await game.say([game.uniq(game.X.legendQ)]); game.setCtx(null) } }),
  says('shortQ', { respond: async ({ game, facts }) => { await game.say([game.uniq(() => game.X.shortQ(String(facts.arg ?? '')))]); game.setCtx(null) } }),
  simple('short2', (g) => g.pair('SHORT2_A', D.SHORT2_A, 'SHORT2_B', D.SHORT2_B)),

  says('promiseCheck', { respond: async ({ game, facts }) => { await game.say([game.uniq(() => game.X.promiseCheck(String(facts.arg ?? '')))]); game.setCtx(null) } }),
  says('promiseOk', { respond: async ({ game }) => { await game.say([game.uniq(() => game.draw('PROMISE_OK', D.PROMISE_OK))]); game.setCtx(null) } }),
  // срок «когда-нибудь» — переспрашивать бессмысленно, и Алик это честно признаёт
  says('promiseCheck', {
    respond: async ({ game, facts }) => {
      // общие «философские» ответы — по разу; дальше — про само условие, с его текстом (не повторяется)
      const t = String(facts['ctx.when'] ?? '')
      const cond = () => game.draw('WHEN_COND', WHEN_COND).replace('{t}', t).replace('{T}', cap(t))
      await game.say([game.line('PROMISE_NEVER', PROMISE_NEVER, { fallback: cond })!])
      game.setCtx(null)
    },
  }, [is('ctx.whenNever')]),

  says('condole', { respond: async ({ game }) => { game.mood(1); await game.say([game.pair('CONDOLE_A', D.CONDOLE_A, 'CONDOLE_B', D.CONDOLE_B)]); game.setCtx(null) } }),
  // соболезнуешь, а покойник уже встал и говорит тост
  says('condole', { respond: async ({ game }) => { await game.say([game.uniq(() => game.draw('CONDOLE_REVIVED', CONDOLE_REVIVED))]); game.setCtx(null) } }, [is('ctx.revived')]),

  says('congrats', {
    respond: async ({ game }) => {
      const rel = game.ctx?.rel
      game.mood(2)
      if (rel) await game.say([game.uniq(() => game.X.congrats(rel))])
      if (game.chance(0.25 + game.S.mood * 0.03)) { await game.transfer(); return }
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

  says('prev', {
    respond: async ({ game, facts }) => {
      const i = Number(facts.arg)
      if (game.S.promises[i]) game.S.promises[i].asked = true
      const r = game.uniq(game.X.prev)
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
      if (game.S.promises[i]) game.S.promises[i].asked = true
      game.unlock('memory')
      await game.promiseLine(game.uniq(() => game.draw('PREV_MANY', PREV_MANY)))
    },
  }, [ThickJournal]),

  says('arc', {
    respond: async ({ game, facts }) => {
      const id = String(facts.arg ?? '')
      game.S.mem[asked(id)] = Number(game.S.mem[asked(id)] ?? 0) + 1 // для финалов: «спрашивал про Бориса 3+ раз»
      const st = game.S.arcs[id]
      // на вопрос — следующая серия; второй вопрос подряд в тот же день — «пока без новостей» (не проглатывать сериал)
      if (st && ARCS[id] && game.arcCanAdvance(id, true)) { await game.playArc(id); game.S.arcs[id].byAsk = true; return }
      // «Передавайте привет Борису» — не вопрос: «пока без новостей» на него звучит невпопад
      await game.say([facts.greet ? game.uniq(() => game.draw('GREET_A', GREET_A)) : game.pair('NN_A', NO_NEWS_A, 'NN_B', NO_NEWS_B)])
      game.setCtx(null)
    },
  }),
  // сериал закончился — у каждого свой финальный ответ вместо общего «без новостей»
  says('arc', {
    respond: async ({ game, facts }) => {
      const id = String(facts.arg ?? '')
      game.S.mem[doneAsked(id)] = game.S.day
      const lines = game.arcDoneLines(id) ?? NO_NEWS_A
      await game.say([game.uniq(() => game.draw(`DONE_${id}_${game.S.mem[finaleOf(id)] ?? ''}`, lines))])
      game.setCtx(null)
    },
  }, [is('argArcDone')]),

  // ответ по теме (бетон, «Нива», свадьба…): свой пул у каждой темы, исчерпан — общий
  // ответ по теме: вопрос и ответ парой (p[i] ↔ a[i]); ответ уже был — общий
  says('topic', {
    respond: async ({ game, facts }) => {
      const [k, i] = String(facts.arg ?? '').split(':')
      const mem = game.S.mem
      const n = (mem[topic(k)] = Number(mem[topic(k)] ?? 0) + 1)
      mem.topicRun = mem.topicLast === k ? Number(mem.topicRun ?? 0) + 1 : 1
      mem.topicLast = k
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
        mem[topic(k)] = 0
        mem[topicMute(k)] = game.S.day + 20
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
  says('catchLie', { remember: [add(caughtCount)], respond: ({ game }) => game.caught(game.uniq(() => game.draw('LIE_GRANDPA', LIE_GRANDPA))) }, [eq(lie.kind, 'grandpa')]),
  says('catchLie', { remember: [add(caughtCount)], respond: ({ game }) => game.caught(game.uniq(() => game.draw('LIE_CUSTOMER', LIE_CUSTOMER))) }, [eq(lie.kind, 'customer')]),
  says('catchLie', { remember: [add(caughtCount)], respond: ({ game }) => game.caught(game.uniq(() => game.draw('LIE_SENT', LIE_SENT))) }, [eq(lie.kind, 'sent')]),
  // третий раз пойман — признаётся (по-своему); дальше — Алику уже никто не верит
  { ...says('catchLie', { remember: [add(caughtCount)], respond: ({ game }) => game.caught(game.uniq(() => game.draw('LIE_THIRD', LIE_THIRD))) }, [gte(caughtCount, 2)]), bonus: 1 },
  { ...says('catchLie', { remember: [add(caughtCount)], respond: ({ game }) => game.caught(game.uniq(() => game.draw('LIE_NOCRED', LIE_NOCRED))) }, [gte(caughtCount, 3)]), bonus: 2 },
]
