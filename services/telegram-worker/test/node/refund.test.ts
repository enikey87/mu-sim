import { describe, expect, it } from 'vitest'
import { RefundError, refund } from '../../scripts/lib/refund.ts'
import { createHarness, type Harness } from './harness.ts'

const CHARGE = 'charge-abc_123'

function withPayment(harness: Harness, overrides: Record<string, unknown> = {}): void {
  harness.d1.payments.push({
    charge_id: CHARGE,
    telegram_user_id: 777001,
    status: 'paid',
    amount: 25,
    currency: 'XTR',
    received_at: '2026-10-27T09:00:00.000Z',
    note: null,
    ...overrides,
  })
}

async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error('ожидалась ошибка, но операция завершилась успешно')
}

function refundHarness(extraEnv: Record<string, string> = {}): Harness {
  return createHarness({ env: { CHARGE_ID: CHARGE, REFUND_CONFIRM: CHARGE, ...extraEnv } })
}

describe('refund: возврат по журналу, а не по внешнему запросу', () => {
  it('успешный возврат берёт user id из записи D1 и пишет состояние', async () => {
    const harness = refundHarness()
    withPayment(harness)

    const result = await refund(harness.ctx)
    expect(result.status).toBe('refunded')
    expect(result.amount).toBe(25)

    const call = harness.telegram.find((item) => item.method === 'refundStarPayment')
    expect(call?.payload).toEqual({ user_id: 777001, telegram_payment_charge_id: CHARGE })
    expect(harness.d1.payments[0]?.status).toBe('refunded')
    expect(typeof harness.d1.payments[0]?.refunded_at).toBe('string')
  })

  it('уже возвращённый платёж не возвращается второй раз', async () => {
    const harness = refundHarness()
    withPayment(harness, { status: 'refunded', refunded_at: '2026-10-27T09:30:00.000Z' })

    const result = await refund(harness.ctx)
    expect(result.status).toBe('already')
    expect(harness.telegram.some((call) => call.method === 'refundStarPayment')).toBe(false)
  })

  it('неизвестный charge: ошибка до вызова Telegram', async () => {
    const harness = refundHarness()
    const error = await failure(refund(harness.ctx))
    expect(error).toBeInstanceOf(RefundError)
    expect((error as RefundError).step).toBe('journal')
    expect(harness.telegram).toHaveLength(0)
  })

  it('без совпадающего подтверждения возврат не запускается', async () => {
    const harness = refundHarness({ REFUND_CONFIRM: 'что-то другое' })
    withPayment(harness)
    const error = await failure(refund(harness.ctx))
    expect((error as RefundError).step).toBe('charge')
    expect(harness.telegram).toHaveLength(0)
  })

  it('некорректный charge id отбраковывается до сети', async () => {
    const harness = refundHarness({ CHARGE_ID: "1' OR 1=1 --", REFUND_CONFIRM: "1' OR 1=1 --" })
    const error = await failure(refund(harness.ctx))
    expect((error as RefundError).step).toBe('charge')
    expect(harness.telegram).toHaveLength(0)
  })

  it('отказ Telegram: ошибка возврата, состояние не переписывается', async () => {
    const harness = refundHarness()
    withPayment(harness)
    const originalFetch = harness.ctx.fetchImpl
    harness.ctx.fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith('https://api.telegram.org/')) {
        return new Response(JSON.stringify({ ok: false, description: 'PAYMENT_ALREADY_REFUNDED' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })
      }
      return originalFetch(input, init)
    }) as typeof fetch

    const error = await failure(refund(harness.ctx))
    expect((error as RefundError).step).toBe('refundStarPayment')
    expect(harness.d1.payments[0]?.status).toBe('paid')
  })

  it('сбой записи после успешного возврата виден и требует ручной сверки', async () => {
    const harness = refundHarness()
    withPayment(harness)
    const originalQuery = harness.d1.query.bind(harness.d1)
    harness.d1.query = (sql: string) => {
      if (sql.includes('UPDATE payments SET status')) throw new Error('D1 write failed')
      return originalQuery(sql)
    }

    const error = await failure(refund(harness.ctx))
    expect((error as RefundError).step).toBe('journal')
    expect(error.message).toContain('вручную')
    expect(error.message).toContain(CHARGE)
    expect(harness.telegram.some((call) => call.method === 'refundStarPayment')).toBe(true)
  })

  it('валюта не XTR: возврат Stars не запускается', async () => {
    const harness = refundHarness()
    withPayment(harness, { currency: 'USD' })
    const error = await failure(refund(harness.ctx))
    expect((error as RefundError).step).toBe('journal')
    expect(harness.telegram).toHaveLength(0)
  })
})
