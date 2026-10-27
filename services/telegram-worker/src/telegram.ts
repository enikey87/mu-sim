import { DEFAULT_API_BASE } from './config.ts'

/**
 * Ошибка вызова Bot API. Текст ошибки не содержит ни токена, ни URL с токеном:
 * такие сообщения уходят в логи Worker и в summary workflow.
 */
export class TelegramApiError extends Error {
  readonly method: string
  readonly retryable: boolean

  constructor(method: string, message: string, retryable: boolean) {
    super(`${method}: ${message}`)
    this.name = 'TelegramApiError'
    this.method = method
    this.retryable = retryable
  }
}

export interface TelegramCallOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  apiBase?: string
}

/** Telegram может ответить 200 и `{ok:false}` — обе формы отказа считаются ошибкой. */
interface ApiEnvelope {
  ok?: boolean
  result?: unknown
  description?: string
}

export async function callTelegram(
  botToken: string,
  method: string,
  payload: unknown,
  options: TelegramCallOptions = {},
): Promise<unknown> {
  if (!botToken) throw new TelegramApiError(method, 'бот не настроен', false)
  const doFetch = options.fetchImpl ?? globalThis.fetch
  const apiBase = (options.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '')
  const timeoutMs = options.timeoutMs ?? 5000

  let response: Response
  try {
    response = await doFetch(`${apiBase}/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw new TelegramApiError(method, `сеть или таймаут (${errorName(error)})`, true)
  }

  let envelope: ApiEnvelope
  try {
    envelope = (await response.json()) as ApiEnvelope
  } catch {
    throw new TelegramApiError(method, `ответ не JSON (HTTP ${response.status})`, response.status >= 500)
  }

  if (!response.ok || envelope.ok !== true) {
    const description = sanitize(String(envelope.description ?? `HTTP ${response.status}`), botToken)
    throw new TelegramApiError(method, description, response.status >= 500 || response.status === 429)
  }
  return envelope.result
}

function errorName(error: unknown): string {
  if (error instanceof Error) return error.name || 'Error'
  return 'unknown'
}

/** Убирает токен бота из любого текста, который может попасть в лог. */
export function sanitize(text: string, botToken: string): string {
  if (!botToken) return text
  return text.split(botToken).join('[redacted]')
}
