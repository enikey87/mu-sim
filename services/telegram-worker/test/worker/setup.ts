import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeEach } from 'vitest'
import { seedCatalog } from './helpers.ts'

// Настоящие миграции из migrations/ на настоящей локальной D1: тесты видят ту схему,
// которую установщик применяет в production.
const migrations = JSON.parse(env.TEST_MIGRATIONS_JSON) as Parameters<typeof applyD1Migrations>[1]
await applyD1Migrations(env.DB, migrations)

// Изоляция хранилища между тестами: каждый тест начинает с пустым журналом и
// готовым каталогом, который пишет установщик до выкладки Worker'а.
beforeEach(async () => {
  await env.DB.exec(
    'DELETE FROM payments; DELETE FROM payment_conflicts; DELETE FROM settings; DELETE FROM players; DELETE FROM saves; DELETE FROM transfer_tokens;',
  )
  await seedCatalog(env.DB)
})
