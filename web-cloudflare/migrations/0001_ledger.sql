PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL, active_ledger_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE ledgers (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY' CHECK(currency = 'CNY'),
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai' CHECK(timezone = 'Asia/Shanghai'),
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('importing','ready')),
  created_at TEXT NOT NULL
);
CREATE INDEX ledgers_owner ON ledgers(owner_id);
CREATE TABLE categories (
  ledger_id TEXT NOT NULL REFERENCES ledgers(id), id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 32), type TEXT NOT NULL CHECK(type IN ('income','expense')),
  color_key TEXT NOT NULL, icon TEXT NOT NULL, sort_order INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(ledger_id, id), UNIQUE(ledger_id, type, name)
);
CREATE TABLE entries (
  ledger_id TEXT NOT NULL REFERENCES ledgers(id), id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('expense','income')),
  amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor) = 'integer' AND amount_minor BETWEEN 1 AND 9999999999),
  category_id TEXT NOT NULL, occurred_on TEXT NOT NULL, note TEXT NOT NULL DEFAULT '' CHECK(length(note) <= 200),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  PRIMARY KEY(ledger_id,id), FOREIGN KEY(ledger_id,category_id) REFERENCES categories(ledger_id,id)
);
CREATE INDEX entries_period ON entries(ledger_id,deleted_at,occurred_on DESC,id DESC);
CREATE INDEX entries_category ON entries(ledger_id,category_id,occurred_on);
CREATE TRIGGER entry_type_insert BEFORE INSERT ON entries
BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM categories WHERE ledger_id=NEW.ledger_id AND id=NEW.category_id AND type=NEW.type) THEN RAISE(ABORT,'category_type_mismatch') END; END;
CREATE TRIGGER entry_type_update BEFORE UPDATE OF category_id,type ON entries
BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM categories WHERE ledger_id=NEW.ledger_id AND id=NEW.category_id AND type=NEW.type) THEN RAISE(ABORT,'category_type_mismatch') END; END;
CREATE TABLE operations (
  user_id TEXT NOT NULL REFERENCES users(id), ledger_id TEXT NOT NULL REFERENCES ledgers(id), key TEXT NOT NULL,
  request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,ledger_id,key)
);
CREATE TABLE restores (
  ledger_id TEXT PRIMARY KEY REFERENCES ledgers(id), owner_id TEXT NOT NULL REFERENCES users(id),
  fingerprint TEXT NOT NULL, expected_entries INTEGER NOT NULL, expected_categories INTEGER NOT NULL,
  manifest_json TEXT NOT NULL, write_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, completed_at TEXT,
  UNIQUE(owner_id,fingerprint)
);
