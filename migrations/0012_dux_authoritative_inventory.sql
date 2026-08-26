PRAGMA foreign_keys = ON;

-- Dux es la autoridad externa. Estas tablas conservan una observación, el
-- vínculo estable con el catálogo local y el estado de coordinación; no son
-- un libro de stock local ni habilitan por sí solas una venta.
CREATE TABLE IF NOT EXISTS dux_tenant_context (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  api_version TEXT NOT NULL CHECK (api_version = 'v2'),
  company_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  deposit_id TEXT NOT NULL,
  deposit_name TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dux_sync_runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('initial', 'full', 'manual', 'scheduled')),
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  trigger_actor TEXT NOT NULL,
  processed_count INTEGER NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
  mapped_count INTEGER NOT NULL DEFAULT 0 CHECK (mapped_count >= 0),
  unmapped_count INTEGER NOT NULL DEFAULT 0 CHECK (unmapped_count >= 0),
  ambiguous_count INTEGER NOT NULL DEFAULT 0 CHECK (ambiguous_count >= 0),
  absent_count INTEGER NOT NULL DEFAULT 0 CHECK (absent_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  error_code TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dux_sync_runs_started
  ON dux_sync_runs(started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dux_sync_runs_single_running
  ON dux_sync_runs((1)) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS dux_inventory_items (
  inventory_key TEXT PRIMARY KEY,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_dux_inventory_identity
  ON dux_inventory_items(cod_item, COALESCE(id_det_item, ''), deposit_id);
CREATE INDEX IF NOT EXISTS idx_dux_inventory_local
  ON dux_inventory_items(local_product_id, mapping_status, last_sync_status);
CREATE INDEX IF NOT EXISTS idx_dux_inventory_external
  ON dux_inventory_items(codigo_externo, cod_barra);
CREATE INDEX IF NOT EXISTS idx_dux_inventory_sync
  ON dux_inventory_items(last_sync_status, last_synced_at);

-- Ledger preparado para correlacionar sistemas sin reutilizar IDs de proveedor
-- como IDs públicos. Mientras Dux no documente liberación/finalización segura,
-- la aplicación sólo puede persistir el estado 'blocked' y no mutar pedidos.
CREATE TABLE IF NOT EXISTS dux_order_links (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE RESTRICT,
  dux_reference TEXT NOT NULL UNIQUE,
  dux_order_id TEXT UNIQUE,
  dux_order_number TEXT,
  company_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  deposit_id TEXT NOT NULL,
  reservation_state TEXT NOT NULL CHECK (
    reservation_state IN (
      'not_attempted',
      'pending',
      'confirmed',
      'uncertain',
      'compensation_pending',
      'released',
      'finalized',
      'blocked'
    )
  ),
  request_fingerprint TEXT NOT NULL,
  last_error_code TEXT,
  attempted_at TEXT,
  confirmed_at TEXT,
  released_at TEXT,
  finalized_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dux_order_links_attention
  ON dux_order_links(reservation_state, updated_at);

CREATE TABLE IF NOT EXISTS dux_order_operations (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL REFERENCES dux_order_links(order_id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('reserve', 'release', 'finalize', 'reconcile')),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'confirmed', 'uncertain', 'compensation_pending', 'failed', 'blocked')
  ),
  request_json TEXT NOT NULL CHECK (json_valid(request_json)),
  response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
  provider_operation_id TEXT,
  error_code TEXT,
  attempted_at TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dux_order_operations_order
  ON dux_order_operations(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dux_order_operations_attention
  ON dux_order_operations(status, updated_at);

-- HARD BLOCK de base de datos: la API pública relevada no demuestra todavía
-- cómo liberar/finalizar un pedido Dux. Hasta que una migración posterior
-- reemplace expresamente estos guards, ningún pedido vinculado a Dux puede
-- materializar líneas ni cambiar de estado. Así los triggers legacy nunca
-- descuentan stock local ni duplican la reserva autoritativa.
CREATE TRIGGER IF NOT EXISTS dux_order_link_requires_empty_order
BEFORE INSERT ON dux_order_links
WHEN EXISTS (
  SELECT 1 FROM order_items WHERE order_id = NEW.order_id
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_ORDER_ALREADY_HAS_LOCAL_ITEMS');
END;

CREATE TRIGGER IF NOT EXISTS dux_order_items_lifecycle_blocked
BEFORE INSERT ON order_items
WHEN EXISTS (
  SELECT 1 FROM dux_order_links WHERE order_id = NEW.order_id
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_ORDER_LIFECYCLE_UNAVAILABLE');
END;

CREATE TRIGGER IF NOT EXISTS dux_order_items_update_blocked
BEFORE UPDATE ON order_items
WHEN EXISTS (
  SELECT 1 FROM dux_order_links WHERE order_id = OLD.order_id
) OR EXISTS (
  SELECT 1 FROM dux_order_links WHERE order_id = NEW.order_id
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_ORDER_LIFECYCLE_UNAVAILABLE');
END;

CREATE TRIGGER IF NOT EXISTS dux_order_items_delete_blocked
BEFORE DELETE ON order_items
WHEN EXISTS (
  SELECT 1 FROM dux_order_links WHERE order_id = OLD.order_id
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_ORDER_LIFECYCLE_UNAVAILABLE');
END;

CREATE TRIGGER IF NOT EXISTS dux_order_status_lifecycle_blocked
BEFORE UPDATE OF status ON orders
WHEN OLD.status IS NOT NEW.status
  AND EXISTS (
    SELECT 1 FROM dux_order_links WHERE order_id = OLD.id
  )
BEGIN
  SELECT RAISE(ABORT, 'DUX_ORDER_LIFECYCLE_UNAVAILABLE');
END;

-- También pone en cuarentena pedidos creados antes del corte cuando una línea
-- ya corresponde a una identidad Dux observada. Evita que una preferencia o
-- reserva legacy consuma sólo el contador local después de adoptar Dux.
CREATE TRIGGER IF NOT EXISTS dux_mapped_order_status_lifecycle_blocked
BEFORE UPDATE OF status ON orders
WHEN OLD.status IS NOT NEW.status
  AND EXISTS (
    SELECT 1
    FROM order_items AS order_line
    WHERE order_line.order_id = OLD.id
      AND EXISTS (
        SELECT 1
        FROM dux_inventory_items AS dux_item
        WHERE dux_item.local_product_id = order_line.product_id
           OR EXISTS (
             SELECT 1
             FROM json_each(dux_item.mapping_candidates_json) AS candidate
             WHERE candidate.value = order_line.product_id
           )
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'DUX_ORDER_RECONCILIATION_REQUIRED');
END;
