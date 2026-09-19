// Ход Алика в ответ на обычное сообщение игрока.
import type { Game } from '../../engine/game'
import { type Rule, eq, gte, is, exists, add } from '../../engine/rules'
import { RUDE_AGAIN, THREAT_AGAIN } from '../misc'
import { IDLE } from '../life'

type R = Rule<Game>

async function offended(game: Game, line?: string): Promise<void> {
  game.mood(-2)
  if (game.chance(0.3)) await game.sticker({ e: '🏠🔥', c: 'Всё горит' })
  await game.say([line ?? game.uniq(game.X.offended)])
  game.goOffline(Math.max(2, 3 + game.rnd(8) - Math.floor(game.S.mood / 3)))
}

// Событие PlayerMessage { tone } — как Алик реагирует на тон
export const toneRules: R[] = [
  { name: 'Tone_Default', event: 'PlayerMessage', when: [], respond: ({ game }) => game.turnRoll() },
  { name: 'Tone_Rude', event: 'PlayerMessage', when: [eq('tone', 'rude')], remember: [add('count.rude')], respond: ({ game }) => offended(game) },
  {
    // память: кричишь не в первый раз — Алик это помнит
    name: 'Tone_Rude_Again', event: 'PlayerMessage', when: [eq('tone', 'rude'), gte('count.rude', 2)],
    remember: [add('count.rude')],
    respond: async ({ game }) => { game.unlock('memory'); await offended(game, game.uniq(() => game.draw('RUDE_AGAIN', RUDE_AGAIN))) },
  },
  {
    name: 'Tone_Threat', event: 'PlayerMessage', when: [eq('tone', 'threat')], remember: [add('count.threat')],
    respond: async ({ game }) => { game.mood(-1); await game.say([game.uniq(game.X.threat)]); game.goOffline(1 + game.rnd(3)) },
  },
  {
    name: 'Tone_Threat_Again', event: 'PlayerMessage', when: [eq('tone', 'threat'), gte('count.threat', 2)], remember: [add('count.threat')],
    respond: async ({ game }) => {
      game.unlock('memory'); game.mood(-1)
      await game.say([game.uniq(() => game.draw('THREAT_AGAIN', THREAT_AGAIN))])
      game.goOffline(1 + game.rnd(3))
    },
  },
  { name: 'Tone_Cow', event: 'PlayerMessage', when: [eq('tone', 'cow')], respond: async ({ game }) => { await game.say([game.uniq(game.X.cow)]) } },
]

// Событие AlikIgnores — «прочитано в 3:14» и тишина (4%)
export const ignoreRules: R[] = [
  { name: 'Ignore_ReadOnly', event: 'AlikIgnores', when: [], odds: 0.04, respond: ({ game }) => game.readOnly() },
]

// Событие PeriodLine — реплика по реальному времени суток, не чаще раза в 12 ходов
export const periodRules: R[] = (['night', 'morning', 'lunch', 'friday', 'evening'] as const).map((p) => ({
  name: `Period_${p}`, event: 'PeriodLine', when: [eq('period', p), gte('sincePeriod', 12)], odds: 0.35,
  respond: ({ game }: { game: Game }) => game.periodLine(p),
}))

