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

// --- Mini App, игроки и напоминания (#1488) ---

/**
 * initData, подписанная токеном теста — так же, как её подписывает Telegram.
 * Понимает `authDate` в секундах: свежесть подписи проверяется на границе `/mini/*`.
 */
export async function signedInitData(
  userId: number,
  options: { authDate?: number; token?: string; user?: unknown } = {},
): Promise<string> {
  const encoder = new TextEncoder()
  const params = new URLSearchParams()
  params.set('auth_date', String(options.authDate ?? Math.floor(Date.now() / 1000)))
  params.set('query_id', 'AAH-test-query')
  params.set('user', JSON.stringify(options.user ?? { id: userId, first_name: 'Игрок' }))

  const checkString = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const secret = await crypto.subtle.sign('HMAC', key, encoder.encode(options.token ?? TEST_TOKEN))
  const signer = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', signer, encoder.encode(checkString))
  params.set('hash', [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''))
  return params.toString()
}

export interface MiniCallOptions {
  origin?: string
  envOverrides?: Partial<WorkerEnv>
}

/** Запрос Mini App к воркеру: JSON-тело и, как у браузера, Origin. */
export function miniCall(path: '/mini/hello' | '/mini/restore', body: unknown, options: MiniCallOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.origin !== undefined) headers.origin = options.origin
  return callWorker(path, { method: 'POST', headers, body: JSON.stringify(body) }, options.envOverrides)
}

export interface SeedPlayerOptions {
  userId: number
  lastSeen?: string
  finished?: boolean
  reminderCount?: number
  lastReminderAt?: string | null
  optOut?: boolean
}

/** Строка игрока в D1 — как её оставил бы заход в игру в прошлом. */
export async function seedPlayer(options: SeedPlayerOptions, db: D1Database = env.DB): Promise<void> {
  const seen = options.lastSeen ?? new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO players (telegram_user_id, chat_id, first_seen_at, last_seen_at, finished, reminder_count, last_reminder_at, opt_out)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      options.userId,
      options.userId,
      seen,
      seen,
      options.finished ? 1 : 0,
      options.reminderCount ?? 0,
      options.lastReminderAt ?? null,
      options.optOut ? 1 : 0,
    )
    .run()
}

export function playerRows(db: D1Database = env.DB): Promise<Array<Record<string, unknown>>> {
  return db.prepare('SELECT * FROM players ORDER BY telegram_user_id').all<Record<string, unknown>>().then((r) => r.results)
}

export function saveRows(db: D1Database = env.DB): Promise<Array<Record<string, unknown>>> {
  return db.prepare('SELECT * FROM saves').all<Record<string, unknown>>().then((r) => r.results)
}

/** Ручной запуск cron-обработчика — тот же путь, что у Cloudflare Scheduler. */
export async function runScheduled(envOverrides: Partial<WorkerEnv> = {}): Promise<void> {
  const handler = worker as unknown as {
    scheduled(controller: { scheduledTime: number; cron: string; noRetry(): void }, bindings: WorkerEnv): Promise<void>
  }
  await handler.scheduled({ scheduledTime: Date.now(), cron: '0 12 * * *', noRetry() {} }, { ...env, ...envOverrides } as WorkerEnv)
}

/** Текст и клавиатура последнего sendMessage. */
export function lastSend(calls: TelegramCall[]): { text: string; keyboard: unknown; chatId: unknown } {
  const call = [...calls].reverse().find((item) => item.method === 'sendMessage')
  return {
    text: String(call?.payload.text ?? ''),
    keyboard: call?.payload.reply_markup,
    chatId: call?.payload.chat_id,
  }
}

/** Одноразовый токен из ссылки, которую бот отдал на /load. */
export function transferTokenOf(calls: TelegramCall[]): string {
  const keyboard = lastSend(calls).keyboard as { inline_keyboard?: Array<Array<{ url?: string }>> } | undefined
  const url = keyboard?.inline_keyboard?.[0]?.[0]?.url ?? ''
  return new URL(url).searchParams.get('startapp') ?? ''
}

