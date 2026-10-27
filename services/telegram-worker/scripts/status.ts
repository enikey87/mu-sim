import { createContext, writeSummary } from './lib/cli.ts'
import { renderStatusSummary, status } from './lib/status.ts'
import { redact } from './lib/runner.ts'

const ctx = createContext()
const secrets = [ctx.env.TELEGRAM_BOT_TOKEN, ctx.env.CLOUDFLARE_API_TOKEN]

try {
  const result = await status(ctx)
  await writeSummary(renderStatusSummary(result))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  const step = typeof error === 'object' && error !== null && 'step' in error ? `: ${String(error.step)}` : ''
  console.error(redact(`status${step}: ${message}`, secrets))
  process.exitCode = 1
}
