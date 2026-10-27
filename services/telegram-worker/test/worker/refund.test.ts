import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:test'
import {
  chargeOf,
  conflictRows,
  mockTelegram,
  paymentRows,
  refundedPaymentUpdate,
  sendWebhook,
  successfulPaymentUpdate,
} from './helpers.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('возврат: состояние пишется по уведомлению Telegram', () => {
  it('refunded_payment переводит платёж в refunded', async () => {
    const { calls } = mockTelegram()
    const update = successfulPaymentUpdate()
    await sendWebhook(update)
    const chargeId = chargeOf(update)
    calls.length = 0

    const response = await sendWebhook(refundedPaymentUpdate(chargeId))
    expect(response.status).toBe(200)

    const rows = await paymentRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('refunded')
    expect(typeof rows[0]?.refunded_at).toBe('string')
    expect(calls).toHaveLength(0)
  })

  it('повтор уведомления о возврате безопасен', async () => {
    mockTelegram()
    const update = successfulPaymentUpdate()
    await sendWebhook(update)
    const chargeId = chargeOf(update)
    await sendWebhook(refundedPaymentUpdate(chargeId))
    const response = await sendWebhook(refundedPaymentUpdate(chargeId))
    expect(response.status).toBe(200)
    expect(await paymentRows()).toHaveLength(1)
  })

  it('возврат по неизвестному charge виден в конфликтах и не роняет ответ', async () => {
    mockTelegram()
    const response = await sendWebhook(refundedPaymentUpdate('charge-unknown'))
    expect(response.status).toBe(200)
    const conflicts = await conflictRows()
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ charge_id: 'charge-unknown', kind: 'refund-unknown' })
    expect(await paymentRows()).toHaveLength(0)
  })

  it('уведомление без charge ID подтверждается без записи', async () => {
    mockTelegram()
    const update = refundedPaymentUpdate('')
    const response = await sendWebhook(update)
    expect(response.status).toBe(200)
    expect(await paymentRows()).toHaveLength(0)
  })

  it('сбой D1 при возврате: 503, чтобы Telegram повторил уведомление', async () => {
    mockTelegram()
    const update = successfulPaymentUpdate()
    await sendWebhook(update)
    const chargeId = chargeOf(update)

    await env.DB.prepare('ALTER TABLE payments RENAME TO payments_broken').run()
    let response: Response
    try {
      response = await sendWebhook(refundedPaymentUpdate(chargeId))
    } finally {
      await env.DB.prepare('ALTER TABLE payments_broken RENAME TO payments').run()
    }
    expect(response.status).toBe(503)

    expect((await sendWebhook(refundedPaymentUpdate(chargeId))).status).toBe(200)
    expect((await paymentRows())[0]?.status).toBe('refunded')
  })
})
