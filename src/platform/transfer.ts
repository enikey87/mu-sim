/**
 * Перенос партии между устройствами через воркер Telegram-бота (#1488).
 *
 * Формат сохранения — тот же JSON, что игра кладёт в localStorage: воркер хранит
 * его байт в байт, поэтому перенос не знает о полях партии и не ломается при их
 * изменении. Все отказы — молчаливые: не доехало — игра идёт дальше на локальной копии.
 */

/** Версия формата сохранения: её читает воркер, чтобы отличить старую копию от новой. */
export const SAVE_VERSION = 1

export interface TransferConfig {
  /** Адрес воркера (`VITE_TELEGRAM_WORKER_URL`): пусто — переноса нет. */
  url: string
  /** Подпись захода `Telegram.WebApp.initData`: воркер верит только ей. */
  initData: string
  /** Одноразовый токен из ссылки `t.me/…?startapp=…`, если игрок пришёл по ней. */
  startParam: string | null
}

export interface TransferChannel {
  /** Токен текущего захода: без него нечего восстанавливать. */
  token(): string | null
  /** Отправить состояние на сервер. `null` — заход без сохранения: нужен только для напоминаний. */
  push(save: string | null, finished: boolean): void
  /** Забрать партию по токену: ровно та строка, что лежала в localStorage, или `null`. */
  pull(token: string): Promise<string | null>
}

/** `startapp` Telegram ограничивает алфавитом URL без процентов: чужая ссылка не станет запросом. */
export function transferToken(raw: string | null): string | null {
  const token = String(raw ?? '').trim()
  return /^[A-Za-z0-9_-]{8,128}$/.test(token) ? token : null
}

export function transferChannel(config: TransferConfig, deps: { fetch?: typeof fetch } = {}): TransferChannel {
  const base = config.url.trim().replace(/\/+$/, '')
  const token = transferToken(config.startParam)
  const send = deps.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  const post = async (path: string, body: Record<string, unknown>): Promise<Response | null> => {
    try {
      const response = await send(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      return response
    } catch {
      return null
    }
  }

  return {
    token: () => token,
    push(save, finished) {
      if (!base || !config.initData) return
      void post('/mini/hello', {
        initData: config.initData,
        version: SAVE_VERSION,
        save,
        finished,
      })
    },
    async pull(oneTime) {
      if (!base || !config.initData) return null
      const response = await post('/mini/restore', { initData: config.initData, token: oneTime })
      if (!response || !response.ok) return null
      try {
        const body = (await response.json()) as { save?: unknown }
        return typeof body.save === 'string' && body.save.length > 0 ? body.save : null
      } catch {
        return null
      }
    },
  }
}
