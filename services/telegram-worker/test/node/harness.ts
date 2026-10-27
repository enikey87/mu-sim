import type { InstallerContext, WranglerConfig } from '../../scripts/lib/project.ts'
import type { Runner, RunResult } from '../../scripts/lib/runner.ts'

export const PROJECT_ROOT = '/project'
export const WORKER_NAME = 'alik-stars-worker'
export const WORKER_URL = 'https://alik-stars-worker.test-sub.workers.dev'
export const WEBHOOK_URL = `${WORKER_URL}/telegram/webhook`
export const INVOICE_URL = 'https://t.me/$fake-invoice'

export const BASE_ENV: Record<string, string> = {
  CLOUDFLARE_API_TOKEN: 'cf-token-xyz',
  CLOUDFLARE_ACCOUNT_ID: 'acc-1',
  TELEGRAM_BOT_TOKEN: '123456789:AAH-test-token',
  STARS_AMOUNT: '25',
}

export const WRANGLER_JSON: WranglerConfig = {
  name: WORKER_NAME,
  main: 'src/index.ts',
  vars: {
    GAME_URL: 'https://t.me/alik_where_money_bot/game?mode=compact',
    SUPPORT_URL: 'https://github.com/enikey87',
  },
  d1_databases: [
    { binding: 'DB', database_name: 'alik-stars', database_id: '00000000-0000-0000-0000-000000000000', migrations_dir: 'migrations' },
  ],
}

/** Мини-D1 на тех SQL, которые реально исполняет установщик; неизвестный запрос — падение теста. */
export class FakeD1 {
  catalog: Record<string, unknown> | null = null
  settings = new Map<string, string>()
  payments: Array<Record<string, unknown>> = []
  conflicts = 0
  queries: string[] = []

  query(sql: string): Array<Record<string, unknown>> {
    const text = sql.replace(/\s+/g, ' ').trim()
    this.queries.push(text)

    if (/^SELECT version, title, description, currency, amount FROM catalog/.test(text)) {
      return this.catalog ? [this.catalog] : []
    }
    if (/^INSERT INTO catalog/.test(text)) {
      const match = /VALUES \('([^']*)', (\d+), '([^']*)', '([^']*)', '([^']*)', (\d+), (\d), '([^']*)'\)/.exec(text)
      if (!match) throw new Error(`FakeD1: не разобрал INSERT INTO catalog: ${text}`)
      this.catalog = {
        product_id: match[1],
        version: Number(match[2]),
        title: match[3],
        description: match[4],
        currency: match[5],
        amount: Number(match[6]),
      }
      return []
    }
    if (/^SELECT key, value FROM settings WHERE key IN/.test(text)) {
      return [...this.settings].map(([key, value]) => ({ key, value }))
    }
    if (/^INSERT INTO settings/.test(text)) {
      const pairs = /\(('(?:[^']|'')*'), ('(?:[^']|'')*'|-?\d+), '[^']*'\)/g
      for (const match of text.matchAll(pairs)) {
        const key = unquote(match[1])
        this.settings.set(key, unquote(match[2]))
      }
      return []
    }
    if (/^SELECT telegram_user_id, status, amount, currency FROM payments WHERE charge_id = /.test(text)) {
      const chargeId = chargeIdOf(text)
      return this.payments.filter((row) => row.charge_id === chargeId).map((row) => ({ ...row }))
    }
    if (/^SELECT status FROM payments WHERE charge_id = /.test(text)) {
      const chargeId = chargeIdOf(text)
      return this.payments.filter((row) => row.charge_id === chargeId).map((row) => ({ status: row.status }))
    }
    if (/^UPDATE payments SET status = 'refunded'/.test(text)) {
      const chargeId = chargeIdOf(text)
      for (const row of this.payments) {
        if (row.charge_id === chargeId && row.status === 'paid') {
          row.status = 'refunded'
          row.refunded_at = '2026-10-27T10:00:00.000Z'
        }
      }
      return []
    }
    if (/^SELECT amount, version, currency FROM catalog/.test(text)) {
      return this.catalog ? [{ amount: this.catalog.amount, version: this.catalog.version, currency: this.catalog.currency }] : []
    }
    if (/^SELECT status, COUNT\(\*\) AS total/.test(text)) {
      const grouped = new Map<string, { status: string; total: number; review: number }>()
      for (const row of this.payments) {
        const key = String(row.status)
        const entry = grouped.get(key) ?? { status: key, total: 0, review: 0 }
        entry.total += 1
        if (String(row.note ?? '').startsWith('review:')) entry.review += 1
        grouped.set(key, entry)
      }
      return [...grouped.values()]
    }
    if (/^SELECT COUNT\(\*\) AS total FROM payment_conflicts/.test(text)) {
      return [{ total: this.conflicts }]
    }
    if (/^SELECT received_at FROM payments ORDER BY received_at DESC LIMIT 1/.test(text)) {
      const sorted = [...this.payments].sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)))
      return sorted.length > 0 ? [{ received_at: sorted[0]?.received_at }] : []
    }
    if (/^SELECT value FROM settings WHERE key = 'invoice_link'/.test(text)) {
      const value = this.settings.get('invoice_link')
      return value ? [{ value }] : []
    }
    throw new Error(`FakeD1: неизвестный SQL: ${text}`)
  }
}

