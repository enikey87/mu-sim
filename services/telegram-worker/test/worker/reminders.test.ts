import { afterEach, describe, expect, it, vi } from 'vitest'
import { lastSend, mockTelegram, playerRows, runScheduled, seedPlayer, telegramOk } from './helpers.ts'
import { REMINDER_TEXT } from '../../src/reminders.ts'

const DAY = 86_400_000
const daysAgo = (days: number): string => new Date(Date.now() - days * DAY).toISOString()

afterEach(() => {
  vi.unstubAllGlobals()
})

function reminders(calls: Array<{ method: string; payload: Record<string, unknown> }>): Array<Record<string, unknown>> {
  return calls.filter((call) => call.method === 'sendMessage').map((call) => call.payload)
}

describe('«Алик скучает»: cron и ограничители', () => {
  it('молчун три дня получает одно напоминание с кнопками «Открыть» и «Не напоминать»', async () => {
    await seedPlayer({ userId: 777001, lastSeen: daysAgo(3) })
    const { calls } = mockTelegram()
    await runScheduled()

    const sent = reminders(calls)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.chat_id).toBe(777001)
    expect(sent[0]?.text).toBe(REMINDER_TEXT)
    const keyboard = sent[0]?.reply_markup as { inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>> }
    expect(keyboard.inline_keyboard[0]?.[0]).toMatchObject({ text: 'Открыть', url: 'https://t.me/alik_where_money_bot/game?mode=compact' })
    expect(keyboard.inline_keyboard[1]?.[0]).toMatchObject({ text: 'Не напоминать', callback_data: 'no_remind' })

    expect(await playerRows()).toMatchObject([
      { telegram_user_id: 777001, reminder_count: 1, finished: 0, opt_out: 0 },
    ])
    expect(String((await playerRows())[0]?.last_reminder_at ?? '')).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('заходил вчера — напоминания нет', async () => {
    await seedPlayer({ userId: 777001, lastSeen: daysAgo(1) })
    const { calls } = mockTelegram()
    await runScheduled()
    expect(reminders(calls)).toHaveLength(0)
  })

  it('второе напоминание раньше двух суток не уходит', async () => {
    await seedPlayer({
      userId: 777001,
      lastSeen: daysAgo(5),
      reminderCount: 1,
      lastReminderAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })
    const { calls } = mockTelegram()
    await runScheduled()
    expect(reminders(calls)).toHaveLength(0)
  })

  it('три подряд без захода — дальше тишина до возврата', async () => {
    await seedPlayer({ userId: 777001, lastSeen: daysAgo(9), reminderCount: 2, lastReminderAt: daysAgo(3) })
    await seedPlayer({ userId: 777002, lastSeen: daysAgo(9), reminderCount: 3, lastReminderAt: daysAgo(3) })
    const { calls } = mockTelegram()
    await runScheduled()
    expect(reminders(calls)).toHaveLength(1)
    expect(reminders(calls)[0]?.chat_id).toBe(777001)
    expect(await playerRows()).toMatchObject([
      { telegram_user_id: 777001, reminder_count: 3 },
      { telegram_user_id: 777002, reminder_count: 3 },
    ])
  })

  it('партия на экране концовки — напоминания нет', async () => {
    await seedPlayer({ userId: 777001, lastSeen: daysAgo(4), finished: true })
    const { calls } = mockTelegram()
    await runScheduled()
    expect(reminders(calls)).toHaveLength(0)
  })

  it('«не напоминать» — напоминания нет никогда', async () => {
    await seedPlayer({ userId: 777001, lastSeen: daysAgo(30), optOut: true })
    const { calls } = mockTelegram()
    await runScheduled()
    expect(reminders(calls)).toHaveLength(0)
  })

  it('сбой отправки одному игроку не останавливает остальных', async () => {
    await seedPlayer({ userId: 777001, lastSeen: daysAgo(3) })
    await seedPlayer({ userId: 777002, lastSeen: daysAgo(3) })
    mockTelegram((_method, payload) => {
      if (payload.chat_id === 777001) throw new TypeError('telegram down')
      return telegramOk(true)
    })
    await runScheduled()
    const rows = await playerRows()
    expect(rows).toMatchObject([
      { telegram_user_id: 777001, reminder_count: 0 },
      { telegram_user_id: 777002, reminder_count: 1 },
    ])
  })

  it('пустая база: cron ничего не отправляет и не падает', async () => {
    const { calls } = mockTelegram()
    await runScheduled()
    expect(calls).toHaveLength(0)
  })
})

describe('«Алик скучает»: что видит игрок', () => {
  it('текст напоминания — отмазка Алика, без обещаний денег', async () => {
    await seedPlayer({ userId: 777001, lastSeen: daysAgo(3) })
    const { calls } = mockTelegram()
    await runScheduled()
    const { text } = lastSend(calls)
    expect(text.startsWith('Алик:')).toBe(true)
    expect(text).toContain('загляни')
  })
})
