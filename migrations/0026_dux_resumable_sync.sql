PRAGMA foreign_keys = ON;

-- Páginas transitorias de lecturas oficiales. No contienen credenciales ni
-- sustituyen el inventario publicado. Cada gesto conserva una identidad.
CREATE TABLE dux_sync_operations (
  request_id TEXT PRIMARY KEY CHECK (length(request_id) = 36),
  run_id TEXT NOT NULL UNIQUE,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  deposit_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('initial', 'manual', 'scheduled')),
  actor TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  phase TEXT NOT NULL CHECK (phase IN ('companies', 'branches', 'warehouses', 'items', 'publish')),
  item_offset INTEGER NOT NULL DEFAULT 0 CHECK (item_offset BETWEEN 0 AND 1000),
  total INTEGER CHECK (total BETWEEN 0 AND 1000),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 45),
  collected_bytes INTEGER NOT NULL DEFAULT 0 CHECK (collected_bytes BETWEEN 0 AND 8000000),
  lease_token TEXT,
  lease_until_ms INTEGER NOT NULL DEFAULT 0,
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  error_code TEXT,
  error_status INTEGER,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX dux_sync_operation_active ON dux_sync_operations(company_id)
  WHERE status = 'running';

CREATE TABLE dux_sync_operation_pages (
  request_id TEXT NOT NULL REFERENCES dux_sync_operations(request_id),
  page_key TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND length(CAST(payload_json AS BLOB)) <= 1900000),
  PRIMARY KEY (request_id, page_key)
);

-- Los callers históricos también respetan la recolección en curso.
CREATE TRIGGER dux_sync_operation_excludes_legacy
BEFORE INSERT ON dux_sync_runs
WHEN NEW.status = 'running' AND EXISTS (
  SELECT 1 FROM dux_sync_operations WHERE status = 'running' AND run_id <> NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_SYNC_IN_PROGRESS');
END;
