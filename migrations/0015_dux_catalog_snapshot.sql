PRAGMA foreign_keys = ON;

-- Fotografía comercial Dux. D1 conserva una proyección publicada; Dux sigue
-- siendo la autoridad de existencia, nombre, precio y clasificación.
CREATE TABLE IF NOT EXISTS dux_catalog_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  inventory_run_id TEXT NOT NULL REFERENCES dux_sync_runs(id) ON DELETE RESTRICT,
  catalog_version TEXT NOT NULL CHECK (
    length(catalog_version) = 64 AND catalog_version NOT GLOB '*[^0-9a-f]*'
  ),
  price_list_name TEXT NOT NULL CHECK (price_list_name = 'PRECIOS DEL NEGOCIO'),
  item_count INTEGER NOT NULL CHECK (item_count >= 0),
  payload_json TEXT NOT NULL CHECK (
    json_valid(payload_json)
    AND json_type(payload_json) = 'object'
    AND json_extract(payload_json, '$.schemaVersion') = 1
    AND json_extract(payload_json, '$.priceListName') = price_list_name
    AND json_type(payload_json, '$.items') = 'array'
    AND json_array_length(payload_json, '$.items') = item_count
  ),
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS dux_catalog_snapshot_insert_completed_run
BEFORE INSERT ON dux_catalog_snapshot
WHEN NOT EXISTS (
  SELECT 1 FROM dux_sync_runs
  WHERE id = NEW.inventory_run_id AND status IN ('succeeded', 'partial')
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_REQUIRES_COMPLETED_SYNC');
END;

CREATE TRIGGER IF NOT EXISTS dux_catalog_snapshot_update_completed_run
BEFORE UPDATE ON dux_catalog_snapshot
WHEN NOT EXISTS (
  SELECT 1 FROM dux_sync_runs
  WHERE id = NEW.inventory_run_id AND status IN ('succeeded', 'partial')
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_REQUIRES_COMPLETED_SYNC');
END;
