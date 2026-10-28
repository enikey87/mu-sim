import type { RuntimeConfig, WorkerEnv } from './env.ts'
import { noteReminderSent, reminderTargets } from './players.ts'
import { callTelegram } from './telegram.ts'

const DAY_MS = 24 * 60 * 60 * 1000

/** Не заходил дольше — пора напомнить (в задаче «2–3 дня»; cron раз в сутки даёт этот разброс сам). */
export const REMINDER_IDLE_MS = 2 * DAY_MS
/** Одно напоминание в двое суток на игрока. */
export const REMINDER_GAP_MS = 2 * DAY_MS
/** Три подряд без захода — и тишина до возврата: счётчик сбрасывает только заход в игру. */
export const REMINDER_LIMIT = 3

/** Кнопка «Не напоминать»: callback, а не ссылка — она живёт в самом сообщении и не уводит из Telegram. */
export const REMINDER_OPT_OUT = 'no_remind'

/** Тон отмазок Алика: он не признаёт, что пропал, — он «как раз собирался». */
export const REMINDER_TEXT =
  'Алик: Слушай, ты куда пропал? Я как раз собирался написать. Партия стоит, я всё ищу, где взять, — ' +
  'загляни, а? Обещаю, на этот раз почти без отмазок.'

export interface ReminderRun {
  sent: number
  failed: number
}

/**
 * Ежедневный проход cron. Выбор игроков — один SQL, ограничители — в схеме D1:
 * сбой отправки одному игроку не мешает остальным, а без подтверждённой отправки
 * счётчик не растёт (следующий cron попробует снова).
 */
export async function sendReminders(
  env: WorkerEnv,
  config: RuntimeConfig,
  nowIso: string,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<ReminderRun> {
  const now = Date.parse(nowIso)
  const targets = await reminderTargets(env.DB, {
    idleBeforeIso: new Date(now - REMINDER_IDLE_MS).toISOString(),
    gapBeforeIso: new Date(now - REMINDER_GAP_MS).toISOString(),
    limit: REMINDER_LIMIT,
  })

  let sent = 0
  let failed = 0
  for (const target of targets) {
    try {
      await callTelegram(
        config.botToken,
        'sendMessage',
        {
          chat_id: target.chatId,
          text: REMINDER_TEXT,
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Открыть', url: config.gameUrl }],
              [{ text: 'Не напоминать', callback_data: REMINDER_OPT_OUT }],
            ],
          },
        },
        { fetchImpl: deps.fetchImpl, apiBase: config.apiBase, timeoutMs: config.timeoutMs },
      )
    } catch {
      failed += 1
      continue
    }
    try {
      await noteReminderSent(env.DB, target.telegramUserId, nowIso)
      sent += 1
    } catch {
      // Напоминание ушло, счётчик не записался: следующий cron может прислать ещё одно.
      // Это ограничитель «не чаще раза в двое суток» на один цикл — честнее, чем терять факт отправки.
      failed += 1
    }
  }
  return { sent, failed }
}
