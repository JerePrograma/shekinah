PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS catalog_product_mutations (
  product_id TEXT PRIMARY KEY,
  payload_json TEXT,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (deleted = 0 AND payload_json IS NOT NULL AND json_valid(payload_json)) OR
    (deleted = 1 AND payload_json IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_catalog_product_mutations_updated
  ON catalog_product_mutations(updated_at DESC);