/** Значение из `charge_id = '…'`: последний литерал строки может быть статусом. */
function chargeIdOf(text: string): string {
  const match = /charge_id = '((?:[^']|'')*)'/.exec(text)
  return match ? unquote(match[1]) : ''
}

function unquote(value: string): string {
  return value.replace(/^'/, '').replace(/'$/, '').replace(/''/g, "'")
}

export interface TelegramRecord {
  method: string
  payload: Record<string, unknown>
}

export interface HarnessOptions {
  env?: Record<string, string | undefined>
  botUsername?: string
  webhookUrl?: string
  databases?: Array<{ uuid: string; name: string }>
  subdomain?: string
  healthStatuses?: number[]
  cloudflareFailure?: boolean
  wranglerFailureSubstring?: string
}

export interface Harness {
  ctx: InstallerContext
  d1: FakeD1
  telegram: TelegramRecord[]
  wranglerCalls: string[]
  secretWrites: Array<{ name: string; value: string }>
  logs: string[]
  files: Map<string, string>
}

/** Стенд установщика: Telegram, Cloudflare и wrangler подменены, D1 — мини-модель. */
export function createHarness(options: HarnessOptions = {}): Harness {
  const env = { ...BASE_ENV, ...options.env }
  const d1 = new FakeD1()
  d1.catalog = {
    product_id: 'hash-cup',
    version: 1,
    title: 'Чашка хаша для Алика',
    description: 'Добровольная поддержка автора игры «Алик, Где Деньги?»',
    currency: 'XTR',
    amount: 25,
  }

  const state = {
    botUsername: options.botUsername ?? 'alik_where_money_bot',
    webhookUrl: options.webhookUrl ?? '',
    databases: options.databases ?? [{ uuid: 'db-uuid-1', name: 'alik-stars' }],
    subdomain: options.subdomain ?? 'test-sub',
    healthStatuses: [...(options.healthStatuses ?? [200])],
  }

  const telegram: TelegramRecord[] = []
  const wranglerCalls: string[] = []
  const secretWrites: Array<{ name: string; value: string }> = []
  const logs: string[] = []
  const files = new Map<string, string>([['/project/wrangler.json', JSON.stringify(WRANGLER_JSON)]])

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined

    if (url.startsWith('https://api.telegram.org/')) {
      const method = url.split('/').pop() ?? ''
      telegram.push({ method, payload: body ?? {} })
      const result = telegramResult(method, body ?? {}, state)
      return jsonResponse({ ok: true, result })
    }

    if (url.startsWith('https://api.cloudflare.com/client/v4/')) {
      if (options.cloudflareFailure) {
        return jsonResponse({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }, 403)
      }
      if (url.includes('/workers/subdomain')) return jsonResponse({ success: true, result: { subdomain: state.subdomain } })
      if (url.includes('/d1/database?')) return jsonResponse({ success: true, result: state.databases })
      if (url.endsWith('/d1/database')) {
        const created = { uuid: `db-created-${state.databases.length + 1}`, name: String(body?.name ?? '') }
        state.databases = [...state.databases, created]
        return jsonResponse({ success: true, result: created })
      }
      return jsonResponse({ success: false, errors: [{ message: `unexpected ${url}` }] }, 404)
    }

    if (url === `${WORKER_URL}/health`) {
      const status = state.healthStatuses.length > 1 ? state.healthStatuses.shift() ?? 200 : state.healthStatuses[0] ?? 200
      return status === 200 ? jsonResponse({ status: 'ok' }) : jsonResponse({ status: 'degraded' }, status)
    }

    return jsonResponse({ error: 'unexpected' }, 404)
  }) as typeof fetch

  const run: Runner = async (args): Promise<RunResult> => {
    wranglerCalls.push(args.join(' '))
    if (options.wranglerFailureSubstring && args.join(' ').includes(options.wranglerFailureSubstring)) {
      return { code: 1, stdout: '', stderr: 'boom' }
    }
    const command = args[1] ?? ''
    if (command === 'd1' && args[2] === 'migrations') return { code: 0, stdout: 'migrations applied', stderr: '' }
    if (command === 'd1' && args[2] === 'execute') {
      const sql = args[args.indexOf('--command') + 1] ?? ''
      const rows = d1.query(sql)
      return { code: 0, stdout: JSON.stringify([{ results: rows, success: true }]), stderr: '' }
    }
    if (command === 'deploy') return { code: 0, stdout: 'deployed', stderr: '' }
    if (command === 'secret' && args[2] === 'put') {
      secretWrites.push({ name: args[3] ?? '', value: '' })
      return { code: 0, stdout: '', stderr: '' }
    }
    return { code: 1, stdout: '', stderr: `unexpected wrangler ${args.join(' ')}` }
  }

  // stdin секрета пишется отдельно: раннер получает его в options, а не в args.
  const runWithSecret: Runner = async (args, runOptions) => {
    const result = await run(args)
    if (args[1] === 'secret' && args[2] === 'put') {
      const last = secretWrites[secretWrites.length - 1]
      if (last) last.value = runOptions?.stdin ?? ''
    }
    return result
  }

  const ctx: InstallerContext = {
    projectRoot: PROJECT_ROOT,
    fetchImpl,
    run: runWithSecret,
    env,
    log: (message) => logs.push(message),
    writeFile: async (path, content) => { files.set(path, content) },
    readFile: async (path) => {
      const content = files.get(path)
      if (content === undefined) throw new Error(`нет файла ${path}`)
      return content
    },
    sleep: async () => {},
    now: () => new Date('2026-10-27T10:00:00.000Z'),
  }

  return { ctx, d1, telegram, wranglerCalls, secretWrites, logs, files }
}

function telegramResult(
  method: string,
  payload: Record<string, unknown>,
  state: { botUsername: string; webhookUrl: string; databases: Array<{ uuid: string; name: string }> },
): unknown {
  switch (method) {
    case 'getMe':
      return { id: 123456789, username: state.botUsername, is_bot: true }
    case 'getWebhookInfo':
      return { url: state.webhookUrl, pending_update_count: 0 }
    case 'setWebhook':
      state.webhookUrl = String(payload.url ?? '')
      return true
    case 'createInvoiceLink':
      return INVOICE_URL
    case 'refundStarPayment':
      return true
    default:
      return true
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
