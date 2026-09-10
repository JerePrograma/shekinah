PRAGMA foreign_keys = ON;

-- Circuito asistido y auditable:
-- solicitud web aceptada -> administrador verifica una reserva/pedido en Dux ->
-- orden cobrable -> Checkout Pro. Dux continúa siendo la autoridad de catálogo
-- e inventario y esta migración no habilita mutaciones HTTP automáticas.

ALTER TABLE orders ADD COLUMN web_request_id TEXT;
ALTER TABLE orders ADD COLUMN assisted_checkout_fingerprint TEXT
  CHECK (
    assisted_checkout_fingerprint IS NULL OR (
      length(assisted_checkout_fingerprint) = 64
      AND assisted_checkout_fingerprint NOT GLOB '*[^0-9a-f]*'
    )
  );

CREATE UNIQUE INDEX idx_orders_web_request_id
  ON orders(web_request_id) WHERE web_request_id IS NOT NULL;

ALTER TABLE dux_order_links ADD COLUMN verification_method TEXT NOT NULL DEFAULT 'legacy_blocked'
  CHECK (verification_method IN ('legacy_blocked', 'assisted_admin', 'automatic_api'));
ALTER TABLE dux_order_links ADD COLUMN verification_actor TEXT;
ALTER TABLE dux_order_links ADD COLUMN verification_note TEXT;

-- Correo Argentino puede tener una cotización final ingresada por un
-- administrador sin afirmar un peso que Dux no publica. Las filas históricas
-- conservan exactamente sus valores.
DROP INDEX IF EXISTS idx_order_fulfillment_method;
ALTER TABLE order_fulfillment RENAME TO order_fulfillment_legacy_0021;

CREATE TABLE order_fulfillment (
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
      'correo_up_to_5kg',
      'correo_manual_quote'
    )
  ),
  products_total_minor INTEGER NOT NULL CHECK (products_total_minor > 0),
  shipping_minor INTEGER NOT NULL CHECK (shipping_minor >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (delivery_method = 'coordinated_pickup'
      AND shipping_tier = 'coordinated_pickup'
      AND shipping_minor = 0)
    OR
    (delivery_method = 'correo_argentino'
      AND shipping_tier IN ('correo_up_to_1kg', 'correo_up_to_5kg')
      AND shipping_minor > 0
      AND total_weight_grams IS NOT NULL)
    OR
    (delivery_method = 'correo_argentino'
      AND shipping_tier = 'correo_manual_quote'
      AND shipping_minor > 0
      AND total_weight_grams IS NULL)
  )
);

INSERT INTO order_fulfillment (
  order_id, delivery_method, full_name, phone, address, locality, province,
  postal_code, total_weight_grams, shipping_tier, products_total_minor,
  shipping_minor, created_at, updated_at
)
SELECT order_id, delivery_method, full_name, phone, address, locality, province,
  postal_code, total_weight_grams, shipping_tier, products_total_minor,
  shipping_minor, created_at, updated_at
FROM order_fulfillment_legacy_0021;

DROP TABLE order_fulfillment_legacy_0021;
CREATE INDEX idx_order_fulfillment_method ON order_fulfillment(delivery_method);

-- 0020 bloqueaba toda conversión a orders. La única excepción permitida ahora
-- es la conversión de la misma clave/id de una solicitud ya aceptada. La orden
-- nace sin reserva local, sin preferencia y con estado financiero pendiente de
-- preparar.
DROP TRIGGER IF EXISTS orders_require_web_request_conversion;

CREATE TRIGGER web_request_checkout_order_insert_guard
BEFORE INSERT ON orders
WHEN NEW.web_request_id IS NOT NULL
  OR EXISTS (
    SELECT 1 FROM checkout_intents
    WHERE checkout_idempotency_key = NEW.checkout_idempotency_key
      AND intent_kind = 'web_request'
  )
