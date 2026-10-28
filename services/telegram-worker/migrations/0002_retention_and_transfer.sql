-- Игроки, которых бот знает по заходу в Mini App. Строку пишет только
-- подписанный initData (src/mini.ts), а не тело запроса: chat_id и user id
-- берутся из подписи Telegram.
--
-- Ограничители напоминаний — здесь же, в схеме, а не в коде рассылки:
-- reminder_count считает напоминания подряд без захода, opt_out снимает
-- игрока с рассылки навсегда, finished выключает напоминания партии,
-- которая стоит на экране концовки.
CREATE TABLE IF NOT EXISTS players (
  telegram_user_id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  finished INTEGER NOT NULL DEFAULT 0 CHECK (finished IN (0, 1)),
  reminder_count INTEGER NOT NULL DEFAULT 0 CHECK (reminder_count >= 0),
  last_reminder_at TEXT,
  opt_out INTEGER NOT NULL DEFAULT 0 CHECK (opt_out IN (0, 1))
);

CREATE INDEX IF NOT EXISTS players_last_seen_idx ON players (last_seen_at);

-- Последнее состояние партии от игры — тот же JSON, что игра кладёт в
-- localStorage, байт в байт. version — версия схемы сохранения игры:
-- перенос между версиями сборки решает игра, а не воркер.
CREATE TABLE IF NOT EXISTS saves (
  telegram_user_id INTEGER PRIMARY KEY,
  version INTEGER NOT NULL CHECK (version > 0),
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Одноразовые токены переноса: в базе только SHA-256 от токена, поэтому
-- утечка дампа не даёт открыть чужую партию. Живут час, гасятся первым
-- использованием (used_at).
CREATE TABLE IF NOT EXISTS transfer_tokens (
  token_hash TEXT PRIMARY KEY,
  telegram_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS transfer_tokens_user_idx ON transfer_tokens (telegram_user_id);
