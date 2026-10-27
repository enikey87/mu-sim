const DEFAULT_API_BASE = 'https://api.cloudflare.com/client/v4'

export interface D1DatabaseInfo {
  uuid: string
  name: string
}

export class CloudflareApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'CloudflareApiError'
    this.status = status
  }
}

interface Envelope<T> {
  success?: boolean
  result?: T
  errors?: Array<{ code?: number; message?: string }>
}

export interface CloudflareClientOptions {
  token: string
  accountId: string
  fetchImpl: typeof fetch
  apiBase?: string
}

/**
 * Клиент Cloudflare API для установщика: только базы D1 и поддомен workers.dev.
 * Ответ Cloudflare с `success:false` — ошибка, даже если HTTP был 200.
 */
export function cloudflareClient(options: CloudflareClientOptions) {
  const apiBase = (options.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '')
  const accountPath = `/accounts/${encodeURIComponent(options.accountId)}`

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await options.fetchImpl(`${apiBase}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${options.token}`,
          'content-type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown'
      throw new CloudflareApiError(`сеть Cloudflare API недоступна (${name})`, 0)
    }

    let envelope: Envelope<T>
    try {
      envelope = (await response.json()) as Envelope<T>
    } catch {
      throw new CloudflareApiError(`Cloudflare API вернул не JSON (HTTP ${response.status})`, response.status)
    }

    if (!response.ok || envelope.success !== true) {
      const details = (envelope.errors ?? []).map((item) => item.message).filter(Boolean).join('; ')
      throw new CloudflareApiError(
        `Cloudflare API отказал (HTTP ${response.status})${details ? `: ${details}` : ''}`,
        response.status,
      )
    }
    return envelope.result as T
  }

  return {
    async listD1Databases(name: string): Promise<D1DatabaseInfo[]> {
      const result = await request<D1DatabaseInfo[]>('GET', `${accountPath}/d1/database?name=${encodeURIComponent(name)}`)
      return Array.isArray(result) ? result : []
    },

    async createD1Database(name: string): Promise<D1DatabaseInfo> {
      return request<D1DatabaseInfo>('POST', `${accountPath}/d1/database`, { name })
    },

    async workersSubdomain(): Promise<string> {
      const result = await request<{ subdomain?: string }>('GET', `${accountPath}/workers/subdomain`)
      const subdomain = (result?.subdomain ?? '').trim()
      if (!subdomain) throw new CloudflareApiError('у аккаунта нет поддомена workers.dev', 0)
      return subdomain
    },
  }
}