BEGIN
  SELECT CASE WHEN NEW.web_request_id IS NULL
    OR NEW.channel <> 'checkout_pro'
    OR NEW.status <> 'preference_pending'
    OR NEW.mp_preference_id IS NOT NULL
    OR NEW.mp_checkout_url IS NOT NULL
    OR NEW.mp_preference_attempted_at IS NOT NULL
    OR NEW.mp_preference_attempt_token IS NOT NULL
    OR NEW.stock_reserved_at IS NOT NULL
    OR NEW.stock_reservation_expires_at IS NOT NULL
    OR NEW.stock_consumed_at IS NOT NULL
    OR NEW.whatsapp_fulfillment_fingerprint IS NOT NULL
    OR NEW.resolved_at IS NOT NULL
    OR NEW.resolved_by IS NOT NULL
    OR NEW.assisted_checkout_fingerprint IS NULL
    OR NEW.cart_fingerprint IS NOT NEW.assisted_checkout_fingerprint
    OR NOT EXISTS (
      SELECT 1 FROM checkout_intents AS request
      WHERE request.intent_kind = 'web_request'
        AND request.web_request_id = NEW.web_request_id
        AND request.checkout_idempotency_key = NEW.checkout_idempotency_key
        AND request.web_request_status = 'accepted'
    )
  THEN RAISE(ABORT, 'WEB_REQUEST_CONVERSION_INVALID') END;
END;

CREATE TRIGGER web_request_checkout_source_immutable
BEFORE UPDATE OF web_request_id, assisted_checkout_fingerprint ON orders
WHEN NEW.web_request_id IS NOT OLD.web_request_id
  OR NEW.assisted_checkout_fingerprint IS NOT OLD.assisted_checkout_fingerprint
BEGIN
  SELECT RAISE(ABORT, 'WEB_REQUEST_CONVERSION_IMMUTABLE');
END;

-- El guard 0013 continúa intacto para pedidos legacy. Para la conversión web,
-- la identidad ya no depende de local_product_id: el producto público es Dux y
-- se valida contra el snapshot v2 vigente y la solicitud inmutable original.
DROP TRIGGER IF EXISTS order_items_require_dux_inventory_snapshot;

