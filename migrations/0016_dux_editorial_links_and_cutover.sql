PRAGMA foreign_keys = ON;

-- Control operativo independiente para colección del snapshot y cutover público.
CREATE TABLE IF NOT EXISTS dux_catalog_control (
  company_id TEXT PRIMARY KEY
    CHECK (company_id = '12862'),
  snapshot_collection_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (snapshot_collection_enabled IN (0, 1)),
  public_cutover_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (public_cutover_enabled IN (0, 1)),
  created_by TEXT NOT NULL CHECK (length(created_by) BETWEEN 1 AND 512),
  updated_by TEXT NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 512),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO dux_catalog_control (
  company_id,
  snapshot_collection_enabled,
  public_cutover_enabled,
  created_by,
  updated_by,
  created_at,
  updated_at
) VALUES (
  '12862',
  0,
  0,
  'migration:0016',
  'migration:0016',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

CREATE TABLE IF NOT EXISTS dux_editorial_link_imports (
  batch_id TEXT PRIMARY KEY
    CHECK (length(batch_id) BETWEEN 1 AND 220),
  company_id TEXT NOT NULL REFERENCES dux_catalog_control(company_id) ON DELETE RESTRICT,
  source_manifest_sha256 TEXT NOT NULL
    CHECK (length(source_manifest_sha256) = 64 AND source_manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  matching_source_sha256 TEXT NOT NULL
    CHECK (length(matching_source_sha256) = 64 AND matching_source_sha256 NOT GLOB '*[^0-9a-f]*'),
  base_matching_report_sha256 TEXT NOT NULL
    CHECK (length(base_matching_report_sha256) = 64 AND base_matching_report_sha256 NOT GLOB '*[^0-9a-f]*'),
  auto_confirmable_csv_sha256 TEXT NOT NULL
    CHECK (length(auto_confirmable_csv_sha256) = 64 AND auto_confirmable_csv_sha256 NOT GLOB '*[^0-9a-f]*'),
  analysis_commit TEXT NOT NULL
    CHECK (length(analysis_commit) = 40 AND analysis_commit NOT GLOB '*[^0-9a-f]*'),
  expected_link_count INTEGER NOT NULL CHECK (expected_link_count >= 0),
  actor TEXT NOT NULL CHECK (length(actor) BETWEEN 1 AND 512),
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dux_editorial_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id TEXT NOT NULL REFERENCES dux_catalog_control(company_id) ON DELETE RESTRICT,
  cod_item TEXT NOT NULL CHECK (length(cod_item) BETWEEN 1 AND 300),
  local_product_id TEXT NOT NULL CHECK (length(local_product_id) BETWEEN 1 AND 180),
  reuse_images INTEGER NOT NULL CHECK (reuse_images IN (0, 1)),
  reuse_description INTEGER NOT NULL CHECK (reuse_description IN (0, 1)),
  decision_kind TEXT NOT NULL
    CHECK (decision_kind IN ('confirmed_identity', 'auto_full')),
  decision_method TEXT NOT NULL CHECK (length(decision_method) BETWEEN 1 AND 120),
  presentation_relation TEXT NOT NULL
    CHECK (presentation_relation IN ('same', 'none')),
  batch_id TEXT NOT NULL REFERENCES dux_editorial_link_imports(batch_id) ON DELETE RESTRICT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL CHECK (length(created_by) BETWEEN 1 AND 512),
  updated_by TEXT NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 512),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_dux_editorial_links_active_code
  ON dux_editorial_links(company_id, cod_item)
  WHERE active = 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_dux_editorial_links_active_local
  ON dux_editorial_links(company_id, local_product_id)
  WHERE active = 1;

CREATE INDEX IF NOT EXISTS ix_dux_editorial_links_batch
  ON dux_editorial_links(batch_id, active);

-- Ningún INSERT/UPDATE del snapshot puede ocurrir mientras la colección esté cerrada.
CREATE TRIGGER IF NOT EXISTS dux_catalog_snapshot_collection_insert_guard
BEFORE INSERT ON dux_catalog_snapshot
WHEN NOT EXISTS (
  SELECT 1
  FROM dux_catalog_control
  WHERE snapshot_collection_enabled = 1
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_SNAPSHOT_COLLECTION_DISABLED');
END;

CREATE TRIGGER IF NOT EXISTS dux_catalog_snapshot_collection_update_guard
BEFORE UPDATE ON dux_catalog_snapshot
WHEN NOT EXISTS (
  SELECT 1
  FROM dux_catalog_control
  WHERE snapshot_collection_enabled = 1
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_SNAPSHOT_COLLECTION_DISABLED');
END;

-- Con cutover activo, tampoco puede entrar un snapshot con precio ausente,
-- no numérico o conservadoramente inválido (0, 1 o 2 incluidos).
CREATE TRIGGER IF NOT EXISTS dux_catalog_snapshot_public_price_insert_guard
BEFORE INSERT ON dux_catalog_snapshot
WHEN EXISTS (
  SELECT 1 FROM dux_catalog_control WHERE public_cutover_enabled = 1
)
AND EXISTS (
  SELECT 1
  FROM json_each(json_extract(NEW.payload_json, '$.items')) AS item
  WHERE json_type(item.value, '$.priceAmount') IS NULL
     OR json_type(item.value, '$.priceAmount') NOT IN ('integer', 'real')
     OR CAST(json_extract(item.value, '$.priceAmount') AS REAL) <= 2
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_PUBLIC_PRICE_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS dux_catalog_snapshot_public_price_update_guard
BEFORE UPDATE ON dux_catalog_snapshot
WHEN EXISTS (
  SELECT 1 FROM dux_catalog_control WHERE public_cutover_enabled = 1
)
AND EXISTS (
  SELECT 1
  FROM json_each(json_extract(NEW.payload_json, '$.items')) AS item
  WHERE json_type(item.value, '$.priceAmount') IS NULL
     OR json_type(item.value, '$.priceAmount') NOT IN ('integer', 'real')
     OR CAST(json_extract(item.value, '$.priceAmount') AS REAL) <= 2
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_PUBLIC_PRICE_INVALID');
END;

-- Incluso una operación SQL directa de control debe fallar cerrada.

CREATE TRIGGER IF NOT EXISTS dux_catalog_cutover_snapshot_insert_guard
BEFORE INSERT ON dux_catalog_control
WHEN NEW.public_cutover_enabled = 1
AND NOT EXISTS (SELECT 1 FROM dux_catalog_snapshot WHERE id = 1)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_CUTOVER_REQUIRES_SNAPSHOT');
END;

CREATE TRIGGER IF NOT EXISTS dux_catalog_cutover_price_insert_guard
BEFORE INSERT ON dux_catalog_control
WHEN NEW.public_cutover_enabled = 1
AND EXISTS (
  SELECT 1
  FROM dux_catalog_snapshot AS snapshot,
       json_each(json_extract(snapshot.payload_json, '$.items')) AS item
  WHERE snapshot.id = 1
    AND (
      json_type(item.value, '$.priceAmount') IS NULL
      OR json_type(item.value, '$.priceAmount') NOT IN ('integer', 'real')
      OR CAST(json_extract(item.value, '$.priceAmount') AS REAL) <= 2
    )
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_CUTOVER_PRICE_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS dux_catalog_cutover_snapshot_update_guard
BEFORE UPDATE OF public_cutover_enabled ON dux_catalog_control
WHEN NEW.public_cutover_enabled = 1
AND NOT EXISTS (SELECT 1 FROM dux_catalog_snapshot WHERE id = 1)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_CUTOVER_REQUIRES_SNAPSHOT');
END;

CREATE TRIGGER IF NOT EXISTS dux_catalog_cutover_price_update_guard
BEFORE UPDATE OF public_cutover_enabled ON dux_catalog_control
WHEN NEW.public_cutover_enabled = 1
AND EXISTS (
  SELECT 1
  FROM dux_catalog_snapshot AS snapshot,
       json_each(json_extract(snapshot.payload_json, '$.items')) AS item
  WHERE snapshot.id = 1
    AND (
      json_type(item.value, '$.priceAmount') IS NULL
      OR json_type(item.value, '$.priceAmount') NOT IN ('integer', 'real')
      OR CAST(json_extract(item.value, '$.priceAmount') AS REAL) <= 2
    )
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_CUTOVER_PRICE_INVALID');
END;
