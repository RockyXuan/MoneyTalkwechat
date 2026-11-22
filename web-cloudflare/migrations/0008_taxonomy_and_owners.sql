CREATE TABLE owners (
  ledger_id TEXT NOT NULL REFERENCES ledgers(id),
  id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 24),
  color_key TEXT NOT NULL DEFAULT 'blue',
  sort_order INTEGER NOT NULL DEFAULT 100,
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(ledger_id, id),
  UNIQUE(ledger_id, name)
);
ALTER TABLE categories ADD COLUMN subcategories_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(subcategories_json) AND json_type(subcategories_json)='array');
ALTER TABLE categories ADD COLUMN default_owner_id TEXT DEFAULT NULL;
ALTER TABLE entries ADD COLUMN subcategory TEXT DEFAULT NULL CHECK(subcategory IS NULL OR length(subcategory) BETWEEN 1 AND 32);
ALTER TABLE entries ADD COLUMN owner_id TEXT DEFAULT NULL CHECK(owner_id IS NULL OR length(owner_id) BETWEEN 1 AND 64);
CREATE INDEX entries_owner ON entries(ledger_id, deleted_at, owner_id, occurred_on);
