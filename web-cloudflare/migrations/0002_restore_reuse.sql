CREATE TABLE restores_next (
  ledger_id TEXT PRIMARY KEY REFERENCES ledgers(id), owner_id TEXT NOT NULL REFERENCES users(id),
  fingerprint TEXT NOT NULL, expected_entries INTEGER NOT NULL, expected_categories INTEGER NOT NULL,
  manifest_json TEXT NOT NULL, write_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, completed_at TEXT,
  reusable INTEGER NOT NULL DEFAULT 1 CHECK(reusable IN (0,1))
);
INSERT INTO restores_next(ledger_id,owner_id,fingerprint,expected_entries,expected_categories,manifest_json,write_version,created_at,completed_at)
SELECT ledger_id,owner_id,fingerprint,expected_entries,expected_categories,manifest_json,write_version,created_at,completed_at FROM restores;
DROP TABLE restores;
ALTER TABLE restores_next RENAME TO restores;
CREATE UNIQUE INDEX restores_reusable ON restores(owner_id,fingerprint) WHERE reusable=1;
CREATE TRIGGER category_type_locked BEFORE UPDATE OF type ON categories
WHEN OLD.type != NEW.type
BEGIN
  SELECT RAISE(ABORT,'category_type_mismatch')
  WHERE EXISTS(SELECT 1 FROM entries WHERE ledger_id=OLD.ledger_id AND category_id=OLD.id);
END;
