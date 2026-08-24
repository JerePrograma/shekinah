PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mercadolibre_oauth_states (
  state_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mercadolibre_oauth_states_expiry
  ON mercadolibre_oauth_states(expires_at, consumed_at);

CREATE TABLE IF NOT EXISTS mercadolibre_connections (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  seller_id TEXT NOT NULL UNIQUE,
  site_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  access_token_ciphertext TEXT NOT NULL,
  access_token_iv TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  refresh_token_iv TEXT NOT NULL,
  token_expires_at TEXT NOT NULL,
  token_updated_at TEXT NOT NULL,
  refresh_owner TEXT,
  refresh_started_at TEXT,
  last_verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mercadolibre_sync_runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('initial', 'full', 'incremental', 'notification')),
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  trigger_actor TEXT NOT NULL,
  processed_count INTEGER NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
  created_count INTEGER NOT NULL DEFAULT 0 CHECK (created_count >= 0),
  updated_count INTEGER NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  unchanged_count INTEGER NOT NULL DEFAULT 0 CHECK (unchanged_count >= 0),
  deactivated_count INTEGER NOT NULL DEFAULT 0 CHECK (deactivated_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  ambiguous_count INTEGER NOT NULL DEFAULT 0 CHECK (ambiguous_count >= 0),
  active_count INTEGER NOT NULL DEFAULT 0 CHECK (active_count >= 0),
  paused_count INTEGER NOT NULL DEFAULT 0 CHECK (paused_count >= 0),
  closed_count INTEGER NOT NULL DEFAULT 0 CHECK (closed_count >= 0),
  out_of_stock_count INTEGER NOT NULL DEFAULT 0 CHECK (out_of_stock_count >= 0),
  error_code TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mercadolibre_sync_runs_started
  ON mercadolibre_sync_runs(started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mercadolibre_sync_runs_single_running
  ON mercadolibre_sync_runs((1)) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS mercadolibre_catalog_units (
  inventory_key TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  variation_id TEXT,
  user_product_id TEXT,
  seller_sku TEXT,
  local_product_id TEXT,
  title TEXT NOT NULL,
  price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
  currency TEXT NOT NULL,
  item_status TEXT NOT NULL,
  available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
  stock_model TEXT NOT NULL CHECK (
    stock_model IN (
      'seller_warehouse_versioned',
      'selling_address',
      'meli_facility',
      'legacy_available_quantity',
      'unknown'
    )
  ),
  stock_location_id TEXT,
  upstream_version TEXT,
  stock_snapshot_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(stock_snapshot_json)),
  primary_image_url TEXT,
  permalink TEXT,
  provider_updated_at TEXT,
  catalog_version TEXT NOT NULL,
  mapping_status TEXT NOT NULL CHECK (
    mapping_status IN ('mapped', 'unmapped', 'ambiguous', 'duplicate')
  ),
  sellable INTEGER NOT NULL DEFAULT 0 CHECK (sellable IN (0, 1)),
  checkout_eligible INTEGER NOT NULL DEFAULT 0 CHECK (checkout_eligible IN (0, 1)),
  last_sync_status TEXT NOT NULL CHECK (last_sync_status IN ('ok', 'error', 'absent')),
  last_sync_error_code TEXT,
  last_synced_at TEXT NOT NULL,
  absent_since TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (seller_id, item_id, variation_id, stock_location_id)
);

CREATE INDEX IF NOT EXISTS idx_mercadolibre_catalog_units_local
  ON mercadolibre_catalog_units(local_product_id, mapping_status, sellable);
CREATE INDEX IF NOT EXISTS idx_mercadolibre_catalog_units_item
  ON mercadolibre_catalog_units(item_id, variation_id);
CREATE INDEX IF NOT EXISTS idx_mercadolibre_catalog_units_sync
  ON mercadolibre_catalog_units(last_sync_status, last_synced_at);
CREATE INDEX IF NOT EXISTS idx_mercadolibre_catalog_units_sku
  ON mercadolibre_catalog_units(seller_sku);

CREATE TABLE IF NOT EXISTS mercadolibre_inventory_operations (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  inventory_key TEXT NOT NULL REFERENCES mercadolibre_catalog_units(inventory_key) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('reserve', 'release', 'consume', 'reconcile')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'applied', 'confirmed', 'compensation_pending', 'compensated', 'failed', 'uncertain')
  ),
  before_quantity INTEGER CHECK (before_quantity IS NULL OR before_quantity >= 0),
  after_quantity INTEGER CHECK (after_quantity IS NULL OR after_quantity >= 0),
  upstream_version_before TEXT,
  upstream_version_after TEXT,
  before_snapshot_json TEXT CHECK (before_snapshot_json IS NULL OR json_valid(before_snapshot_json)),
  after_snapshot_json TEXT CHECK (after_snapshot_json IS NULL OR json_valid(after_snapshot_json)),
  provider_operation_id TEXT,
  error_code TEXT,
  attempted_at TEXT,
  applied_at TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mercadolibre_inventory_operations_order
  ON mercadolibre_inventory_operations(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mercadolibre_inventory_operations_attention
  ON mercadolibre_inventory_operations(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_mercadolibre_inventory_operations_unit
  ON mercadolibre_inventory_operations(inventory_key, created_at);

CREATE TABLE IF NOT EXISTS mercadolibre_notifications (
  event_key TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  resource TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  application_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'ignored', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  error_code TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mercadolibre_notifications_received
  ON mercadolibre_notifications(received_at DESC);

ALTER TABLE order_items
  ADD COLUMN provider_inventory_key TEXT;

ALTER TABLE order_items
  ADD COLUMN provider_catalog_version TEXT;

CREATE INDEX idx_order_items_provider_inventory
  ON order_items(provider_inventory_key, order_id);

DROP TRIGGER checkout_orders_stock_markers_immutable;

CREATE TRIGGER checkout_orders_stock_markers_immutable
BEFORE UPDATE OF stock_reserved_at, stock_reservation_expires_at, stock_consumed_at ON orders
WHEN OLD.channel = 'checkout_pro'
  AND (
    NEW.stock_reserved_at IS NOT OLD.stock_reserved_at
    OR (
      NEW.stock_reservation_expires_at IS NOT OLD.stock_reservation_expires_at
      AND NOT (
        OLD.stock_consumed_at IS NULL
        AND NEW.stock_reservation_expires_at IS NOT NULL
        AND unixepoch(NEW.stock_reservation_expires_at) <= unixepoch(OLD.stock_reservation_expires_at)
        AND NEW.status IN ('failed', 'rejected', 'cancelled')
      )
    )
    OR (
      OLD.stock_consumed_at IS NOT NULL
      AND NEW.stock_consumed_at IS NOT OLD.stock_consumed_at
    )
    OR (
      OLD.stock_consumed_at IS NULL
      AND NEW.stock_consumed_at IS NOT NULL
      AND NEW.status NOT IN ('approved', 'refunded')
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'CHECKOUT_STOCK_MARKERS_IMMUTABLE');
END;
