import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockTelegram, sendWebhook, telegramOk } from './helpers.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

type SendPayload = { chat_id?: number; text?: string }

function commandUpdate(text: string): Record<string, unknown> {
  return {
    update_id: Math.floor(Math.random() * 10_000) + 100,
    message: {
      message_id: 77,
      from: { id: 777001, is_bot: false, first_name: 'Игрок' },
      chat: { id: 777001, type: 'private' },
      text,
    },
  }
}

function sentText(calls: Array<{ method: string; payload: Record<string, unknown> }>): string {
  const call = calls.find((item) => item.method === 'sendMessage')
  return String((call?.payload as SendPayload | undefined)?.text ?? '')
}

describe('/start и /paysupport', () => {
  it('/start отдаёт ссылку на игру', async () => {
    const { calls } = mockTelegram()
    const response = await sendWebhook(commandUpdate('/start'))
    expect(response.status).toBe(200)
    expect(sentText(calls)).toContain('https://t.me/alik_where_money_bot/game')
    expect((calls[0]?.payload as SendPayload | undefined)?.chat_id).toBe(777001)
  })

  it('/start@бот тоже распознаётся', async () => {
    const { calls } = mockTelegram()
    await sendWebhook(commandUpdate('/start@alik_where_money_bot'))
    expect(sentText(calls)).toContain('t.me/alik_where_money_bot')
  })

  it('/paysupport отдаёт инструкцию поддержки без платёжных данных', async () => {
    const { calls } = mockTelegram()
    await sendWebhook(commandUpdate('/paysupport'))
    const text = sentText(calls)
    expect(text).toContain('https://github.com/enikey87')
    expect(text).toContain('Не присылайте')
  })

  it('неизвестный текст не получает ответа', async () => {
    const { calls } = mockTelegram()
    const response = await sendWebhook(commandUpdate('привет'))
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(0)
  })

  it('сбой отправки ответа не превращается в ошибку доставки', async () => {
    mockTelegram(() => {
      throw new TypeError('telegram down')
    })
    const response = await sendWebhook(commandUpdate('/start'))
    expect(response.status).toBe(200)
  })

  it('сообщение без chat не падает', async () => {
    const { calls } = mockTelegram()
    const update = commandUpdate('/start')
    delete (update.message as Record<string, unknown>).chat
    const response = await sendWebhook(update)
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(0)
  })

  it('обычное сообщение с вложением не вызывает Telegram', async () => {
    const { calls } = mockTelegram(() => telegramOk(true))
    const response = await sendWebhook({
      update_id: 555,
      message: { message_id: 5, photo: [{ file_id: 'x' }], chat: { id: 1 } },
    })
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(0)
  })
})
