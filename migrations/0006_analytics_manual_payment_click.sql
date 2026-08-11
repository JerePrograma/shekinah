PRAGMA defer_foreign_keys = ON;

CREATE TABLE analytics_events_v2 (
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
      'manual_payment_click',
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

INSERT INTO analytics_events_v2 (
  id, session_hash, event_name, path, product_id, source, device_class, created_at
)
SELECT
  id, session_hash, event_name, path, product_id, source, device_class, created_at
FROM analytics_events;

DROP TABLE analytics_events;
ALTER TABLE analytics_events_v2 RENAME TO analytics_events;

CREATE INDEX idx_analytics_events_created
  ON analytics_events(created_at DESC);
CREATE INDEX idx_analytics_events_name_created
  ON analytics_events(event_name, created_at DESC);
CREATE INDEX idx_analytics_events_product
  ON analytics_events(product_id, event_name, created_at DESC);
