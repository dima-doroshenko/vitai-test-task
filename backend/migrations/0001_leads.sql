CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  phone TEXT NOT NULL CHECK(length(phone) = 13),
  interest TEXT NOT NULL CHECK(interest IN ('subscription','order','question')),
  comment TEXT NOT NULL DEFAULT '' CHECK(length(comment) <= 1000),
  context TEXT NOT NULL DEFAULT '' CHECK(length(context) <= 120),
  attribution TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  telegram_status TEXT NOT NULL DEFAULT 'pending',
  telegram_attempts INTEGER NOT NULL DEFAULT 0,
  telegram_next_at INTEGER NOT NULL DEFAULT (unixepoch()),
  telegram_lease TEXT,
  telegram_error TEXT
);
CREATE INDEX leads_phone_time ON leads(phone, created_at DESC);
CREATE INDEX leads_telegram_due ON leads(telegram_status, telegram_next_at);
-- A trigger runs inside the INSERT statement's transaction. D1 serializes
-- writes; there is no app-level SELECT/INSERT race or fixed time bucket.
CREATE TRIGGER leads_sliding_dedup BEFORE INSERT ON leads
WHEN EXISTS (
  SELECT 1 FROM leads WHERE phone = NEW.phone
    AND created_at > NEW.created_at - 600
)
BEGIN
  SELECT RAISE(IGNORE);
END;
