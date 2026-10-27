/** Привязки Worker'а. Секреты приходят из GitHub environment, значения вроде GAME_URL — из wrangler.json. */
export interface WorkerEnv {
  DB: D1Database
  /** Секрет `BOT_TOKEN`: токен @alik_where_money_bot, кладёт установщик. */
  BOT_TOKEN?: string
  /** Секрет `WEBHOOK_SECRET`: производная от токена бота (src/webhook-secret.ts). */
  WEBHOOK_SECRET?: string
  /** Публичная ссылка на игру для /start. */
  GAME_URL?: string
  /** Куда идти за помощью по платежу для /paysupport. */
  SUPPORT_URL?: string
  TELEGRAM_API_BASE?: string
  TELEGRAM_TIMEOUT_MS?: string
  PRECHECKOUT_BUDGET_MS?: string
  MAX_BODY_BYTES?: string
}

/** Значения, которые Worker реально использует после проверки конфигурации. */
export interface RuntimeConfig {
  botToken: string
  webhookSecret: string
  gameUrl: string
  supportUrl: string
  apiBase: string
  timeoutMs: number
  precheckoutBudgetMs: number
  maxBodyBytes: number
}