CREATE TRIGGER order_items_require_dux_inventory_snapshot
BEFORE INSERT ON order_items
WHEN EXISTS (
  SELECT 1 FROM orders
  WHERE id = NEW.order_id
    AND channel IN ('checkout_pro', 'whatsapp')
    AND web_request_id IS NULL
)
  AND (
    NEW.stock_controlled <> 0
    OR NEW.provider_catalog_version IS NULL
    OR length(NEW.provider_catalog_version) <> 64
    OR NEW.provider_catalog_version GLOB '*[^0-9a-f]*'
    OR NOT EXISTS (
      SELECT 1 FROM dux_inventory_items AS dux_item
      WHERE dux_item.local_product_id = NEW.product_id
        AND dux_item.mapping_status = 'mapped'
        AND dux_item.last_sync_status = 'ok'
        AND dux_item.catalog_version = NEW.provider_catalog_version
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'DUX_INVENTORY_SNAPSHOT_REQUIRED');
END;

CREATE TRIGGER assisted_order_items_require_dux_catalog_snapshot
BEFORE INSERT ON order_items
WHEN EXISTS (
  SELECT 1 FROM orders
  WHERE id = NEW.order_id AND web_request_id IS NOT NULL
)
BEGIN
  SELECT CASE WHEN NEW.stock_controlled <> 0
    OR NEW.provider_inventory_key IS NOT NULL
    OR NEW.provider_catalog_version IS NULL
    OR length(NEW.provider_catalog_version) <> 64
    OR NEW.provider_catalog_version GLOB '*[^0-9a-f]*'
    OR NEW.sku IS NULL OR length(trim(NEW.sku)) NOT BETWEEN 1 AND 300
    OR NEW.presentation IS NOT NULL
    OR NOT EXISTS (
      SELECT 1
      FROM dux_catalog_snapshots_v2 AS snapshot,
           json_each(snapshot.payload_json, '$.items') AS item
      WHERE snapshot.id = 1
        AND snapshot.catalog_version = NEW.provider_catalog_version
        AND json_extract(item.value, '$.slug') = NEW.product_id
        AND json_extract(item.value, '$.code') = NEW.sku
        AND json_extract(item.value, '$.name') = NEW.name
        AND json_extract(item.value, '$.priceStatus') = 'usable'
        AND CAST(ROUND(json_extract(item.value, '$.priceAmount') * 100) AS INTEGER)
          = NEW.unit_price_minor
    )
    OR NOT EXISTS (
      SELECT 1
      FROM orders AS target
      INNER JOIN checkout_intents AS request
        ON request.web_request_id = target.web_request_id
       AND request.intent_kind = 'web_request'
       AND request.web_request_status = 'accepted',
      json_each(request.web_request_json, '$.lines') AS line
      WHERE target.id = NEW.order_id
        AND json_extract(line.value, '$.productId') = NEW.product_id
        AND json_extract(line.value, '$.duxCode') = NEW.sku
        AND json_extract(line.value, '$.requestedQuantity') = NEW.quantity
    )
  THEN RAISE(ABORT, 'DUX_ASSISTED_ORDER_ITEM_INVALID') END;
END;

-- Los vínculos históricos continúan fail-closed. Un vínculo asistido sólo se
-- puede crear después de materializar la orden, sus líneas y el fulfillment y
-- exige evidencia explícita del administrador y del contexto Dux verificado.
DROP TRIGGER IF EXISTS dux_order_link_requires_empty_order;

CREATE TRIGGER dux_order_link_non_assisted_requires_empty_order
BEFORE INSERT ON dux_order_links
WHEN NEW.verification_method <> 'assisted_admin'
  AND EXISTS (SELECT 1 FROM order_items WHERE order_id = NEW.order_id)
BEGIN
  SELECT RAISE(ABORT, 'DUX_ORDER_ALREADY_HAS_LOCAL_ITEMS');
END;

CREATE TRIGGER dux_order_link_assisted_guard
BEFORE INSERT ON dux_order_links
WHEN NEW.verification_method = 'assisted_admin'
BEGIN
  SELECT CASE WHEN NEW.reservation_state <> 'confirmed'
    OR NEW.dux_order_number IS NULL
    OR length(trim(NEW.dux_order_number)) NOT BETWEEN 1 AND 120
    OR (NEW.dux_order_id IS NOT NULL AND length(trim(NEW.dux_order_id)) NOT BETWEEN 1 AND 120)
    OR NEW.verification_actor IS NULL
    OR length(trim(NEW.verification_actor)) NOT BETWEEN 1 AND 512
    OR NEW.verification_note IS NULL
    OR length(trim(NEW.verification_note)) NOT BETWEEN 1 AND 1000
    OR NEW.last_error_code IS NOT NULL
    OR NEW.attempted_at IS NULL OR julianday(NEW.attempted_at) IS NULL
    OR NEW.confirmed_at IS NULL OR julianday(NEW.confirmed_at) IS NULL
    OR NEW.released_at IS NOT NULL OR NEW.finalized_at IS NOT NULL
    OR NEW.created_at IS NULL OR julianday(NEW.created_at) IS NULL
    OR NEW.updated_at IS NULL OR julianday(NEW.updated_at) IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM orders AS target
      WHERE target.id = NEW.order_id
        AND target.channel = 'checkout_pro'
        AND target.web_request_id IS NOT NULL
        AND target.status = 'preference_pending'
        AND target.mp_preference_id IS NULL
        AND target.mp_checkout_url IS NULL
        AND target.stock_reserved_at IS NULL
        AND target.stock_reservation_expires_at IS NULL
        AND target.stock_consumed_at IS NULL
        AND target.assisted_checkout_fingerprint = NEW.request_fingerprint
        AND target.cart_fingerprint = NEW.request_fingerprint
        AND NEW.dux_reference = 'shekinah:web:' || target.web_request_id
    )
    OR NOT EXISTS (
      SELECT 1 FROM dux_tenant_context AS tenant
      WHERE tenant.id = 1
        AND tenant.company_id = NEW.company_id
        AND tenant.branch_id = NEW.branch_id
        AND tenant.deposit_id = NEW.deposit_id
    )
    OR EXISTS (
      SELECT 1 FROM dux_order_links AS existing
      WHERE existing.company_id = NEW.company_id
        AND existing.branch_id = NEW.branch_id
        AND existing.dux_order_number = NEW.dux_order_number
    )
    OR EXISTS (SELECT 1 FROM payments WHERE order_id = NEW.order_id)
    OR NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = NEW.order_id)
    OR NOT EXISTS (SELECT 1 FROM order_fulfillment WHERE order_id = NEW.order_id)
    OR EXISTS (
      SELECT 1 FROM orders AS target
      WHERE target.id = NEW.order_id
        AND target.item_count <> COALESCE((
          SELECT SUM(quantity) FROM order_items WHERE order_id = target.id
        ), 0)
    )
    OR EXISTS (
      SELECT 1
      FROM orders AS target
      INNER JOIN order_fulfillment AS fulfillment ON fulfillment.order_id = target.id
      WHERE target.id = NEW.order_id
        AND (
          target.total_minor <> fulfillment.products_total_minor + fulfillment.shipping_minor
          OR fulfillment.products_total_minor <> COALESCE((
            SELECT SUM(subtotal_minor) FROM order_items WHERE order_id = target.id
          ), 0)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM orders AS target
      INNER JOIN checkout_intents AS request
        ON request.web_request_id = target.web_request_id
       AND request.intent_kind = 'web_request'
       AND request.web_request_status = 'accepted'
      INNER JOIN order_fulfillment AS fulfillment ON fulfillment.order_id = target.id
      WHERE target.id = NEW.order_id
        AND (
          fulfillment.delivery_method <> json_extract(request.web_request_json, '$.fulfillment.method')
          OR fulfillment.full_name <> json_extract(request.web_request_json, '$.fulfillment.fullName')
          OR fulfillment.phone <> json_extract(request.web_request_json, '$.fulfillment.phone')
          OR fulfillment.address <> COALESCE(json_extract(request.web_request_json, '$.fulfillment.address'), '')
          OR fulfillment.locality <> COALESCE(json_extract(request.web_request_json, '$.fulfillment.locality'), '')
          OR fulfillment.province <> COALESCE(json_extract(request.web_request_json, '$.fulfillment.province'), '')
          OR fulfillment.postal_code <> COALESCE(json_extract(request.web_request_json, '$.fulfillment.postalCode'), '')
          OR (fulfillment.delivery_method = 'coordinated_pickup'
            AND (fulfillment.shipping_tier <> 'coordinated_pickup' OR fulfillment.shipping_minor <> 0))
          OR (fulfillment.delivery_method = 'correo_argentino'
            AND (fulfillment.shipping_tier <> 'correo_manual_quote'
              OR fulfillment.shipping_minor <= 0
              OR fulfillment.total_weight_grams IS NOT NULL))
        )
    )
  THEN RAISE(ABORT, 'DUX_ASSISTED_RESERVATION_INVALID') END;
END;

CREATE TRIGGER dux_order_verification_method_immutable
BEFORE UPDATE OF verification_method ON dux_order_links
WHEN NEW.verification_method IS NOT OLD.verification_method
BEGIN
  SELECT RAISE(ABORT, 'DUX_ORDER_VERIFICATION_IMMUTABLE');
END;

CREATE TRIGGER dux_order_assisted_identity_immutable
BEFORE UPDATE OF verification_actor, verification_note, dux_reference,
  dux_order_id, dux_order_number, company_id, branch_id, deposit_id,
  request_fingerprint, attempted_at, confirmed_at, created_at
ON dux_order_links
WHEN OLD.verification_method = 'assisted_admin'
  AND (
    NEW.verification_actor IS NOT OLD.verification_actor
    OR NEW.verification_note IS NOT OLD.verification_note
    OR NEW.dux_reference IS NOT OLD.dux_reference
    OR NEW.dux_order_id IS NOT OLD.dux_order_id
    OR NEW.dux_order_number IS NOT OLD.dux_order_number
    OR NEW.company_id IS NOT OLD.company_id
    OR NEW.branch_id IS NOT OLD.branch_id
    OR NEW.deposit_id IS NOT OLD.deposit_id
    OR NEW.request_fingerprint IS NOT OLD.request_fingerprint
    OR NEW.attempted_at IS NOT OLD.attempted_at
    OR NEW.confirmed_at IS NOT OLD.confirmed_at
    OR NEW.created_at IS NOT OLD.created_at
  )
BEGIN
  SELECT RAISE(ABORT, 'DUX_ASSISTED_EVIDENCE_IMMUTABLE');
END;

CREATE TRIGGER dux_assisted_reservation_transition_guard
BEFORE UPDATE OF reservation_state ON dux_order_links
WHEN OLD.verification_method = 'assisted_admin'
  AND NEW.reservation_state IS NOT OLD.reservation_state
BEGIN
  SELECT CASE WHEN NOT (
    OLD.reservation_state = 'confirmed'
    AND (
      (NEW.reservation_state = 'released'
        AND NEW.released_at IS NOT NULL
        AND julianday(NEW.released_at) IS NOT NULL
        AND NEW.finalized_at IS NULL)
      OR
      (NEW.reservation_state = 'finalized'
        AND NEW.finalized_at IS NOT NULL
        AND julianday(NEW.finalized_at) IS NOT NULL
        AND NEW.released_at IS NULL)
    )
  ) THEN RAISE(ABORT, 'DUX_ASSISTED_RESERVATION_TRANSITION_INVALID') END;
END;

CREATE TRIGGER dux_assisted_lifecycle_evidence_guard
BEFORE UPDATE OF released_at, finalized_at ON dux_order_links
WHEN OLD.verification_method = 'assisted_admin'
  AND NEW.reservation_state IS OLD.reservation_state
  AND (
    NEW.released_at IS NOT OLD.released_at
    OR NEW.finalized_at IS NOT OLD.finalized_at
  )
BEGIN
  SELECT RAISE(ABORT, 'DUX_ASSISTED_RESERVATION_TRANSITION_INVALID');
END;

-- El ledger Dux conserva una única operación asistida por acción. El prefijo
-- distingue este circuito de cualquier futura automatización/reconciliación.
CREATE UNIQUE INDEX idx_dux_assisted_operation_once
  ON dux_order_operations(order_id, action)
  WHERE action IN ('reserve', 'release', 'finalize')
    AND idempotency_key GLOB 'assisted-*';

CREATE TRIGGER dux_assisted_reserve_operation_guard
BEFORE INSERT ON dux_order_operations
WHEN NEW.action = 'reserve'
  AND EXISTS (
    SELECT 1 FROM dux_order_links
    WHERE order_id = NEW.order_id AND verification_method = 'assisted_admin'
  )
BEGIN
  SELECT CASE WHEN NEW.status <> 'confirmed'
    OR NEW.idempotency_key <> 'assisted-reserve:' || NEW.order_id
    OR NEW.provider_operation_id IS NULL
    OR NEW.provider_operation_id <> (
      SELECT dux_order_number FROM dux_order_links WHERE order_id = NEW.order_id
    )
    OR NEW.error_code IS NOT NULL
    OR NEW.attempted_at IS NULL OR julianday(NEW.attempted_at) IS NULL
    OR NEW.confirmed_at IS NULL OR julianday(NEW.confirmed_at) IS NULL
    OR COALESCE(json_extract(NEW.request_json, '$.method'), '') <> 'assisted_admin'
    OR COALESCE(json_extract(NEW.request_json, '$.orderId'), '') <> NEW.order_id
  THEN RAISE(ABORT, 'DUX_ASSISTED_OPERATION_INVALID') END;
END;

-- La preferencia de una solicitud web sólo puede persistirse después de que la
-- evidencia de reserva y su operación confirmada ya existan. Una preferencia
-- persistida nunca se puede reemplazar ni borrar.
CREATE TRIGGER assisted_checkout_preference_guard
BEFORE UPDATE OF mp_preference_id, mp_checkout_url ON orders
WHEN OLD.web_request_id IS NOT NULL
  AND (
    NEW.mp_preference_id IS NOT OLD.mp_preference_id
    OR NEW.mp_checkout_url IS NOT OLD.mp_checkout_url
  )
BEGIN
  SELECT CASE WHEN OLD.mp_preference_id IS NOT NULL
    OR OLD.mp_checkout_url IS NOT NULL
    OR NEW.mp_preference_id IS NULL
    OR NEW.mp_checkout_url IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM dux_order_links AS link
      WHERE link.order_id = NEW.id
        AND link.verification_method = 'assisted_admin'
        AND link.reservation_state = 'confirmed'
        AND link.dux_order_number IS NOT NULL
    )
    OR NOT EXISTS (
      SELECT 1 FROM dux_order_operations AS operation
      WHERE operation.order_id = NEW.id
        AND operation.action = 'reserve'
        AND operation.status = 'confirmed'
        AND operation.idempotency_key = 'assisted-reserve:' || NEW.id
    )
  THEN RAISE(ABORT, 'DUX_ASSISTED_RESERVATION_REQUIRED') END;
