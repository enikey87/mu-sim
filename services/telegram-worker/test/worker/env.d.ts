import type { WorkerEnv } from '../../src/env.ts'

interface TestMigration {
  name: string
  queries: string[]
}

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      /** Миграции D1 из migrations/, прочитанные конфигом тестов (JSON-строка). */
      TEST_MIGRATIONS_JSON: string
    }
  }
}
