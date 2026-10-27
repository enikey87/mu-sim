/**
 * Секрет webhook выводится из токена бота, а не хранится отдельной случайной строкой:
 * установщик и Worker считают одно и то же значение, поэтому повторный deploy не может
 * рассинхронизировать `setWebhook` и проверку заголовка.
 *
 * Контекст включает id бота: тот же токен другого бота даёт другой секрет. Сам токен,
 * его часть и публичный идентификатор секретом не являются и в URL/логах не появляются.
 */
const CONTEXT = 'mu-sim:telegram-webhook'
const encoder = new TextEncoder()

export function botIdFromToken(botToken: string): string {
  const id = botToken.split(':')[0] ?? ''
  if (!/^[0-9]{1,20}$/.test(id)) throw new Error('BOT_TOKEN не похож на токен бота: нет числового id')
  return id
}

export async function deriveWebhookSecret(botToken: string): Promise<string> {
  const botId = botIdFromToken(botToken)
  const key = await crypto.subtle.importKey('raw', encoder.encode(botToken), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${CONTEXT}:${botId}`)))
  return base64url(signature)
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Сравнение заголовка с секретом без раннего выхода. Пустой ожидаемый секрет никогда
 * не означает «пускать всех»: вызывающая сторона обязана трактовать его как отказ.
 */
export function secretMatches(provided: string | null, expected: string): boolean {
  if (!expected || provided === null) return false
  const length = Math.max(provided.length, expected.length)
  let diff = provided.length === expected.length ? 0 : 1
  for (let i = 0; i < length; i += 1) {
    diff |= (provided.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0)
  }
  return diff === 0
}
