import {
  apiBaseFrom,
  CURRENCY,
  GAME_URL_DEFAULT,
  maxBodyBytesFrom,
  nonEmpty,
  originsFrom,
  precheckoutBudgetMsFrom,
  saveMaxBytesFrom,
  SUPPORT_URL_DEFAULT,
  timeoutMsFrom,
  botUsernameFrom,
} from './config.ts'
import type { RuntimeConfig, WorkerEnv } from './env.ts'
import { loadActiveCatalog } from './db.ts'
import { corsPreflight, handleHello, handleRestore, MINI_HELLO_PATH, MINI_RESTORE_PATH } from './mini.ts'
import { sendReminders } from './reminders.ts'
import { handleUpdate, type UpdateOutcome } from './webhook.ts'
import { secretMatches } from './webhook-secret.ts'

const WEBHOOK_PATH = '/telegram/webhook'
const HEALTH_PATH = '/health'
const MINI_PATHS = new Set([MINI_HELLO_PATH, MINI_RESTORE_PATH])

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url)
    const config = runtimeConfig(env)

    if (MINI_PATHS.has(url.pathname)) {
      if (request.method === 'OPTIONS') return corsPreflight(request, config)
      if (request.method !== 'POST') return methodNotAllowed('POST')
      const now = new Date().toISOString()
      return url.pathname === MINI_HELLO_PATH
        ? handleHello(request, env, config, now)
        : handleRestore(request, env, config, now)
    }
    if (url.pathname === WEBHOOK_PATH) {
      if (request.method !== 'POST') return methodNotAllowed('POST')
      return handleWebhook(request, env, config)
    }
    if (url.pathname === HEALTH_PATH) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET, HEAD')
      return health(env, request.method === 'HEAD')
    }
    return json({ error: 'not-found' }, 404)
  },

  /**
   * Раз в сутки: «Алик скучает» молчунам. Ограничители (опт-аут, лимит подряд,
   * пауза между напоминаниями, конченная партия) — в SQL и схеме, см. src/reminders.ts.
   */
  async scheduled(_controller: ScheduledController, env: WorkerEnv): Promise<void> {
    await sendReminders(env, runtimeConfig(env), new Date().toISOString())
  },
} satisfies ExportedHandler<WorkerEnv>

function runtimeConfig(env: WorkerEnv): RuntimeConfig {
  const gameUrl = nonEmpty(env.GAME_URL) || GAME_URL_DEFAULT
  return {
    botToken: nonEmpty(env.BOT_TOKEN),
    webhookSecret: nonEmpty(env.WEBHOOK_SECRET),
    botUsername: botUsernameFrom(gameUrl, env.BOT_USERNAME),
    gameUrl,
    supportUrl: nonEmpty(env.SUPPORT_URL) || SUPPORT_URL_DEFAULT,
    clientOrigins: originsFrom(env.CLIENT_ORIGINS),
    apiBase: apiBaseFrom(env.TELEGRAM_API_BASE),
    timeoutMs: timeoutMsFrom(env.TELEGRAM_TIMEOUT_MS),
    precheckoutBudgetMs: precheckoutBudgetMsFrom(env.PRECHECKOUT_BUDGET_MS),
    maxBodyBytes: maxBodyBytesFrom(env.MAX_BODY_BYTES),
    saveMaxBytes: saveMaxBytesFrom(env.SAVE_MAX_BYTES),
  }
}

async function handleWebhook(request: Request, env: WorkerEnv, config: RuntimeConfig): Promise<Response> {
  // Заголовок проверяется до разбора тела и любых вызовов API/БД.
  // Пустой WEBHOOK_SECRET — всегда отказ, а не «пускать всех».
  const provided = request.headers.get('x-telegram-bot-api-secret-token')
  if (!secretMatches(provided, config.webhookSecret)) return json({ error: 'unauthorized' }, 401)

  const declared = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > config.maxBodyBytes) return json({ error: 'payload-too-large' }, 413)

  let body: string
  try {
    body = await request.text()
  } catch {
    return json({ error: 'unreadable-body' }, 400)
  }
  if (new TextEncoder().encode(body).length > config.maxBodyBytes) return json({ error: 'payload-too-large' }, 413)

  let update: unknown
  try {
    update = JSON.parse(body)
  } catch {
    return json({ error: 'invalid-json' }, 400)
  }
  if (typeof update !== 'object' || update === null || Array.isArray(update)) return json({ error: 'invalid-update' }, 400)
  if (!Number.isInteger((update as { update_id?: unknown }).update_id)) return json({ error: 'invalid-update' }, 400)

  let outcome: UpdateOutcome
  try {
    outcome = await handleUpdate(env, config, update as Record<string, unknown>)
  } catch {
    // Внутренняя ошибка до записи — просим Telegram повторить доставку, не теряя платёж.
    outcome = { status: 503, retryable: true }
  }
  return outcome.status === 200 ? json({ ok: true }, 200) : json({ error: 'retry-later' }, outcome.status)
}

/**
 * Готовность: конфигурация и схема D1. Внешний запрос к Telegram не тратится на каждый
 * health-check, а в ответ не попадают ни токены, ни платежи, ни сырые исключения.
 */
async function health(env: WorkerEnv, headOnly: boolean): Promise<Response> {
  const failed: string[] = []
  if (!nonEmpty(env.BOT_TOKEN)) failed.push('bot-token')
  if (!nonEmpty(env.WEBHOOK_SECRET)) failed.push('webhook-secret')

  try {
    if (!env.DB) {
      failed.push('d1')
    } else {
      const catalog = await loadActiveCatalog(env.DB)
      if (!catalog || catalog.currency !== CURRENCY || catalog.amount <= 0) failed.push('catalog')
      await env.DB.prepare('SELECT 1 AS ok FROM payments LIMIT 1').first()
      await env.DB.prepare('SELECT 1 AS ok FROM players LIMIT 1').first()
    }
  } catch {
    failed.push('d1')
  }

  const status = failed.length === 0 ? 200 : 503
  if (headOnly) return new Response(null, { status, headers: noStore() })
  return json(failed.length === 0 ? { status: 'ok' } : { status: 'degraded', failed }, status)
}

function methodNotAllowed(allow: string): Response {
  return json({ error: 'method-not-allowed' }, 405, { allow })
}

function noStore(): Headers {
  return new Headers({ 'cache-control': 'no-store' })
}

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  })
}
