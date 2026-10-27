import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:test'
import {
  CATALOG_AMOUNT,
  CATALOG_VERSION,
  callWorker,
  chargeOf,
  conflictRows,
  invoicePayload,
  mockTelegram,
  paymentRows,
  preCheckoutUpdate,
  seedCatalog,
  sendWebhook,
  successfulPaymentUpdate,
  telegramOk,
} from './helpers.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('журнал D1: одна строка на charge ID', () => {
  it('новый платёж записывается со всеми полями', async () => {
    mockTelegram()
    const update = successfulPaymentUpdate()
    expect((await sendWebhook(update)).status).toBe(200)

    const rows = await paymentRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      charge_id: chargeOf(update),
      telegram_user_id: 777001,
      invoice_payload: invoicePayload(),
      currency: 'XTR',
      amount: CATALOG_AMOUNT,
      product_id: 'hash-cup',
      catalog_version: CATALOG_VERSION,
      status: 'paid',
      note: null,
    })
    expect(typeof rows[0]?.received_at).toBe('string')
  })

  it('повторная доставка того же update не создаёт вторую строку', async () => {
    mockTelegram()
    const update = successfulPaymentUpdate()
    await sendWebhook(update)
    const second = await sendWebhook(update)
    expect(second.status).toBe(200)
    expect(await paymentRows()).toHaveLength(1)
  })

  it('тот же charge под новым update ID — тот же платёж', async () => {
    mockTelegram()
    const first = successfulPaymentUpdate()
    await sendWebhook(first)
    const again = successfulPaymentUpdate({ telegram_payment_charge_id: chargeOf(first) })
    await sendWebhook(again)
    expect(await paymentRows()).toHaveLength(1)
  })

  it('конкурентная доставка одного charge — одна строка', async () => {
    mockTelegram()
    const update = successfulPaymentUpdate()
    const [a, b] = await Promise.all([sendWebhook(update), sendWebhook(update)])
    expect([a.status, b.status]).toEqual([200, 200])
    expect(await paymentRows()).toHaveLength(1)
  })

  it('два разных charge одного игрока по одной ссылке — два платежа', async () => {
    mockTelegram()
    const first = successfulPaymentUpdate()
    const second = successfulPaymentUpdate()
    await sendWebhook(first)
    await sendWebhook(second)
    const rows = await paymentRows()
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.charge_id)).size).toBe(2)
  })

  it('тот же charge с другими реквизитами виден как конфликт, запись не перезаписана', async () => {
    mockTelegram()
    const first = successfulPaymentUpdate()
    await sendWebhook(first)
    const conflicting = successfulPaymentUpdate({
      telegram_payment_charge_id: chargeOf(first),
      total_amount: 30,
    })
    expect((await sendWebhook(conflicting)).status).toBe(200)

    const rows = await paymentRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.amount).toBe(CATALOG_AMOUNT)
    const conflicts = await conflictRows()
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ charge_id: chargeOf(first), kind: 'details-mismatch' })
  })
})

describe('журнал D1: деньги сохраняются и при несовпадении каталога', () => {
  it('оплата при отсутствующем каталоге сохраняется на разбор без привилегий', async () => {
    const { calls } = mockTelegram()
    await env.DB.prepare('DELETE FROM catalog').run()
    const response = await sendWebhook(successfulPaymentUpdate())
    expect(response.status).toBe(200)

    const rows = await paymentRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'paid', product_id: null, catalog_version: null })
    expect(String(rows[0]?.note)).toContain('review: catalog missing')
    expect(calls.map((call) => call.method)).not.toContain('sendMessage')
  })

  it('цена изменилась между pre-checkout и оплатой: деньги записаны, позиция на разборе', async () => {
    mockTelegram()
    await sendWebhook(preCheckoutUpdate())
    await seedCatalog(env.DB, { amount: 40, version: 2 })
    await sendWebhook(successfulPaymentUpdate())

    const rows = await paymentRows()
    expect(rows).toHaveLength(1)
    expect(String(rows[0]?.note)).toContain('review: amount mismatch')
    expect(rows[0]?.product_id).toBeNull()
  })

  it('чужая валюта в successful_payment сохраняется на разбор', async () => {
    mockTelegram()
    await sendWebhook(successfulPaymentUpdate({ currency: 'USD' }))
    const rows = await paymentRows()
    expect(String(rows[0]?.note)).toContain('review: currency mismatch')
  })
})

describe('журнал D1: сбой записи не подтверждается как успех', () => {
  it('ошибка D1 отдаёт 503, а после починки повтор доставки записывает платёж', async () => {
    mockTelegram()
    const update = successfulPaymentUpdate()
    await env.DB.prepare('ALTER TABLE payments RENAME TO payments_broken').run()
    let failed: Response
    try {
      failed = await sendWebhook(update)
    } finally {
      await env.DB.prepare('ALTER TABLE payments_broken RENAME TO payments').run()
    }
    expect(failed.status).toBe(503)
    expect(await paymentRows()).toHaveLength(0)

    expect((await sendWebhook(update)).status).toBe(200)
    expect(await paymentRows()).toHaveLength(1)
  })

  it('сбой отправки «спасибо» не теряет уже записанный платёж', async () => {
    mockTelegram((method) => {
      if (method === 'sendMessage') throw new TypeError('telegram down')
      return telegramOk(true)
    })
    const response = await sendWebhook(successfulPaymentUpdate())
    expect(response.status).toBe(200)
    expect(await paymentRows()).toHaveLength(1)
  })

  it('платёж переживает новый запрос: состояние живёт в D1, а не в памяти', async () => {
    mockTelegram()
    const update = successfulPaymentUpdate()
    await sendWebhook(update)

    // Новый экземпляр обработчика на том же хранилище: повторная доставка видит старую запись.
    await callWorker('/health')
    await sendWebhook(successfulPaymentUpdate({ telegram_payment_charge_id: chargeOf(update) }))
    const rows = await paymentRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.charge_id).toBe(chargeOf(update))
  })
})
