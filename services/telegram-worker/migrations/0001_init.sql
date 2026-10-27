-- Каталог товаров: единственный серверный источник правды о цене и валюте.
-- Строку пишет установщик (scripts/deploy.ts) до выкладки Worker: смена цены —
-- это новая версия каталога, а не правка константы в коде.
CREATE TABLE IF NOT EXISTS catalog (
  product_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL CHECK (version > 0),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at TEXT NOT NULL
);

-- Журнал платежей. charge_id — бизнес-ключ дедупликации: у поддержки по одной
-- ссылке разные charge ID, а повторная доставка того же charge ID не создаёт вторую строку.
-- status = 'paid' при note = 'review: …' — деньги получены, но позиция требует разбора.
CREATE TABLE IF NOT EXISTS payments (
  charge_id TEXT PRIMARY KEY,
  telegram_user_id INTEGER NOT NULL,
  invoice_payload TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  product_id TEXT,
  catalog_version INTEGER,
  received_at TEXT NOT NULL,
  update_id INTEGER,
  status TEXT NOT NULL CHECK (status IN ('paid', 'refunded')),
  refunded_at TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS payments_user_idx ON payments (telegram_user_id);
CREATE INDEX IF NOT EXISTS payments_received_idx ON payments (received_at);

-- Конфликты доставки: тот же charge ID пришёл с другими реквизитами. Исходная
-- строка журнала не перезаписывается, расхождение видно здесь.
CREATE TABLE IF NOT EXISTS payment_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  charge_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS payment_conflicts_charge_idx ON payment_conflicts (charge_id);

-- Служебные значения установщика: ссылка инвойса, чтобы повторный deploy её
-- переиспользовал, а не выпускал новую на каждый запуск.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
