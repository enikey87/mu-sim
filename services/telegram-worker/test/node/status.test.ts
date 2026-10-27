import { describe, expect, it } from 'vitest'
import { renderStatusSummary, status } from '../../scripts/lib/status.ts'
import { ProjectError } from '../../scripts/lib/prepare.ts'
import { createHarness } from './harness.ts'

describe('status: диагностика без секретов', () => {
  it('собирает готовность, каталог, журнал и инвойс', async () => {
    const harness = createHarness()
    harness.d1.settings.set('invoice_link', 'https://t.me/$fake-invoice')
    harness.d1.payments.push(
      { charge_id: 'a', telegram_user_id: 1, status: 'paid', amount: 25, currency: 'XTR', received_at: '2026-10-27T08:00:00.000Z', note: null },
      { charge_id: 'b', telegram_user_id: 1, status: 'refunded', amount: 25, currency: 'XTR', received_at: '2026-10-27T09:00:00.000Z', note: null },
      { charge_id: 'c', telegram_user_id: 1, status: 'paid', amount: 25, currency: 'XTR', received_at: '2026-10-27T07:00:00.000Z', note: 'review: amount mismatch' },
    )
    harness.d1.conflicts = 2

    const result = await status(harness.ctx)
    expect(result.health).toBe('ok')
    expect(result.botUsername).toBe('alik_where_money_bot')
    expect(result.catalog).toEqual({ amount: 25, version: 1, currency: 'XTR' })
    expect(result.payments).toEqual({ paid: 2, refunded: 1, review: 1 })
    expect(result.conflicts).toBe(2)
    expect(result.invoiceUrl).toBe('https://t.me/$fake-invoice')
    expect(result.lastPaymentAt).toBe('2026-10-27T09:00:00.000Z')
  })

  it('деградация Worker видна в статусе', async () => {
    const harness = createHarness({ healthStatuses: [503] })
    const result = await status(harness.ctx)
    expect(result.health).toBe('degraded')
  })

  it('недоступный Worker не роняет отчёт', async () => {
    const harness = createHarness()
    const originalFetch = harness.ctx.fetchImpl
    harness.ctx.fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/health')) throw new TypeError('network down')
      return originalFetch(input, init)
    }) as typeof fetch
    const result = await status(harness.ctx)
    expect(result.health).toBe('unreachable')
  })

  it('summary не содержит секретов и персональных данных', async () => {
    const harness = createHarness()
    harness.d1.payments.push({
      charge_id: 'a',
      telegram_user_id: 424242,
      status: 'paid',
      amount: 25,
      currency: 'XTR',
      received_at: '2026-10-27T08:00:00.000Z',
      note: null,
    })
    const summary = renderStatusSummary(await status(harness.ctx))
    expect(summary).not.toContain('424242')
    expect(summary).not.toContain('cf-token-xyz')
    expect(summary).not.toContain('AAH-test-token')
    expect(summary).not.toContain('a".')
  })

  it('без базы D1 status не создаёт её и просит deploy', async () => {
    const harness = createHarness({ databases: [] })
    await expect(status(harness.ctx)).rejects.toBeInstanceOf(ProjectError)
    expect(harness.wranglerCalls).toHaveLength(0)
  })
})
