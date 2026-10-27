import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  callWorker,
  chargeOf,
  mockTelegram,
  paymentRows,
  preCheckoutUpdate,
  refundedPaymentUpdate,
  sendWebhook,
  successfulPaymentUpdate,
} from './helpers.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('сквозной локальный путь', () => {
  it('health → pre-checkout → оплата → повтор → возврат на настоящем entrypoint и D1', async () => {
    const { calls } = mockTelegram()

    const health = await callWorker('/health')
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ status: 'ok' })

    expect((await sendWebhook(preCheckoutUpdate())).status).toBe(200)
    expect(calls.some((call) => call.method === 'answerPreCheckoutQuery' && call.payload.ok === true)).toBe(true)

    const payment = successfulPaymentUpdate()
    expect((await sendWebhook(payment)).status).toBe(200)
    expect(calls.some((call) => call.method === 'sendMessage')).toBe(true)

    let rows = await paymentRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('paid')

    // Повторная доставка того же обновления — деньги не задваиваются.
    expect((await sendWebhook(payment)).status).toBe(200)
    rows = await paymentRows()
    expect(rows).toHaveLength(1)

    const chargeId = chargeOf(payment)
    expect((await sendWebhook(refundedPaymentUpdate(chargeId))).status).toBe(200)
    rows = await paymentRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('refunded')

    // Повтор возврата после рестарта не меняет журнал.
    expect((await sendWebhook(refundedPaymentUpdate(chargeId))).status).toBe(200)
    expect(await paymentRows()).toHaveLength(1)
  })
})
