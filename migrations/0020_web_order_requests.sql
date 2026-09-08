PRAGMA foreign_keys = ON;

-- Solicitudes previas al cobro: se reutiliza la intención existente. No es
-- inventario, una reserva Dux ni una orden financiera materializada.
ALTER TABLE checkout_intents ADD COLUMN intent_kind TEXT NOT NULL DEFAULT 'legacy'
  CHECK (intent_kind IN ('legacy', 'web_request'));
ALTER TABLE checkout_intents ADD COLUMN web_request_id TEXT;
ALTER TABLE checkout_intents ADD COLUMN web_request_token_hash TEXT;
ALTER TABLE checkout_intents ADD COLUMN web_request_owner_hash TEXT;
ALTER TABLE checkout_intents ADD COLUMN web_request_fingerprint TEXT;
ALTER TABLE checkout_intents ADD COLUMN web_request_json TEXT
  CHECK (web_request_json IS NULL OR (json_valid(web_request_json) AND length(web_request_json) <= 65536));
ALTER TABLE checkout_intents ADD COLUMN web_request_status TEXT
  CHECK (web_request_status IS NULL OR web_request_status IN ('submitted', 'accepted', 'rejected'));
ALTER TABLE checkout_intents ADD COLUMN web_request_updated_at TEXT;
ALTER TABLE checkout_intents ADD COLUMN web_request_resolved_at TEXT;
ALTER TABLE checkout_intents ADD COLUMN web_request_resolved_by TEXT;

CREATE UNIQUE INDEX idx_web_request_id ON checkout_intents(web_request_id)
  WHERE web_request_id IS NOT NULL;
CREATE UNIQUE INDEX idx_web_request_token ON checkout_intents(web_request_token_hash)
  WHERE web_request_token_hash IS NOT NULL;
CREATE INDEX idx_web_request_status ON checkout_intents(intent_kind, web_request_status, created_at);

CREATE TRIGGER web_request_initial_guard BEFORE INSERT ON checkout_intents
WHEN NEW.intent_kind = 'web_request'
BEGIN
  SELECT CASE WHEN NEW.web_request_id IS NULL OR NEW.web_request_id NOT GLOB 'req_*'
    OR NEW.web_request_token_hash IS NULL OR length(NEW.web_request_token_hash) <> 64
    OR NEW.web_request_token_hash GLOB '*[^0-9a-f]*'
    OR NEW.web_request_owner_hash IS NULL OR length(NEW.web_request_owner_hash) <> 64
    OR NEW.web_request_owner_hash GLOB '*[^0-9a-f]*'
    OR NEW.web_request_fingerprint IS NULL OR length(NEW.web_request_fingerprint) <> 64
    OR NEW.web_request_fingerprint GLOB '*[^0-9a-f]*'
    OR NEW.cart_fingerprint IS NULL OR NEW.web_request_json IS NULL
    OR COALESCE(json_extract(NEW.web_request_json, '$.schemaVersion'), 0) <> 1
    OR NEW.web_request_status IS NOT 'submitted'
    OR NEW.web_request_resolved_at IS NOT NULL OR NEW.web_request_resolved_by IS NOT NULL
    OR NEW.web_request_updated_at IS NULL OR julianday(NEW.web_request_updated_at) IS NULL
  THEN RAISE(ABORT, 'WEB_REQUEST_INVALID') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM orders WHERE checkout_idempotency_key = NEW.checkout_idempotency_key
  ) THEN RAISE(ABORT, 'WEB_REQUEST_KEY_CONFLICT') END;
END;

CREATE TRIGGER checkout_intent_kind_immutable BEFORE UPDATE OF intent_kind ON checkout_intents
WHEN NEW.intent_kind IS NOT OLD.intent_kind
BEGIN SELECT RAISE(ABORT, 'WEB_REQUEST_IMMUTABLE'); END;

CREATE TRIGGER web_request_snapshot_immutable BEFORE UPDATE ON checkout_intents
WHEN OLD.intent_kind = 'web_request' AND (
  NEW.checkout_idempotency_key IS NOT OLD.checkout_idempotency_key
  OR NEW.fulfillment_fingerprint IS NOT OLD.fulfillment_fingerprint
  OR NEW.cart_fingerprint IS NOT OLD.cart_fingerprint OR NEW.created_at IS NOT OLD.created_at
  OR NEW.web_request_id IS NOT OLD.web_request_id
  OR NEW.web_request_token_hash IS NOT OLD.web_request_token_hash
  OR NEW.web_request_owner_hash IS NOT OLD.web_request_owner_hash
  OR NEW.web_request_fingerprint IS NOT OLD.web_request_fingerprint
  OR NEW.web_request_json IS NOT OLD.web_request_json
)
BEGIN SELECT RAISE(ABORT, 'WEB_REQUEST_IMMUTABLE'); END;

CREATE TRIGGER web_request_resolution_guard BEFORE UPDATE ON checkout_intents
WHEN OLD.intent_kind = 'web_request' AND (
  NEW.web_request_status IS NOT OLD.web_request_status
  OR NEW.web_request_resolved_by IS NOT OLD.web_request_resolved_by
  OR NEW.web_request_resolved_at IS NOT OLD.web_request_resolved_at
  OR NEW.web_request_updated_at IS NOT OLD.web_request_updated_at
)
BEGIN
  SELECT CASE WHEN OLD.web_request_status IS NOT 'submitted'
    OR NEW.web_request_status NOT IN ('accepted', 'rejected')
    OR NEW.web_request_status IS NULL
    OR NEW.web_request_resolved_by IS NULL OR length(trim(NEW.web_request_resolved_by)) = 0
    OR NEW.web_request_resolved_at IS NULL OR julianday(NEW.web_request_resolved_at) IS NULL
    OR NEW.web_request_updated_at IS NOT NEW.web_request_resolved_at
  THEN RAISE(ABORT, 'WEB_REQUEST_STATE_CONFLICT') END;
END;

CREATE TRIGGER web_request_preserve_history BEFORE DELETE ON checkout_intents
WHEN OLD.intent_kind = 'web_request'
BEGIN SELECT RAISE(ABORT, 'WEB_REQUEST_HISTORY_REQUIRED'); END;

-- La conversión a pedido cobrable requiere un coordinador posterior y no puede
-- producirse accidentalmente desde el checkout o el canal WhatsApp anterior.
CREATE TRIGGER orders_require_web_request_conversion BEFORE INSERT ON orders
WHEN EXISTS (SELECT 1 FROM checkout_intents
  WHERE checkout_idempotency_key = NEW.checkout_idempotency_key AND intent_kind = 'web_request')
BEGIN SELECT RAISE(ABORT, 'WEB_REQUEST_CONVERSION_REQUIRED'); END;

-- Contadores de protección, separados de los libros de pedidos y operaciones.
-- No guardan IP en claro, datos de entrega ni credenciales.
CREATE TABLE commerce_request_rate_limits (
  scope_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL,
  limit_count INTEGER NOT NULL CHECK (limit_count BETWEEN 1 AND 5000),
  updated_at INTEGER NOT NULL,
  CONSTRAINT commerce_request_limit CHECK (request_count BETWEEN 1 AND limit_count)
);
CREATE INDEX idx_commerce_request_limits_updated ON commerce_request_rate_limits(updated_at);
