import { join } from 'node:path'
import { callTelegram } from '../../src/telegram.ts'
import type { Runner, RunResult } from './runner.ts'

/** Общий контекст установщика: всё внешнее подменяется в тестах. */
export interface InstallerContext {
  projectRoot: string
  fetchImpl: typeof fetch
  run: Runner
  env: Record<string, string | undefined>
  log: (message: string) => void
  writeFile: (path: string, content: string) => Promise<void>
  readFile: (path: string) => Promise<string>
  sleep: (ms: number) => Promise<void>
  now: () => Date
}

export interface WranglerConfig {
  name: string
  main: string
  vars?: Record<string, string>
  d1_databases?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export const GENERATED_CONFIG = 'wrangler.generated.json'

export function databaseNameFrom(config: WranglerConfig): string {
  const first = config.d1_databases?.[0] as { database_name?: unknown } | undefined
  const name = typeof first?.database_name === 'string' ? first.database_name : ''
  if (!name) throw new Error('в wrangler.json нет d1_databases[0].database_name')
  return name
}

export async function readWranglerConfig(ctx: InstallerContext): Promise<WranglerConfig> {
  const raw = await ctx.readFile(join(ctx.projectRoot, 'wrangler.json'))
  const config = JSON.parse(raw) as WranglerConfig
  if (typeof config.name !== 'string' || !config.name) throw new Error('в wrangler.json нет name Worker\'а')
  return config
}

/**
 * Временная конфигурация с настоящим database ID. В git она не попадает:
 * account-specific UUID не должен становиться частью установки.
 */
export async function writeGeneratedConfig(
  ctx: InstallerContext,
  config: WranglerConfig,
  databaseId: string,
): Promise<string> {
  const path = join(ctx.projectRoot, GENERATED_CONFIG)
  const databases = (config.d1_databases ?? []).map((database, index) => ({
    ...database,
    ...(index === 0 ? { database_id: databaseId, migrations_dir: join(ctx.projectRoot, 'migrations') } : {}),
  }))
  const generated: WranglerConfig = {
    ...config,
    main: join(ctx.projectRoot, config.main),
    d1_databases: databases,
  }
  await ctx.writeFile(path, `${JSON.stringify(generated, null, 2)}\n`)
  return path
}

export async function wrangler(
  ctx: InstallerContext,
  configPath: string,
  args: string[],
  options: { stdin?: string } = {},
): Promise<RunResult> {
  return ctx.run(
    ['wrangler', ...args, '--config', configPath],
    options.stdin === undefined ? undefined : { stdin: options.stdin },
  )
}

export interface SqlResponse {
  results?: Array<Record<string, unknown>>
}

/** Выполнение SQL в remote D1 через wrangler и разбор его JSON-вывода. */
export async function d1Query(
  ctx: InstallerContext,
  configPath: string,
  databaseName: string,
  command: string,
): Promise<Array<Record<string, unknown>>> {
  const result = await wrangler(ctx, configPath, ['d1', 'execute', databaseName, '--remote', '--json', '--command', command])
  if (result.code !== 0) {
    throw new Error(`wrangler d1 execute завершился с кодом ${result.code}`)
  }
  const parsed = parseJsonOutput(result.stdout)
  if (!parsed) throw new Error('wrangler d1 execute вернул неожиданный вывод')
  const rows: Array<Record<string, unknown>> = []
  for (const item of parsed) {
    if (item && Array.isArray(item.results)) rows.push(...item.results)
  }
  return rows
}

function parseJsonOutput(stdout: string): Array<SqlResponse> | null {
  const trimmed = stdout.trim()
  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Array<SqlResponse>
  } catch {
    return null
  }
}

export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function telegram(ctx: InstallerContext, botToken: string, method: string, payload: unknown): Promise<unknown> {
  return callTelegram(botToken, method, payload, { fetchImpl: ctx.fetchImpl, timeoutMs: 20_000 })
}
