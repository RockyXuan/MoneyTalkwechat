CREATE TABLE source_ranges (
 ledger_id TEXT NOT NULL REFERENCES ledgers(id),
 id TEXT NOT NULL,
 source TEXT NOT NULL,
 date_from TEXT NOT NULL,
 date_to TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(ledger_id,id)
);