// Событие AlikTurn — взвешенный выбор, что Алик сделает. Специфичность у всех одна (0),
// условия лишь отсекают недоступное; веса повторяют вероятности оригинала.
const W: Record<string, number> = { scene: 13, arc: 15, group: 3, wrong: 3.5, sticker: 4, fwd: 4, job: 6, photo: 3, voice: 4, short: 6 }
const transferW = (f: Record<string, unknown>) => (2 + Number(f.mood ?? 5) * 0.6)
export const turnRules: R[] = [
  { name: 'Turn_Scene', event: 'AlikTurn', when: [gte('sent', 3)], specificity: 0, weight: W.scene, respond: ({ game }) => game.startScene() },
  { name: 'Turn_Arc', event: 'AlikTurn', when: [gte('sent', 2), is('arcAvailable')], specificity: 0, weight: W.arc, respond: async ({ game }) => { const id = game.nextArc(); if (id) await game.playArc(id) } },
  { name: 'Turn_Group', event: 'AlikTurn', when: [gte('sent', 8)], specificity: 0, weight: W.group, respond: ({ game }) => game.groupChat() },
  { name: 'Turn_Wrong', event: 'AlikTurn', when: [gte('sent', 5)], specificity: 0, weight: W.wrong, respond: ({ game }) => game.wrongChat() },
  { name: 'Turn_Sticker', event: 'AlikTurn', when: [], specificity: 0, weight: W.sticker, respond: ({ game }) => game.sticker() },
  { name: 'Turn_Forward', event: 'AlikTurn', when: [], specificity: 0, weight: W.fwd, respond: ({ game }) => game.forward() },
  { name: 'Turn_Transfer', event: 'AlikTurn', when: [], specificity: 0, weight: transferW, respond: ({ game }) => game.transfer() },
  { name: 'Turn_Job', event: 'AlikTurn', when: [], specificity: 0, weight: W.job, respond: ({ game }) => game.job() },
  { name: 'Turn_Photo', event: 'AlikTurn', when: [], specificity: 0, weight: W.photo, respond: ({ game }) => game.photo() },
  { name: 'Turn_Voice', event: 'AlikTurn', when: [], specificity: 0, weight: W.voice, respond: ({ game }) => game.voice() },
  { name: 'Turn_Short', event: 'AlikTurn', when: [], specificity: 0, weight: W.short, respond: ({ game }) => game.shortReply() },
  {
    // отмазка забирает всё, что осталось до 100 — как в оригинале, где недоступные ветки отдавали долю отмазке
    name: 'Turn_Excuse', event: 'AlikTurn', when: [], specificity: 0,
    weight: (f) => {
      const sent = Number(f.sent ?? 0)
      const active = (sent >= 3 ? W.scene : 0) + (sent >= 2 && f.arcAvailable ? W.arc : 0) + (sent >= 8 ? W.group : 0) + (sent >= 5 ? W.wrong : 0)
        + W.sticker + W.fwd + W.job + W.photo + W.voice + W.short + transferW(f)
      return Math.max(20, 100 - active)
    },
    respond: ({ game }) => game.excuseTurn(),
  },
]

// Событие AlikIdle — Алик пишет сам, если игрок молчит
const idleW = { notif: 15, text: 35, sticker: 12, fwd: 14, deleted: 10, voice: 8, period: 6 }
export const idleRules: R[] = [
  // посреди сцены (Алик «умирает», торгуется…) и пока он «пропал» — не перебиваем, только уведомления телефона
  { name: 'Idle_DuringScene', event: 'AlikIdle', when: [exists('scene')], respond: ({ game }) => game.randomNotif() },
  { name: 'Idle_Offline', event: 'AlikIdle', when: [is('offline')], respond: ({ game }) => game.randomNotif() },
  { name: 'Idle_Notif', event: 'AlikIdle', when: [], specificity: 0, weight: idleW.notif, respond: ({ game }) => game.randomNotif() },
  {
    name: 'Idle_Text', event: 'AlikIdle', when: [], specificity: 0, weight: idleW.text,
    respond: async ({ game }) => {
      await game.sleep(300)
      await game.say([game.addrLine('IDLE', IDLE)])
      game.unlock('idle')
      game.setCtx({ type: 'idle' })
    },
  },
  { name: 'Idle_Sticker', event: 'AlikIdle', when: [], specificity: 0, weight: idleW.sticker, respond: ({ game }) => game.sticker() },
  { name: 'Idle_Forward', event: 'AlikIdle', when: [], specificity: 0, weight: idleW.fwd, respond: ({ game }) => game.forward() },
  { name: 'Idle_Deleted', event: 'AlikIdle', when: [], specificity: 0, weight: idleW.deleted, respond: async ({ game }) => { game.setCtx(null); await game.deletedMsg() } },
  { name: 'Idle_Voice', event: 'AlikIdle', when: [], specificity: 0, weight: idleW.voice, respond: ({ game }) => game.voice() },
  { name: 'Idle_Period', event: 'AlikIdle', when: [], specificity: 0, weight: (f) => (f.period === 'day' ? 0 : idleW.period), respond: ({ game }) => game.periodLine(game.period()) },
]
