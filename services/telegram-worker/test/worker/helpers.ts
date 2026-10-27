import { env, SELF, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { vi } from 'vitest'
import worker from '../../src/index.ts'
import { CURRENCY, PRODUCT_DESCRIPTION, PRODUCT_ID, PRODUCT_TITLE } from '../../src/config.ts'
import type { WorkerEnv } from '../../src/env.ts'

export const TEST_SECRET = 'test-webhook-secret'
export const TEST_TOKEN = '123456789:AAH-test-token'
export const CATALOG_AMOUNT = 25
export const CATALOG_VERSION = 1

export interface SeedCatalogOptions {
  amount?: number
  version?: number
  active?: boolean
}

/** Каталог в D1 — то, что установщик пишет до выкладки Worker'а. */
export async function seedCatalog(db: D1Database = env.DB, options: SeedCatalogOptions = {}): Promise<void> {
  await db
    .prepare(
      `INSERT INTO catalog (product_id, version, title, description, currency, amount, active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(product_id) DO UPDATE SET
         version = excluded.version,
         title = excluded.title,
         description = excluded.description,
         currency = excluded.currency,
         amount = excluded.amount,
         active = excluded.active,
         updated_at = excluded.updated_at`,
    )
    .bind(
      PRODUCT_ID,
      options.version ?? CATALOG_VERSION,
      PRODUCT_TITLE,
      PRODUCT_DESCRIPTION,
      CURRENCY,
      options.amount ?? CATALOG_AMOUNT,
      options.active === false ? 0 : 1,
      new Date().toISOString(),
    )
    .run()
}

export interface TelegramCall {
  method: string
  payload: Record<string, unknown>
  botId: string | null
}

export type TelegramResponder = (
  method: string,
  payload: Record<string, unknown>,
  init?: RequestInit,
) => Response | Promise<Response>

/**
 * Подмена Bot API на HTTP-границе: тест перехватывает `globalThis.fetch` Worker'а,
 * поэтому проверяются настоящие вызовы (URL, тело), а не внутренние функции.
 */
export function mockTelegram(responder?: TelegramResponder): { calls: TelegramCall[] } {
  const calls: TelegramCall[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
    const parts = url.pathname.split('/').filter(Boolean)
    const method = parts[parts.length - 1] ?? ''
    const botId = parts.length > 1 && parts[0] === 'bot' ? parts[1] : null
    const payload = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {}
    calls.push({ method, payload, botId })
    if (responder) return responder(method, payload, init)
    return telegramOk(true)
  })
  return { calls }
}

export function telegramOk(result: unknown): Response {
  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export function telegramFailure(description = 'Bad Request', status = 400): Response {
  return new Response(JSON.stringify({ ok: false, description }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Вызов настоящего entrypoint с подменёнными привязками (для тестов конфигурации). */
export async function callWorker(
  path: string,
  init: RequestInit = {},
  envOverrides: Partial<WorkerEnv> = {},
): Promise<Response> {
  const context = createExecutionContext()
  const request = new Request(`https://worker.test${path}`, init)
  const handler = worker as {
    fetch(request: Request, bindings: WorkerEnv, executionContext: ExecutionContext): Promise<Response>
  }
  const response = await handler.fetch(request, { ...env, ...envOverrides } as WorkerEnv, context)
  await waitOnExecutionContext(context)
  return response
}

export interface WebhookOptions {
  secret?: string | null
  method?: string
  raw?: string
  headers?: Record<string, string>
}

export function sendWebhook(body: unknown, options: WebhookOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...options.headers }
  const secret = options.secret === undefined ? TEST_SECRET : options.secret
  if (secret !== null) headers['x-telegram-bot-api-secret-token'] = secret
  return SELF.fetch('https://worker.test/telegram/webhook', {
    method: options.method ?? 'POST',
    headers,
    body: options.raw ?? JSON.stringify(body),
  })
}

let counter = 1000

export function nextId(): number {
  counter += 1
  return counter
}

export function invoicePayload(amount = CATALOG_AMOUNT, version = CATALOG_VERSION): string {
  return `v${version}:${PRODUCT_ID}:${amount}`
}

export function preCheckoutUpdate(overrides: Record<string, unknown> = {}, queryId = `pcq-${nextId()}`): Record<string, unknown> {
  return {
    update_id: nextId(),
    pre_checkout_query: {
      id: queryId,
      from: { id: 777001, is_bot: false, first_name: 'Игрок' },
      currency: CURRENCY,
      total_amount: CATALOG_AMOUNT,
      invoice_payload: invoicePayload(),
      ...overrides,
    },
  }
}

export function successfulPaymentUpdate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    update_id: nextId(),
    message: {
      message_id: nextId(),
      from: { id: 777001, is_bot: false, first_name: 'Игрок' },
      chat: { id: 777001, type: 'private' },
      successful_payment: {
        currency: CURRENCY,
        total_amount: CATALOG_AMOUNT,
        invoice_payload: invoicePayload(),
        telegram_payment_charge_id: `charge-${nextId()}`,
        provider_payment_charge_id: `provider-${nextId()}`,
        ...overrides,
      },
    },
  }
}

export function refundedPaymentUpdate(chargeId: string): Record<string, unknown> {
  return {
    update_id: nextId(),
    message: {
      message_id: nextId(),
      from: { id: 777001, is_bot: false, first_name: 'Игрок' },
      chat: { id: 777001, type: 'private' },
      refunded_payment: {
        currency: CURRENCY,
        total_amount: CATALOG_AMOUNT,
        invoice_payload: invoicePayload(),
        telegram_payment_charge_id: chargeId,
        provider_payment_charge_id: 'provider-refund',
      },
    },
  }
}

export function paymentRows(db: D1Database = env.DB): Promise<Array<Record<string, unknown>>> {
  return db.prepare('SELECT * FROM payments ORDER BY received_at').all<Record<string, unknown>>().then((result) => result.results)
}

export function conflictRows(db: D1Database = env.DB): Promise<Array<Record<string, unknown>>> {
  return db
    .prepare('SELECT * FROM payment_conflicts ORDER BY id')
    .all<Record<string, unknown>>()
    .then((result) => result.results)
}

/** Charge ID последнего успешного платежа в update'е — для сценариев возврата. */
export function chargeOf(update: Record<string, unknown>): string {
  const message = update.message as { successful_payment?: { telegram_payment_charge_id?: string } }
  return message.successful_payment?.telegram_payment_charge_id ?? ''
}
