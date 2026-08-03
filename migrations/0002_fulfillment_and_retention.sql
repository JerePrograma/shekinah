PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS checkout_intents (
  checkout_idempotency_key TEXT PRIMARY KEY,
  fulfillment_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_fulfillment (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  delivery_method TEXT NOT NULL CHECK (
    delivery_method IN ('coordinated_pickup', 'correo_argentino')
  ),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  locality TEXT NOT NULL,
  province TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  total_weight_grams INTEGER CHECK (
    total_weight_grams IS NULL OR total_weight_grams > 0
  ),
  shipping_tier TEXT NOT NULL CHECK (
    shipping_tier IN (
      'coordinated_pickup',
      'correo_up_to_1kg',
      'correo_up_to_5kg'
    )
  ),
  products_total_minor INTEGER NOT NULL CHECK (products_total_minor > 0),
  shipping_minor INTEGER NOT NULL CHECK (shipping_minor >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (delivery_method = 'coordinated_pickup' AND shipping_tier = 'coordinated_pickup' AND shipping_minor = 0)
    OR
    (delivery_method = 'correo_argentino' AND shipping_tier IN ('correo_up_to_1kg', 'correo_up_to_5kg') AND shipping_minor > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_order_fulfillment_method
  ON order_fulfillment(delivery_method);

CREATE TABLE IF NOT EXISTS analytics_maintenance (
  task_name TEXT PRIMARY KEY,
  last_run_at TEXT NOT NULL
);
