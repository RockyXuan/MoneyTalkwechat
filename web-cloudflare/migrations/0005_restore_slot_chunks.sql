-- Temporary bounded chunks prevent large restore manifests exceeding D1 row size.
CREATE TABLE restore_slot_chunks (
 ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
 chunk_index INTEGER NOT NULL,
 slots_json TEXT NOT NULL,
 PRIMARY KEY (ledger_id, chunk_index)
);

ALTER TABLE text_batches ADD COLUMN intake_json TEXT;
