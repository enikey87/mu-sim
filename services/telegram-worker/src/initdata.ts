/**
 * Подпись Mini App: `initData` приходит из `Telegram.WebApp.initData` и подписана
 * токеном бота. Воркер верит только подписи — `chat_id`, user id и `auth_date`
 * берутся из неё, а не из тела запроса.
 *
 * Алгоритм Telegram: `secret = HMAC_SHA256("WebAppData", bot_token)`,
 * `hash = HMAC_SHA256(secret, data_check_string)`, где строки — отсортированные
 * по имени пары `key=value` (кроме самой `hash`), склеенные `\n`.
 */

const encoder = new TextEncoder()

/** Предел длины initData: строка приходит из браузера, а не из Telegram, и не должна съесть память. */
const MAX_INIT_DATA_CHARS = 4096

/** Будущее время подписи: часы клиента и воркера расходятся, но не на минуты. */
const FUTURE_SKEW_MS = 5 * 60 * 1000

export type InitDataVerdict =
  | { ok: true; userId: number; authDate: number }
  | { ok: false; reason: 'missing' | 'malformed' | 'signature' | 'stale' | 'user' }

/**
 * `maxAgeMs` выбирается вызывающим: заход в игру и перенос партии — разные окна.
 * Пустой токен бота никогда не подтверждает подпись.
 */
export async function verifyInitData(
  raw: unknown,
  botToken: string,
  nowMs: number,
  maxAgeMs: number,
): Promise<InitDataVerdict> {
  if (typeof raw !== 'string') return { ok: false, reason: 'missing' }
  const initData = raw.trim()
  if (!initData) return { ok: false, reason: 'missing' }
  if (initData.length > MAX_INIT_DATA_CHARS) return { ok: false, reason: 'malformed' }
  if (!botToken) return { ok: false, reason: 'signature' }

  let params: URLSearchParams
  try {
    params = new URLSearchParams(initData)
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  const hash = params.get('hash')
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, reason: 'malformed' }

  // Дубль поля подписан не так, как прочитан: `URLSearchParams.get` вернёт одно
  // значение, а Telegram подписывал оба. Такую строку не принимаем вовсе.
  const pairs: Array<[string, string]> = []
  for (const [key, value] of params) {
    if (key === 'hash') continue
    if (pairs.some(([seen]) => seen === key)) return { ok: false, reason: 'malformed' }
    pairs.push([key, value])
  }

  const checkString = pairs
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secret = await hmac(encoder.encode('WebAppData'), botToken)
  const computed = toHex(await hmac(secret, checkString))
  if (!hexEquals(computed, hash.toLowerCase())) return { ok: false, reason: 'signature' }

  const authDate = Number(params.get('auth_date'))
  if (!Number.isInteger(authDate) || authDate <= 0) return { ok: false, reason: 'malformed' }
  const authMs = authDate * 1000
  if (nowMs - authMs > maxAgeMs) return { ok: false, reason: 'stale' }
  if (authMs - nowMs > FUTURE_SKEW_MS) return { ok: false, reason: 'stale' }

  const userId = userIdFrom(params.get('user'))
  if (userId === null) return { ok: false, reason: 'user' }
  return { ok: true, userId, authDate }
}

/** `user` — JSON-строка внутри initData; id обязан быть положительным целым. */
export function userIdFrom(raw: string | null): number | null {
  if (!raw) return null
  try {
    const user = JSON.parse(raw) as { id?: unknown }
    const id = user?.id
    return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

/** Токен переноса: 32 случайных байта, base64url — Telegram пускает такой `startapp` без правок. */
export function newTransferToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

/** В базе лежит только хеш: одноразовая ссылка не читается из дампа D1. */
export async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token))
  return toHex(digest)
}

async function hmac(key: BufferSource, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Сравнение подписи без раннего выхода: время ответа не выдаёт совпавший префикс. */
function hexEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
