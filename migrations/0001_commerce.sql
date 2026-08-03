PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  public_token_hash TEXT NOT NULL UNIQUE,
  checkout_idempotency_key TEXT NOT NULL UNIQUE,
  cart_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'preference_pending',
      'pending',
      'approved',
      'rejected',
      'cancelled',
      'refunded',
      'failed'
    )
  ),
  currency TEXT NOT NULL CHECK (currency = 'ARS'),
  total_minor INTEGER NOT NULL CHECK (total_minor > 0),
  item_count INTEGER NOT NULL CHECK (item_count > 0),
  mp_preference_id TEXT UNIQUE,
  mp_checkout_url TEXT,
  mp_preference_attempted_at TEXT,
  mp_preference_attempt_token TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created
  ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  presentation TEXT,
  sku TEXT,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor > 0),
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor > 0),
  PRIMARY KEY (order_id, product_id)
);

CREATE TABLE IF NOT EXISTS payments (
  provider_payment_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  mapped_status TEXT NOT NULL CHECK (
    mapped_status IN ('pending', 'approved', 'rejected', 'cancelled', 'refunded')
  ),
  provider_status TEXT NOT NULL,
  status_detail TEXT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL,
  external_reference TEXT NOT NULL,
  approved_at TEXT,
  provider_updated_at TEXT,
  last_event_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_order
  ON payments(order_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL CHECK (provider = 'mercadopago'),
  provider_event_key TEXT NOT NULL UNIQUE,
  request_id TEXT,
  event_type TEXT NOT NULL,
  action TEXT,
  resource_id TEXT NOT NULL,
  signature_ts TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'ignored', 'failed')),
  processing_owner TEXT,
  processing_started_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  response_code INTEGER,
  error_code TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_payment_events_received
  ON payment_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_processing
  ON payment_events(status, processing_started_at);

CREATE TABLE IF NOT EXISTS analytics_revocations (
  session_hash TEXT PRIMARY KEY,
  revoked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_revocations_revoked
  ON analytics_revocations(revoked_at DESC);

CREATE TABLE IF NOT EXISTS analytics_sessions (
  session_hash TEXT PRIMARY KEY,
  consent_version TEXT NOT NULL CHECK (consent_version = '1'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL REFERENCES analytics_sessions(session_hash) ON DELETE CASCADE,
  event_name TEXT NOT NULL CHECK (
    event_name IN (
      'page_view',
      'product_view',
      'cart_add',
      'cart_remove',
      'checkout_start',
      'checkout_redirect',
      'whatsapp_open',
      'consent_granted'
    )
  ),
  path TEXT NOT NULL,
  product_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('direct', 'referral', 'campaign', 'unknown')),
  device_class TEXT NOT NULL CHECK (device_class IN ('mobile', 'tablet', 'desktop', 'unknown')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created
  ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created
  ON analytics_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_product
  ON analytics_events(product_id, event_name, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY,
  actor_sub TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  request_id TEXT,
  outcome_status INTEGER NOT NULL,
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON admin_audit(created_at DESC);
