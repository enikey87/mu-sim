/**
 * Игроки, сохранения и одноразовые токены переноса. Все ограничители напоминаний
 * живут в схеме D1 (`players`), а не в памяти рассылки: между запусками cron
 * никакой памяти нет.
 */

/** Сохранение из игры: `payload` — тот же JSON, что игра кладёт в localStorage, байт в байт. */
export interface Snapshot {
  version: number
  payload: string
  updatedAt: string
}

interface PlayerRow {
  telegram_user_id: number
  chat_id: number
}

export interface Visit {
  telegramUserId: number
  /** Приватный чат бота: `chat_id` равен user id — другого чата у бота нет. */
  chatId: number
  finished: boolean
  now: string
}

/**
 * Заход в игру: время визита, состояние экрана концовки и сброс серии напоминаний.
 * `opt_out` не сбрасывается никогда — «не напоминать» это решение игрока, а не сессия.
 */
export async function rememberVisit(db: D1Database, visit: Visit): Promise<void> {
  await db
    .prepare(
      `INSERT INTO players (telegram_user_id, chat_id, first_seen_at, last_seen_at, finished, reminder_count, last_reminder_at, opt_out)
       VALUES (?, ?, ?, ?, ?, 0, NULL, 0)
       ON CONFLICT(telegram_user_id) DO UPDATE SET
         chat_id = excluded.chat_id,
         last_seen_at = excluded.last_seen_at,
         finished = excluded.finished,
         reminder_count = 0`,
    )
    .bind(visit.telegramUserId, visit.chatId, visit.now, visit.now, visit.finished ? 1 : 0)
    .run()
}

export async function saveSnapshot(
  db: D1Database,
  snapshot: { telegramUserId: number; version: number; payload: string; now: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO saves (telegram_user_id, version, payload, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(telegram_user_id) DO UPDATE SET
         version = excluded.version,
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
    )
    .bind(snapshot.telegramUserId, snapshot.version, snapshot.payload, snapshot.now)
    .run()
}

export async function loadSnapshot(db: D1Database, telegramUserId: number): Promise<Snapshot | null> {
  const row = await db
    .prepare('SELECT version, payload, updated_at FROM saves WHERE telegram_user_id = ?')
    .bind(telegramUserId)
    .first<{ version: number; payload: string; updated_at: string }>()
  return row ? { version: row.version, payload: row.payload, updatedAt: row.updated_at } : null
}

export async function issueTransferToken(
  db: D1Database,
  token: { telegramUserId: number; tokenHash: string; now: string; expiresAt: string },
): Promise<void> {
  // Просроченные токены не нужны никому: уборка здесь дешевле отдельного cron.
  await db.prepare('DELETE FROM transfer_tokens WHERE expires_at <= ?').bind(token.now).run()
  await db
    .prepare('INSERT INTO transfer_tokens (token_hash, telegram_user_id, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, NULL)')
    .bind(token.tokenHash, token.telegramUserId, token.now, token.expiresAt)
    .run()
}

/**
 * Погашение токена одним UPDATE: два конкурентных запроса не могут оба получить
 * «ok», даже если пришли одновременно. Токен чужого игрока не гасится.
 */
export async function consumeTransferToken(
  db: D1Database,
  token: { telegramUserId: number; tokenHash: string; now: string },
): Promise<boolean> {
  const used = await db
    .prepare(
      `UPDATE transfer_tokens SET used_at = ?
       WHERE token_hash = ? AND telegram_user_id = ? AND used_at IS NULL AND expires_at > ?`,
    )
    .bind(token.now, token.tokenHash, token.telegramUserId, token.now)
    .run()
  return (used.meta.changes ?? 0) > 0
}

export interface ReminderTarget {
  telegramUserId: number
  chatId: number
}

/**
 * Кого будить: молчит дольше `idleBeforeIso`, напоминаний подряд меньше лимита,
 * прошлое напоминание старше `gapBeforeIso`, игрок не отказался и партия не кончена.
 */
export async function reminderTargets(
  db: D1Database,
  window: { idleBeforeIso: string; gapBeforeIso: string; limit: number },
): Promise<ReminderTarget[]> {
  const rows = await db
    .prepare(
      `SELECT telegram_user_id, chat_id FROM players
       WHERE opt_out = 0
         AND finished = 0
         AND reminder_count < ?
         AND last_seen_at <= ?
         AND (last_reminder_at IS NULL OR last_reminder_at <= ?)
       ORDER BY last_seen_at
       LIMIT 100`,
    )
    .bind(window.limit, window.idleBeforeIso, window.gapBeforeIso)
    .all<PlayerRow>()
  return (rows.results ?? []).map((row) => ({ telegramUserId: row.telegram_user_id, chatId: row.chat_id }))
}

export async function noteReminderSent(db: D1Database, telegramUserId: number, now: string): Promise<void> {
  await db
    .prepare('UPDATE players SET reminder_count = reminder_count + 1, last_reminder_at = ? WHERE telegram_user_id = ?')
    .bind(now, telegramUserId)
    .run()
}

/** «Не напоминать»: снимает с рассылки навсегда, а не до следующего захода. */
export async function optOutReminders(db: D1Database, telegramUserId: number): Promise<void> {
  await db.prepare('UPDATE players SET opt_out = 1 WHERE telegram_user_id = ?').bind(telegramUserId).run()
}
