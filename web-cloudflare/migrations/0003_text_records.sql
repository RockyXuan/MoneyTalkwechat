CREATE TABLE text_batches (
 ledger_id TEXT NOT NULL REFERENCES ledgers(id), id TEXT NOT NULL,
 original_text TEXT NOT NULL, items_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','active','paused')),
 fingerprint TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(ledger_id,id), UNIQUE(ledger_id,fingerprint)
);
CREATE TABLE text_slots (
 ledger_id TEXT NOT NULL, batch_id TEXT NOT NULL, item_id TEXT NOT NULL, occurred_on TEXT NOT NULL, entry_id TEXT NOT NULL,
 PRIMARY KEY(ledger_id,batch_id,item_id,occurred_on),
 FOREIGN KEY(ledger_id,batch_id) REFERENCES text_batches(ledger_id,id),
 FOREIGN KEY(ledger_id,entry_id) REFERENCES entries(ledger_id,id)
);