END;

-- Los vínculos legacy continúan bloqueando cambios de estado. Para assisted_admin
-- el status de orders representa sólo la dimensión financiera; el estado Dux
-- permanece separado en reservation_state.
DROP TRIGGER IF EXISTS dux_order_status_lifecycle_blocked;
DROP TRIGGER IF EXISTS dux_mapped_order_status_lifecycle_blocked;

CREATE TRIGGER dux_order_status_lifecycle_blocked
BEFORE UPDATE OF status ON orders
WHEN OLD.status IS NOT NEW.status
  AND EXISTS (
    SELECT 1 FROM dux_order_links
    WHERE order_id = OLD.id AND verification_method <> 'assisted_admin'
  )
BEGIN
  SELECT RAISE(ABORT, 'DUX_ORDER_LIFECYCLE_UNAVAILABLE');
END;

CREATE TRIGGER dux_assisted_order_status_guard
BEFORE UPDATE OF status ON orders
WHEN OLD.status IS NOT NEW.status
  AND EXISTS (
    SELECT 1 FROM dux_order_links
    WHERE order_id = OLD.id AND verification_method = 'assisted_admin'
  )
BEGIN
  SELECT CASE WHEN NOT (
    (NEW.status = 'failed' AND NEW.mp_preference_id IS NULL)
    OR (
      NEW.status = 'preference_pending'
      AND OLD.status = 'failed'
      AND NEW.mp_preference_id IS NULL
      AND NEW.mp_preference_attempted_at IS NULL
      AND NEW.mp_preference_attempt_token IS NULL
    )
    OR (
      NEW.status = 'pending'
      AND NEW.mp_preference_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM payments p
        WHERE p.order_id = NEW.id
          AND p.mapped_status IN ('approved', 'refunded')
          AND p.amount_minor = NEW.total_minor
          AND p.currency = NEW.currency
          AND p.external_reference = NEW.id
      )
    )
    OR (
      EXISTS (
        SELECT 1 FROM payments p
        WHERE p.order_id = NEW.id
          AND p.amount_minor = NEW.total_minor
          AND p.currency = NEW.currency
          AND p.external_reference = NEW.id
      )
      AND NEW.status = CASE
        WHEN EXISTS (
          SELECT 1 FROM payments p WHERE p.order_id = NEW.id
            AND p.mapped_status = 'approved'
            AND p.amount_minor = NEW.total_minor
            AND p.currency = NEW.currency
            AND p.external_reference = NEW.id
        ) THEN 'approved'
        WHEN EXISTS (
          SELECT 1 FROM payments p WHERE p.order_id = NEW.id
            AND p.mapped_status = 'refunded'
            AND p.amount_minor = NEW.total_minor
            AND p.currency = NEW.currency
            AND p.external_reference = NEW.id
        ) THEN 'refunded'
        WHEN EXISTS (
          SELECT 1 FROM payments p WHERE p.order_id = NEW.id
            AND p.mapped_status = 'pending'
            AND p.amount_minor = NEW.total_minor
            AND p.currency = NEW.currency
            AND p.external_reference = NEW.id
        ) THEN 'pending'
        WHEN EXISTS (
          SELECT 1 FROM payments p WHERE p.order_id = NEW.id
            AND p.mapped_status = 'rejected'
            AND p.amount_minor = NEW.total_minor
            AND p.currency = NEW.currency
            AND p.external_reference = NEW.id
        ) THEN 'rejected'
        ELSE 'cancelled'
      END
    )
  ) THEN RAISE(ABORT, 'DUX_ASSISTED_FINANCIAL_STATE_INVALID') END;
END;

CREATE TRIGGER dux_mapped_order_status_lifecycle_blocked
BEFORE UPDATE OF status ON orders
WHEN OLD.status IS NOT NEW.status
  AND NOT EXISTS (
    SELECT 1 FROM dux_order_links
    WHERE order_id = OLD.id AND verification_method = 'assisted_admin'
  )
  AND EXISTS (
    SELECT 1
    FROM order_items AS order_line
    WHERE order_line.order_id = OLD.id
      AND EXISTS (
        SELECT 1
        FROM dux_inventory_items AS dux_item
        WHERE dux_item.local_product_id = order_line.product_id
           OR EXISTS (
             SELECT 1 FROM json_each(dux_item.mapping_candidates_json) AS candidate
             WHERE candidate.value = order_line.product_id
           )
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'DUX_ORDER_RECONCILIATION_REQUIRED');
END;
