PRAGMA foreign_keys = ON;

-- Cada reconciliación Dux carga primero una generación aislada. La tabla
-- dux_inventory_items continúa siendo la única publicación que leen catálogo,
-- administración y guards de pedidos. El staging sólo conserva el delta contra
-- la publicación visible; el delta y la frescura global se publican juntos en
-- un único batch transaccional D1.
CREATE TABLE IF NOT EXISTS dux_inventory_generations (
  generation_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE REFERENCES dux_sync_runs(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('loading', 'published', 'superseded', 'failed')),
  item_count INTEGER CHECK (item_count IS NULL OR item_count >= 0),
  changed_count INTEGER CHECK (changed_count IS NULL OR changed_count >= 0),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  published_at TEXT,
  failed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (status = 'loading' AND item_count IS NULL AND changed_count IS NULL
      AND completed_at IS NULL AND published_at IS NULL AND failed_at IS NULL)
    OR (status = 'published' AND item_count IS NOT NULL AND changed_count IS NOT NULL
      AND completed_at IS NOT NULL AND published_at IS NOT NULL AND failed_at IS NULL)
    OR (status = 'superseded' AND item_count IS NOT NULL AND changed_count IS NOT NULL
      AND completed_at IS NOT NULL AND published_at IS NOT NULL AND failed_at IS NULL)
    OR (status = 'failed' AND item_count IS NULL AND changed_count IS NULL
      AND completed_at IS NOT NULL AND published_at IS NULL AND failed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dux_inventory_generations_published
  ON dux_inventory_generations((1)) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_dux_inventory_generations_run
  ON dux_inventory_generations(run_id, status);

CREATE TABLE IF NOT EXISTS dux_inventory_generation_items (
  generation_id TEXT NOT NULL
    REFERENCES dux_inventory_generations(generation_id) ON DELETE CASCADE,
  inventory_key TEXT NOT NULL,
  cod_item TEXT NOT NULL,
  id_det_item TEXT,
  codigo_externo TEXT,
  cod_barra TEXT,
  item_name TEXT NOT NULL,
  local_product_id TEXT,
  mapping_status TEXT NOT NULL CHECK (mapping_status IN ('mapped', 'unmapped', 'ambiguous')),
  mapping_source TEXT CHECK (
    mapping_source IS NULL OR mapping_source IN (
      'persisted',
      'codigo_externo',
      'sku',
      'cod_barra',
      'exact_name',
      'manual'
    )
  ),
  mapping_candidates_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(mapping_candidates_json) AND json_type(mapping_candidates_json) = 'array'),
  deposit_id TEXT NOT NULL,
  deposit_name TEXT NOT NULL,
  stock_real REAL NOT NULL,
  stock_reservado REAL NOT NULL,
  stock_disponible REAL NOT NULL,
  units_per_package REAL,
  unit_id TEXT,
  unit_name TEXT,
  unit_symbol TEXT,
  is_weighable INTEGER CHECK (is_weighable IS NULL OR is_weighable IN (0, 1)),
  allows_decimal INTEGER CHECK (allows_decimal IS NULL OR allows_decimal IN (0, 1)),
  commercial_quantity_step REAL CHECK (
    commercial_quantity_step IS NULL OR commercial_quantity_step > 0
  ),
  quantity_semantics_status TEXT NOT NULL CHECK (
    quantity_semantics_status IN ('unavailable_from_v2_items', 'verified', 'unsupported')
  ),
  checkout_eligible INTEGER NOT NULL DEFAULT 0 CHECK (checkout_eligible IN (0, 1)),
  catalog_version TEXT NOT NULL CHECK (
    length(catalog_version) = 64 AND catalog_version NOT GLOB '*[^0-9a-f]*'
  ),
  raw_snapshot_json TEXT NOT NULL CHECK (json_valid(raw_snapshot_json)),
  last_sync_status TEXT NOT NULL CHECK (last_sync_status IN ('ok', 'error', 'absent')),
  last_sync_error_code TEXT,
  last_synced_at TEXT NOT NULL,
  absent_since TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (generation_id, inventory_key),
  CHECK (
    checkout_eligible = 0 OR (
      mapping_status = 'mapped'
      AND local_product_id IS NOT NULL
      AND quantity_semantics_status = 'verified'
      AND last_sync_status = 'ok'
      AND stock_disponible > 0
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dux_inventory_generation_identity
  ON dux_inventory_generation_items(
    generation_id,
    cod_item,
    COALESCE(id_det_item, ''),
    deposit_id
  );
CREATE INDEX IF NOT EXISTS idx_dux_inventory_generation_local
  ON dux_inventory_generation_items(generation_id, local_product_id, mapping_status);

-- Reserva conservadora de escrituras D1 Free por día UTC. El límite propio
-- deja margen frente a las 100.000 filas diarias para índices, fallos y el
-- resto de las capacidades D1 de la aplicación.
CREATE TABLE IF NOT EXISTS dux_d1_write_budget (
  utc_date TEXT PRIMARY KEY CHECK (
    length(utc_date) = 10
    AND utc_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  estimated_rows INTEGER NOT NULL CHECK (
    estimated_rows >= 0 AND estimated_rows <= 40000
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- La transición sólo puede declararse publicada cuando se aplicó todo el delta
-- aislado y la tabla visible tiene la cardinalidad completa declarada. Cualquier
-- diferencia aborta el batch entero y conserva la publicación anterior.
CREATE TRIGGER IF NOT EXISTS dux_inventory_generation_publish_guard
BEFORE UPDATE OF status ON dux_inventory_generations
WHEN NEW.status = 'published'
  AND (
    OLD.status <> 'loading'
    OR NEW.item_count IS NULL
    OR NEW.changed_count IS NULL
    OR NEW.changed_count <> (
      SELECT COUNT(*)
      FROM dux_inventory_generation_items
      WHERE generation_id = NEW.generation_id
    )
    OR NEW.item_count <> (SELECT COUNT(*) FROM dux_inventory_items)
  )
BEGIN
  SELECT RAISE(ABORT, 'DUX_SNAPSHOT_GENERATION_INCOMPLETE');
END;
