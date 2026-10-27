import { readD1Migrations, cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

const migrationsDir = new URL('./migrations', import.meta.url).pathname
const migrations = await readD1Migrations(migrationsDir)

// Привязки тестового Worker'а: те же имена, что у production, но фиктивные значения.
// Сеть до Telegram в тестах подменяется на HTTP-границе (globalThis.fetch), а не внутри сервиса.
const testBindings = {
  BOT_TOKEN: '123456789:AAH-test-token',
  WEBHOOK_SECRET: 'test-webhook-secret',
  GAME_URL: 'https://t.me/alik_where_money_bot/game?mode=compact',
  SUPPORT_URL: 'https://github.com/enikey87',
  TELEGRAM_API_BASE: 'https://api.telegram.org',
  // Miniflare принимает только примитивы в bindings: массив миграций едет строкой JSON.
  TEST_MIGRATIONS_JSON: JSON.stringify(migrations),
}

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './wrangler.json' },
            miniflare: { bindings: testBindings },
          }),
        ],
        test: {
          name: 'worker',
          include: ['test/worker/**/*.test.ts'],
          setupFiles: ['./test/worker/setup.ts'],
        },
      },
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/node/**/*.test.ts'],
        },
      },
    ],
  },
})
