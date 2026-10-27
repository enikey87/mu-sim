import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  callWorker,
  invoicePayload,
  mockTelegram,
  paymentRows,
  preCheckoutUpdate,
  sendWebhook,
  telegramFailure,
  telegramOk,
} from './helpers.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

type AnswerPayload = { pre_checkout_query_id?: string; ok?: boolean; error_message?: string }

function answerOf(calls: Array<{ method: string; payload: Record<string, unknown> }>): AnswerPayload | undefined {
  return calls.find((call) => call.method === 'answerPreCheckoutQuery')?.payload as AnswerPayload | undefined
}

describe('pre-checkout: каждая неверная ось отклоняется своей причиной', () => {
  it('верная оплата подтверждается ok=true', async () => {
    const { calls } = mockTelegram()
    const update = preCheckoutUpdate({}, 'pcq-ok')
    const response = await sendWebhook(update)
    expect(response.status).toBe(200)
    expect(answerOf(calls)).toEqual({ pre_checkout_query_id: 'pcq-ok', ok: true })
  })

  it('чужая валюта отклоняется', async () => {
    const { calls } = mockTelegram()
    await sendWebhook(preCheckoutUpdate({ currency: 'RUB' }))
    const answer = answerOf(calls)
    expect(answer?.ok).toBe(false)
    expect(answer?.error_message).toContain('звёзд')
  })

  it('сумма больше каталога отклоняется как устаревшая', async () => {
    const { calls } = mockTelegram()
    await sendWebhook(preCheckoutUpdate({ total_amount: 30 }))
    const answer = answerOf(calls)
    expect(answer?.ok).toBe(false)
    expect(answer?.error_message).toContain('устарел')
  })

  it('сумма меньше каталога тоже отклоняется', async () => {
    const { calls } = mockTelegram()
    await sendWebhook(preCheckoutUpdate({ total_amount: 1 }))
    expect(answerOf(calls)?.ok).toBe(false)
  })

  it('нецелая сумма отклоняется', async () => {
    const { calls } = mockTelegram()
    await sendWebhook(preCheckoutUpdate({ total_amount: 2.5 }))
    expect(answerOf(calls)?.ok).toBe(false)
  })

  it('старая версия payload отклоняется, даже когда сумма совпадает', async () => {
    const { calls } = mockTelegram()
    await sendWebhook(preCheckoutUpdate({ invoice_payload: invoicePayload(25, 0) }))
    expect(answerOf(calls)?.ok).toBe(false)
  })

  it('неизвестный payload отклоняется', async () => {
    const { calls } = mockTelegram()
    await sendWebhook(preCheckoutUpdate({ invoice_payload: 'v1:donation-cup:25' }))
    expect(answerOf(calls)?.ok).toBe(false)
  })

  it('без плательщика в запросе отвечает ok=false', async () => {
    const { calls } = mockTelegram()
    await sendWebhook(preCheckoutUpdate({ from: undefined }))
    expect(answerOf(calls)?.ok).toBe(false)
  })

  it('запрос без id подтверждается без ответа Telegram', async () => {
    const { calls } = mockTelegram()
    const update = preCheckoutUpdate()
    const query = update.pre_checkout_query as Record<string, unknown>
    query.id = ''
    const response = await sendWebhook(update)
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(0)
  })

  it('pre-checkout сам по себе не создаёт запись «оплачен»', async () => {
    mockTelegram()
    await sendWebhook(preCheckoutUpdate())
    expect(await paymentRows()).toHaveLength(0)
  })
})

describe('pre-checkout: отказы Bot API не превращаются в ложный успех', () => {
  it('HTTP 500 от Telegram: 503 retryable', async () => {
    mockTelegram(() => telegramFailure('Internal Server Error', 500))
    const response = await sendWebhook(preCheckoutUpdate())
    expect(response.status).toBe(503)
  })

  it('{ok:false} при HTTP 200: 503 retryable', async () => {
    mockTelegram(() => telegramFailure('pre_checkout_query is too old', 400))
    const response = await sendWebhook(preCheckoutUpdate())
    expect(response.status).toBe(503)
  })

  it('таймаут бюджета: 503 и ответ укладывается в бюджет', async () => {
    mockTelegram(
      (_method, _payload, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError')))
        }),
    )
    const started = Date.now()
    const update = preCheckoutUpdate()
    const response = await callWorker(
      '/telegram/webhook',
      {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'test-webhook-secret', 'content-type': 'application/json' },
        body: JSON.stringify(update),
      },
      { PRECHECKOUT_BUDGET_MS: '200' },
    )
    const elapsed = Date.now() - started
    expect(response.status).toBe(503)
    expect(elapsed).toBeLessThan(2000)
    expect(elapsed).toBeGreaterThanOrEqual(150)
    expect(await paymentRows()).toHaveLength(0)
  })

  it('сеть отказала: 503, заказ не подтверждён', async () => {
    mockTelegram(() => {
      throw new TypeError('network down')
    })
    const response = await sendWebhook(preCheckoutUpdate())
    expect(response.status).toBe(503)
  })

  it('успешный ответ Telegram: 200', async () => {
    mockTelegram((method) => (method === 'answerPreCheckoutQuery' ? telegramOk(true) : telegramOk(true)))
    const response = await sendWebhook(preCheckoutUpdate())
    expect(response.status).toBe(200)
  })
})
