import { INIT_DATA_TTL_MS } from './config.ts'
import type { RuntimeConfig, WorkerEnv } from './env.ts'
import { tokenHash, verifyInitData } from './initdata.ts'
import {
  consumeTransferToken,
  loadSnapshot,
  rememberVisit,
  saveSnapshot,
} from './players.ts'

export const MINI_HELLO_PATH = '/mini/hello'
export const MINI_RESTORE_PATH = '/mini/restore'

/**
 * `POST /mini/hello` — заход в Mini App: заодно регистрирует игрока для напоминаний
 * и оставляет серверную копию партии. `POST /mini/restore` — одноразовый токен из
 * `/load`, возвращает сохранение байт в байт.
 *
 * Оба входа верят только подписи initData: тело запроса называет сохранение и токен,
 * но не игрока.
 */
export async function handleHello(
  request: Request,
  env: WorkerEnv,
  config: RuntimeConfig,
  nowIso: string,
): Promise<Response> {
  const origin = request.headers.get('origin')
  const read = await readJson(request, config.saveMaxBytes)
  if (!read.ok) return read.response

  const verdict = await verifyInitData(read.body.initData, config.botToken, Date.parse(nowIso), INIT_DATA_TTL_MS)
  if (!verdict.ok) return error(401, 'invalid-initdata', origin, config)

  const version = read.body.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > 1000) {
    return error(400, 'invalid-version', origin, config)
  }
  const save = read.body.save
  if (save !== undefined && save !== null && typeof save !== 'string') return error(400, 'invalid-save', origin, config)

  try {
    await rememberVisit(env.DB, {
      telegramUserId: verdict.userId,
      // приватный чат бота: другого чата у бота нет, id совпадает с игроком
      chatId: verdict.userId,
      finished: read.body.finished === true,
      now: nowIso,
    })
    if (typeof save === 'string' && save.length > 0) {
      await saveSnapshot(env.DB, { telegramUserId: verdict.userId, version, payload: save, now: nowIso })
    }
  } catch {
    return error(503, 'storage-unavailable', origin, config)
  }
  return payload({ ok: true }, 200, origin, config)
}

export async function handleRestore(
  request: Request,
  env: WorkerEnv,
  config: RuntimeConfig,
  nowIso: string,
): Promise<Response> {
  const origin = request.headers.get('origin')
  const read = await readJson(request, config.maxBodyBytes)
  if (!read.ok) return read.response

  const verdict = await verifyInitData(read.body.initData, config.botToken, Date.parse(nowIso), INIT_DATA_TTL_MS)
  if (!verdict.ok) return error(401, 'invalid-initdata', origin, config)

  const token = read.body.token
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(token)) return error(400, 'invalid-token', origin, config)
  const hash = await tokenHash(token)

  try {
    // Сначала наличие партии, потом погашение: токен без сохранения не сгорает зря.
    const snapshot = await loadSnapshot(env.DB, verdict.userId)
    if (!snapshot) return error(404, 'no-save', origin, config)
    const consumed = await consumeTransferToken(env.DB, { telegramUserId: verdict.userId, tokenHash: hash, now: nowIso })
    if (!consumed) return error(410, 'token-invalid', origin, config)
    return payload(
      { ok: true, version: snapshot.version, save: snapshot.payload, savedAt: snapshot.updatedAt },
      200,
      origin,
      config,
    )
  } catch {
    return error(503, 'storage-unavailable', origin, config)
  }
}

/** Предзапрос CORS: JSON-тело не проходит простым запросом, браузер спрашивает разрешение заранее. */
export function corsPreflight(request: Request, config: RuntimeConfig): Response {
  const origin = request.headers.get('origin')
  const headers = new Headers({ 'cache-control': 'no-store' })
  const allowed = allowedOrigin(origin, config)
  if (allowed) {
    headers.set('access-control-allow-origin', allowed)
    headers.set('vary', 'origin')
    headers.set('access-control-allow-methods', 'POST, OPTIONS')
    headers.set('access-control-allow-headers', 'content-type')
    headers.set('access-control-max-age', '86400')
  }
  return new Response(null, { status: 204, headers })
}

/** Свежий одноразовый токен переноса: 32 случайных байта, в базе — только хеш. */
async function readJson(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  const declared = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, response: new Response(null, { status: 413 }) }
  let text: string
  try {
    text = await request.text()
  } catch {
    return { ok: false, response: new Response(null, { status: 400 }) }
  }
  if (new TextEncoder().encode(text).length > maxBytes) return { ok: false, response: new Response(null, { status: 413 }) }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, response: new Response(null, { status: 400 }) }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, response: new Response(null, { status: 400 }) }
  }
  return { ok: true, body: parsed as Record<string, unknown> }
}

function allowedOrigin(origin: string | null, config: RuntimeConfig): string | null {
  if (!origin) return null
  return config.clientOrigins.includes(origin.replace(/\/+$/, '')) ? origin : null
}

function error(status: number, code: string, origin: string | null, config: RuntimeConfig): Response {
  return payload({ error: code }, status, origin, config)
}

function payload(body: unknown, status: number, origin: string | null, config: RuntimeConfig): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  const allowed = allowedOrigin(origin, config)
  if (allowed) {
    headers.set('access-control-allow-origin', allowed)
    headers.set('vary', 'origin')
  }
  return new Response(JSON.stringify(body), { status, headers })
}
