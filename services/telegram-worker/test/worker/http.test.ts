import { afterEach, describe, expect, it, vi } from 'vitest'
import { callWorker, mockTelegram, paymentRows, preCheckoutUpdate, sendWebhook, successfulPaymentUpdate } from './helpers.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('граница HTTP: секрет webhook', () => {
  it('без заголовка: 401, ни одного вызова Telegram и ни одной записи', async () => {
    const { calls } = mockTelegram()
    const response = await sendWebhook(successfulPaymentUpdate(), { secret: null })
    expect(response.status).toBe(401)
    expect(calls).toHaveLength(0)
    expect(await paymentRows()).toHaveLength(0)
  })

  it('неверный заголовок: 401 до разбора тела', async () => {
    const { calls } = mockTelegram()
    const response = await sendWebhook(successfulPaymentUpdate(), {
      secret: 'not-our-secret',
      raw: '{ это не json',
    })
    expect(response.status).toBe(401)
    expect(calls).toHaveLength(0)
    expect(await paymentRows()).toHaveLength(0)
  })

  it('пустой настроенный секрет не означает «пускать всех»', async () => {
    mockTelegram()
    const response = await callWorker(
      '/telegram/webhook',
      {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': '', 'content-type': 'application/json' },
        body: JSON.stringify(preCheckoutUpdate()),
      },
      { WEBHOOK_SECRET: '' },
    )
    expect(response.status).toBe(401)
  })

  it('пустой заголовок при настроенном секрете: 401', async () => {
    mockTelegram()
    const response = await sendWebhook(preCheckoutUpdate(), { secret: '' })
    expect(response.status).toBe(401)
  })
})

describe('граница HTTP: маршруты и тело', () => {
  it('GET на webhook: 405 с Allow', async () => {
    mockTelegram()
    const response = await callWorker('/telegram/webhook', { method: 'GET' })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
  })

  it('неизвестный путь: 404', async () => {
    const { calls } = mockTelegram()
    const response = await callWorker('/pay/anything')
    expect(response.status).toBe(404)
    expect(calls).toHaveLength(0)
  })

  it('/health другим методом: 405', async () => {
    mockTelegram()
    const response = await callWorker('/health', { method: 'POST' })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, HEAD')
  })

  it('битый JSON: 400 без побочных эффектов', async () => {
    const { calls } = mockTelegram()
    const response = await sendWebhook(null, { raw: '{"update_id": ' })
    expect(response.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('JSON-массив вместо объекта: 400', async () => {
    mockTelegram()
    const response = await sendWebhook([1, 2, 3])
    expect(response.status).toBe(400)
  })

  it('update без update_id: 400', async () => {
    mockTelegram()
    const response = await sendWebhook({ message: { text: '/start' } })
    expect(response.status).toBe(400)
  })

  it('тело больше лимита: 413', async () => {
    const { calls } = mockTelegram()
    const response = await sendWebhook(null, { raw: JSON.stringify({ update_id: 1, padding: 'x'.repeat(20_000) }) })
    expect(response.status).toBe(413)
    expect(calls).toHaveLength(0)
  })

  it('валидный неподдерживаемый update: 200 без вызовов Telegram', async () => {
    const { calls } = mockTelegram()
    const response = await sendWebhook({ update_id: 4242, edited_message: { message_id: 1 } })
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(0)
  })

  it('неизвестное поле update не роняет обработку', async () => {
    const { calls } = mockTelegram()
    const response = await sendWebhook({ update_id: 4243, something_new: { nested: true } })
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(0)
  })
})
