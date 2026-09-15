PRAGMA foreign_keys = ON;

-- Compra directa autorizada expresamente el 2026-09-15. Se mantiene la
-- preparación asistida y no se altera ninguna migración aplicada.
-- El acceso al token Dux se coordina entre checkout y reconciliación para
-- preservar el límite del proveedor de una petición cada cinco segundos.
CREATE TABLE dux_api_request_gate (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_request_at_ms INTEGER NOT NULL CHECK (next_request_at_ms >= 0)
);
INSERT INTO dux_api_request_gate (id, next_request_at_ms) VALUES (1, 0);



-- DIRECT CHECKOUT GUARDS
-- El claim precede a la cotización y al POST. No se libera automáticamente un
-- intento incierto ni se interpreta la antigüedad como permiso para otro POST.
ALTER TABLE checkout_intents ADD COLUMN direct_checkout_state TEXT
  CHECK (direct_checkout_state IS NULL OR direct_checkout_state IN ('preparing', 'uncertain', 'prepared', 'failed', 'requires_review'));
ALTER TABLE checkout_intents ADD COLUMN direct_checkout_claim_token TEXT;
ALTER TABLE checkout_intents ADD COLUMN direct_checkout_updated_at TEXT;
ALTER TABLE checkout_intents ADD COLUMN direct_checkout_error_code TEXT;
ALTER TABLE checkout_intents ADD COLUMN direct_checkout_lease_until_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE checkout_intents ADD COLUMN direct_checkout_progress_json TEXT CHECK (direct_checkout_progress_json IS NULL OR json_valid(direct_checkout_progress_json));
CREATE INDEX idx_direct_checkout_preparation ON checkout_intents (direct_checkout_updated_at)
  WHERE direct_checkout_state IN ('preparing', 'uncertain');
CREATE UNIQUE INDEX idx_dux_verified_order_number_unique
  ON dux_order_links(company_id, branch_id, dux_order_number)
  WHERE verification_method IN ('assisted_admin', 'automatic_api') AND dux_order_number IS NOT NULL;

DROP TRIGGER dux_order_items_lifecycle_blocked;
CREATE TRIGGER dux_order_items_lifecycle_blocked
BEFORE INSERT ON order_items
WHEN EXISTS (SELECT 1 FROM dux_order_links WHERE order_id = NEW.order_id AND verification_method <> 'automatic_api')
BEGIN
  SELECT RAISE(ABORT, 'DUX_ORDER_LIFECYCLE_UNAVAILABLE');
END;

CREATE TRIGGER dux_automatic_link_initial_guard
BEFORE INSERT ON dux_order_links
WHEN NEW.verification_method = 'automatic_api'
BEGIN
  SELECT CASE WHEN NEW.reservation_state <> 'not_attempted'
    OR NEW.dux_order_id IS NOT NULL OR NEW.dux_order_number IS NOT NULL
    OR NEW.attempted_at IS NOT NULL OR NEW.confirmed_at IS NOT NULL
    OR NEW.released_at IS NOT NULL OR NEW.finalized_at IS NOT NULL
    OR NEW.verification_actor IS NOT 'system:direct_checkout'
    OR NEW.last_error_code IS NOT NULL
    OR NOT EXISTS (
      SELECT 1 FROM orders o JOIN checkout_intents r ON r.web_request_id = o.web_request_id
      JOIN dux_tenant_context tenant ON tenant.id = 1
      WHERE o.id = NEW.order_id AND o.channel = 'checkout_pro'
        AND o.status = 'preference_pending' AND o.mp_preference_attempted_at IS NULL
        AND o.mp_preference_id IS NULL AND o.mp_checkout_url IS NULL
        AND o.cart_fingerprint = NEW.request_fingerprint
        AND r.intent_kind = 'web_request' AND r.web_request_status = 'accepted'
        AND r.direct_checkout_state = 'preparing'
        AND length(r.direct_checkout_claim_token) = 64
        AND NEW.dux_reference = 'shekinah:web:' || r.web_request_id
        AND tenant.company_id = NEW.company_id AND tenant.branch_id = NEW.branch_id
        AND tenant.deposit_id = NEW.deposit_id
    ) THEN RAISE(ABORT, 'DUX_AUTOMATIC_LINK_INVALID') END;
END;

CREATE TRIGGER dux_automatic_reserve_initial_guard
BEFORE INSERT ON dux_order_operations
WHEN NEW.action = 'reserve' AND EXISTS (
  SELECT 1 FROM dux_order_links WHERE order_id = NEW.order_id AND verification_method = 'automatic_api'
)
BEGIN
  SELECT CASE WHEN NEW.idempotency_key IS NOT 'automatic-reserve:' || NEW.order_id
    OR NEW.status <> 'pending' OR NEW.attempted_at IS NOT NULL OR NEW.confirmed_at IS NOT NULL
    OR NEW.provider_operation_id IS NOT NULL OR NEW.response_json IS NOT NULL
    OR json_extract(NEW.request_json, '$.method') IS NOT 'automatic_api'
    OR json_extract(NEW.request_json, '$.orderId') IS NOT NEW.order_id
    OR json_extract(NEW.request_json, '$.action') IS NOT 'reserve'
    OR NOT EXISTS (SELECT 1 FROM dux_order_links link WHERE link.order_id = NEW.order_id
      AND link.reservation_state = 'not_attempted'
      AND json_extract(NEW.request_json, '$.providerRequest.referencia') = link.dux_reference
      AND CAST(json_extract(NEW.request_json, '$.providerRequest.id_empresa') AS TEXT) = link.company_id
      AND CAST(json_extract(NEW.request_json, '$.providerRequest.id_sucursal') AS TEXT) = link.branch_id
      AND CAST(json_extract(NEW.request_json, '$.providerRequest.id_deposito') AS TEXT) = link.deposit_id
    ) THEN RAISE(ABORT, 'DUX_AUTOMATIC_OPERATION_INVALID') END;
END;

CREATE TRIGGER dux_automatic_order_items_guard
BEFORE INSERT ON order_items
WHEN EXISTS (SELECT 1 FROM dux_order_links WHERE order_id = NEW.order_id AND verification_method = 'automatic_api')
BEGIN
  SELECT CASE WHEN NEW.stock_controlled <> 0 OR NEW.provider_inventory_key IS NOT NULL
    OR NEW.presentation IS NOT NULL
    OR NOT EXISTS (
      SELECT 1 FROM dux_order_links link
      JOIN dux_order_operations op ON op.order_id = link.order_id
      JOIN orders target ON target.id = link.order_id
      JOIN checkout_intents request ON request.web_request_id = target.web_request_id,
      json_each(op.request_json, '$.quote.lines') quoted,
      json_each(request.web_request_json, '$.lines') requested
      WHERE link.order_id = NEW.order_id AND link.reservation_state = 'not_attempted'
        AND op.idempotency_key = 'automatic-reserve:' || NEW.order_id
        AND op.status = 'pending' AND op.attempted_at IS NULL
        AND json_extract(quoted.value, '$.productId') = NEW.product_id
        AND json_extract(quoted.value, '$.code') = NEW.sku
        AND json_extract(quoted.value, '$.name') = NEW.name
        AND json_extract(quoted.value, '$.quantity') = NEW.quantity
        AND json_extract(quoted.value, '$.unitPriceMinor') = NEW.unit_price_minor
        AND NEW.subtotal_minor = NEW.quantity * NEW.unit_price_minor
        AND CAST(json_extract(quoted.value, '$.stockBefore.availableStock') AS INTEGER) >= NEW.quantity
        AND json_extract(op.request_json, '$.quote.catalogVersion') = NEW.provider_catalog_version
        AND length(NEW.provider_catalog_version) = 64
        AND NEW.provider_catalog_version NOT GLOB '*[^0-9a-f]*'
        AND json_extract(requested.value, '$.productId') = NEW.product_id
        AND json_extract(requested.value, '$.duxCode') = NEW.sku
        AND json_extract(requested.value, '$.requestedQuantity') = NEW.quantity
    ) THEN RAISE(ABORT, 'DUX_AUTOMATIC_ORDER_ITEM_INVALID') END;
END;

CREATE TRIGGER dux_automatic_request_immutable
BEFORE UPDATE OF request_json, idempotency_key, order_id, action ON dux_order_operations
WHEN OLD.idempotency_key GLOB 'automatic-reserve:*' AND (
  NEW.request_json IS NOT OLD.request_json OR NEW.idempotency_key IS NOT OLD.idempotency_key
  OR NEW.order_id IS NOT OLD.order_id OR NEW.action IS NOT OLD.action
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_AUTOMATIC_REQUEST_IMMUTABLE');
END;

CREATE TRIGGER dux_automatic_reserve_confirm_guard
BEFORE UPDATE OF status ON dux_order_operations
WHEN OLD.idempotency_key GLOB 'automatic-reserve:*' AND NEW.status = 'confirmed'
BEGIN
  SELECT CASE WHEN OLD.status NOT IN ('pending', 'uncertain')
    OR OLD.attempted_at IS NULL OR julianday(OLD.attempted_at) IS NULL
    OR NEW.attempted_at IS NOT OLD.attempted_at
    OR NEW.confirmed_at IS NULL OR julianday(NEW.confirmed_at) IS NULL
    OR NEW.provider_operation_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM dux_order_links link
      JOIN orders target ON target.id = link.order_id
      JOIN order_fulfillment f ON f.order_id = target.id
      WHERE link.order_id = NEW.order_id AND link.verification_method = 'automatic_api'
        AND link.reservation_state IN ('pending', 'uncertain')
        AND CAST(json_extract(NEW.response_json, '$.order.id') AS TEXT) = NEW.provider_operation_id
        AND json_extract(NEW.response_json, '$.order.reference') = link.dux_reference
        AND json_extract(NEW.response_json, '$.order.cancelled') = 0
        AND CAST(json_extract(NEW.response_json, '$.order.companyId') AS TEXT) = link.company_id
        AND CAST(json_extract(NEW.response_json, '$.order.branchId') AS TEXT) = link.branch_id
        AND json_extract(NEW.response_json, '$.order.totalMinor') = f.products_total_minor
        AND target.total_minor = f.products_total_minor + f.shipping_minor
        AND target.item_count = (SELECT SUM(quantity) FROM order_items WHERE order_id = target.id)
        AND f.products_total_minor = (SELECT SUM(subtotal_minor) FROM order_items WHERE order_id = target.id)
        AND json_array_length(NEW.response_json, '$.order.lines') = json_array_length(OLD.request_json, '$.providerRequest.items')
        AND json_array_length(OLD.request_json, '$.quote.lines') = (SELECT COUNT(*) FROM order_items WHERE order_id = target.id)
        AND NOT EXISTS (
          SELECT 1 FROM json_each(OLD.request_json, '$.providerRequest.items') expected
          WHERE (SELECT COUNT(*) FROM json_each(NEW.response_json, '$.order.lines') actual
            WHERE json_extract(actual.value, '$.code') = json_extract(expected.value, '$.cod_item')
              AND json_extract(actual.value, '$.variantId') IS NULL
              AND json_extract(actual.value, '$.quantity') = json_extract(expected.value, '$.ctd')
              AND ABS(json_extract(actual.value, '$.unitPrice') - json_extract(expected.value, '$.precio_uni')) < 0.00000001
              AND json_extract(actual.value, '$.vatPercent') = json_extract(expected.value, '$.porc_iva')
              AND json_extract(actual.value, '$.discountPercent') = 0) <> 1
        )
        AND json_array_length(NEW.response_json, '$.stockAfter') = (SELECT COUNT(*) FROM order_items WHERE order_id = target.id)
        AND NOT EXISTS (
          SELECT 1 FROM json_each(OLD.request_json, '$.quote.lines') quoted
          WHERE NOT EXISTS (
            SELECT 1 FROM json_each(NEW.response_json, '$.stockAfter') observed
            WHERE json_extract(observed.value, '$.code') = json_extract(quoted.value, '$.code')
              AND json_extract(observed.value, '$.availableStock') >= 0
              AND json_extract(observed.value, '$.realStock') = json_extract(quoted.value, '$.stockBefore.realStock')
              AND json_extract(observed.value, '$.reservedStock') >= json_extract(quoted.value, '$.stockBefore.reservedStock') + json_extract(quoted.value, '$.quantity')
              AND json_extract(observed.value, '$.availableStock') <= json_extract(quoted.value, '$.stockBefore.availableStock') - json_extract(quoted.value, '$.quantity')
          )
        )
    ) THEN RAISE(ABORT, 'DUX_AUTOMATIC_RESERVATION_EVIDENCE_REQUIRED') END;
END;

CREATE TRIGGER dux_automatic_attempt_immutable
BEFORE UPDATE OF attempted_at, status ON dux_order_operations
WHEN OLD.idempotency_key GLOB 'automatic-reserve:*'
BEGIN
  SELECT CASE WHEN
    (OLD.attempted_at IS NOT NULL AND NEW.attempted_at IS NOT OLD.attempted_at)
    OR (NEW.attempted_at IS NOT NULL AND julianday(NEW.attempted_at) IS NULL)
    OR (NEW.status NOT IN ('pending', 'uncertain', 'confirmed'))
    OR (OLD.status = 'uncertain' AND NEW.status = 'pending')
    OR (OLD.attempted_at IS NULL AND NEW.attempted_at IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM orders o JOIN order_fulfillment f ON f.order_id = o.id
      JOIN checkout_intents r ON r.web_request_id = o.web_request_id
      WHERE o.id = NEW.order_id AND o.mp_preference_attempted_at IS NULL
        AND o.total_minor = f.products_total_minor AND f.shipping_minor = 0
        AND f.delivery_method = 'coordinated_pickup' AND f.shipping_tier = 'coordinated_pickup'
        AND f.full_name = json_extract(r.web_request_json, '$.fulfillment.fullName')
        AND f.phone = json_extract(r.web_request_json, '$.fulfillment.phone')
        AND json_extract(r.web_request_json, '$.fulfillment.method') = 'coordinated_pickup'
        AND o.item_count = (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id)
        AND f.products_total_minor = (SELECT SUM(subtotal_minor) FROM order_items WHERE order_id = o.id)
        AND json_array_length(OLD.request_json, '$.providerRequest.items') = (SELECT COUNT(*) FROM order_items WHERE order_id = o.id)
        AND NOT EXISTS (
          SELECT 1 FROM order_items item WHERE item.order_id = o.id AND NOT EXISTS (
            SELECT 1 FROM json_each(OLD.request_json, '$.providerRequest.items') provider
            WHERE json_extract(provider.value, '$.cod_item') = item.sku
              AND json_extract(provider.value, '$.ctd') = item.quantity
              AND json_extract(provider.value, '$.porc_desc') = 0
              AND CAST(ROUND(json_extract(provider.value, '$.precio_uni') *
                (1 + json_extract(provider.value, '$.porc_iva') / 100.0) * 100) AS INTEGER) = item.unit_price_minor
          )
        )
    ))
  THEN RAISE(ABORT, 'DUX_AUTOMATIC_ATTEMPT_INVALID') END;
END;

CREATE TRIGGER dux_automatic_operation_preserve_history
BEFORE DELETE ON dux_order_operations
WHEN OLD.idempotency_key GLOB 'automatic-reserve:*'
BEGIN
  SELECT RAISE(ABORT, 'DUX_AUTOMATIC_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER dux_automatic_confirmed_operation_immutable
BEFORE UPDATE ON dux_order_operations
WHEN OLD.idempotency_key GLOB 'automatic-reserve:*' AND OLD.status = 'confirmed'
BEGIN
  SELECT RAISE(ABORT, 'DUX_AUTOMATIC_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER dux_automatic_link_identity_guard
BEFORE UPDATE ON dux_order_links
WHEN OLD.verification_method = 'automatic_api' AND (
  NEW.dux_reference IS NOT OLD.dux_reference OR NEW.company_id IS NOT OLD.company_id
  OR NEW.branch_id IS NOT OLD.branch_id OR NEW.deposit_id IS NOT OLD.deposit_id
  OR NEW.request_fingerprint IS NOT OLD.request_fingerprint OR NEW.created_at IS NOT OLD.created_at
  OR NEW.verification_actor IS NOT OLD.verification_actor OR NEW.verification_note IS NOT OLD.verification_note
  OR (OLD.attempted_at IS NOT NULL AND NEW.attempted_at IS NOT OLD.attempted_at)
  OR (NEW.reservation_state = OLD.reservation_state AND (NEW.dux_order_id IS NOT OLD.dux_order_id
    OR NEW.dux_order_number IS NOT OLD.dux_order_number OR NEW.confirmed_at IS NOT OLD.confirmed_at
    OR NEW.attempted_at IS NOT OLD.attempted_at))
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_AUTOMATIC_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER dux_automatic_reservation_transition_guard
BEFORE UPDATE OF reservation_state ON dux_order_links
WHEN OLD.verification_method = 'automatic_api' AND NEW.reservation_state IS NOT OLD.reservation_state
  AND OLD.reservation_state <> 'confirmed'
BEGIN
  SELECT CASE WHEN NOT (
    (OLD.reservation_state = 'not_attempted' AND NEW.reservation_state = 'pending'
      AND NEW.attempted_at IS NOT NULL AND julianday(NEW.attempted_at) IS NOT NULL
      AND EXISTS (SELECT 1 FROM dux_order_operations op WHERE op.order_id = NEW.order_id
        AND op.idempotency_key = 'automatic-reserve:' || NEW.order_id AND op.status = 'pending'
        AND op.attempted_at = NEW.attempted_at))
    OR (OLD.reservation_state = 'pending' AND NEW.reservation_state = 'uncertain')
    OR (OLD.reservation_state IN ('pending', 'uncertain') AND NEW.reservation_state = 'confirmed'
      AND NEW.confirmed_at IS NOT NULL AND julianday(NEW.confirmed_at) IS NOT NULL
      AND EXISTS (SELECT 1 FROM dux_order_operations op WHERE op.order_id = NEW.order_id
        AND op.idempotency_key = 'automatic-reserve:' || NEW.order_id AND op.status = 'confirmed'
        AND op.confirmed_at = NEW.confirmed_at
        AND op.provider_operation_id = NEW.dux_order_id
        AND CAST(json_extract(op.response_json, '$.order.number') AS TEXT) = NEW.dux_order_number))
  ) THEN RAISE(ABORT, 'DUX_AUTOMATIC_RESERVATION_TRANSITION_INVALID') END;
END;


DROP TRIGGER assisted_order_items_require_dux_catalog_snapshot;
CREATE TRIGGER assisted_order_items_require_dux_catalog_snapshot
BEFORE INSERT ON order_items
WHEN EXISTS (
  SELECT 1 FROM orders
  WHERE id = NEW.order_id AND web_request_id IS NOT NULL
)
  AND NOT EXISTS (SELECT 1 FROM dux_order_links WHERE order_id = NEW.order_id AND verification_method = 'automatic_api')
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

DROP TRIGGER dux_order_status_lifecycle_blocked;
CREATE TRIGGER dux_order_status_lifecycle_blocked
BEFORE UPDATE OF status ON orders
WHEN OLD.status IS NOT NEW.status
  AND EXISTS (
    SELECT 1 FROM dux_order_links
    WHERE order_id = OLD.id AND verification_method NOT IN ('assisted_admin', 'automatic_api')
  )
BEGIN
  SELECT RAISE(ABORT, 'DUX_ORDER_LIFECYCLE_UNAVAILABLE');
END;

CREATE TRIGGER dux_automatic_order_status_guard
BEFORE UPDATE OF status ON orders
WHEN OLD.status IS NOT NEW.status
  AND EXISTS (
    SELECT 1 FROM dux_order_links
    WHERE order_id = OLD.id AND verification_method = 'automatic_api'
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

DROP TRIGGER assisted_checkout_preference_guard;
CREATE TRIGGER assisted_checkout_preference_guard
BEFORE UPDATE OF mp_preference_id, mp_checkout_url ON orders
WHEN OLD.web_request_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dux_order_links WHERE order_id = OLD.id AND verification_method = 'automatic_api')
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

CREATE TRIGGER automatic_checkout_preference_guard
BEFORE UPDATE OF mp_preference_id, mp_checkout_url ON orders
WHEN OLD.web_request_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM dux_order_links WHERE order_id = OLD.id AND verification_method = 'automatic_api')
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
        AND link.verification_method = 'automatic_api'
        AND link.reservation_state = 'confirmed'
        AND link.dux_order_number IS NOT NULL
    )
    OR NOT EXISTS (
      SELECT 1 FROM dux_order_operations AS operation
      WHERE operation.order_id = NEW.id
        AND operation.action = 'reserve'
        AND operation.status = 'confirmed'
        AND operation.idempotency_key = 'automatic-reserve:' || NEW.id
    )
  THEN RAISE(ABORT, 'DUX_ASSISTED_RESERVATION_REQUIRED') END;
END;

CREATE TRIGGER dux_automatic_lifecycle_operation_guard
BEFORE INSERT ON dux_order_operations
WHEN NEW.action IN ('release', 'finalize')
  AND EXISTS (
    SELECT 1 FROM dux_order_links
    WHERE order_id = NEW.order_id AND verification_method = 'automatic_api'
  )
BEGIN
  SELECT CASE WHEN NEW.status <> 'confirmed'
    OR NEW.idempotency_key <> 'assisted-' || NEW.action || ':' || NEW.order_id
    OR NEW.provider_operation_id IS NULL
    OR NEW.provider_operation_id <> (
      SELECT dux_order_number FROM dux_order_links WHERE order_id = NEW.order_id
    )
    OR NEW.error_code IS NOT NULL
    OR NEW.attempted_at IS NULL OR julianday(NEW.attempted_at) IS NULL
    OR NEW.confirmed_at IS NULL OR julianday(NEW.confirmed_at) IS NULL
    OR COALESCE(json_extract(NEW.request_json, '$.method'), '') <> 'assisted_admin'
    OR COALESCE(json_extract(NEW.request_json, '$.orderId'), '') <> NEW.order_id
    OR COALESCE(json_extract(NEW.request_json, '$.action'), '') <> NEW.action
  THEN RAISE(ABORT, 'DUX_ASSISTED_OPERATION_INVALID') END;
END;

CREATE TRIGGER dux_automatic_lifecycle_evidence_guard
BEFORE UPDATE OF released_at, finalized_at ON dux_order_links
WHEN OLD.verification_method = 'automatic_api'
  AND NEW.reservation_state IS OLD.reservation_state
  AND (
    NEW.released_at IS NOT OLD.released_at
    OR NEW.finalized_at IS NOT OLD.finalized_at
  )
BEGIN
  SELECT RAISE(ABORT, 'DUX_ASSISTED_RESERVATION_TRANSITION_INVALID');
END;

CREATE TRIGGER dux_automatic_fulfillment_transition_guard
BEFORE UPDATE OF reservation_state ON dux_order_links
WHEN OLD.verification_method = 'automatic_api' AND OLD.reservation_state = 'confirmed'
  AND NEW.reservation_state IS NOT OLD.reservation_state
BEGIN
  SELECT CASE WHEN NOT (
    OLD.reservation_state = 'confirmed'
    AND (
      (NEW.reservation_state = 'released'
        AND NEW.released_at IS NOT NULL
        AND julianday(NEW.released_at) IS NOT NULL
        AND NEW.finalized_at IS NULL
        AND EXISTS (
          SELECT 1 FROM dux_order_operations AS operation
          WHERE operation.order_id = NEW.order_id
            AND operation.action = 'release'
            AND operation.status = 'confirmed'
            AND operation.idempotency_key = 'assisted-release:' || NEW.order_id
        ))
      OR
      (NEW.reservation_state = 'finalized'
        AND NEW.finalized_at IS NOT NULL
        AND julianday(NEW.finalized_at) IS NOT NULL
        AND NEW.released_at IS NULL
        AND EXISTS (
          SELECT 1 FROM dux_order_operations AS operation
          WHERE operation.order_id = NEW.order_id
            AND operation.action = 'finalize'
            AND operation.status = 'confirmed'
            AND operation.idempotency_key = 'assisted-finalize:' || NEW.order_id
        ))
    )
  ) THEN RAISE(ABORT, 'DUX_ASSISTED_RESERVATION_TRANSITION_INVALID') END;
END;

CREATE TRIGGER dux_order_automatic_identity_immutable
BEFORE UPDATE OF verification_actor, verification_note, dux_reference,
  dux_order_id, dux_order_number, company_id, branch_id, deposit_id,
  request_fingerprint, attempted_at, confirmed_at, created_at
ON dux_order_links
WHEN OLD.verification_method = 'automatic_api' AND OLD.reservation_state IN ('confirmed', 'released', 'finalized')
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

CREATE TRIGGER dux_automatic_release_financial_guard
BEFORE INSERT ON dux_order_operations
WHEN NEW.action = 'release'
  AND EXISTS (
    SELECT 1 FROM dux_order_links
    WHERE order_id = NEW.order_id AND verification_method = 'automatic_api'
  )
BEGIN
  SELECT CASE WHEN
    EXISTS (
      SELECT 1 FROM payments AS payment
      INNER JOIN orders AS target ON target.id = payment.order_id
      WHERE payment.order_id = NEW.order_id
        AND (
          payment.amount_minor <> target.total_minor
          OR payment.currency <> target.currency
          OR payment.external_reference <> target.id
        )
    )
    OR EXISTS (
      SELECT 1 FROM payments AS payment
      INNER JOIN orders AS target ON target.id = payment.order_id
      WHERE payment.order_id = NEW.order_id
        AND payment.amount_minor = target.total_minor
        AND payment.currency = target.currency
        AND payment.external_reference = target.id
        AND payment.mapped_status IN ('approved', 'pending')
    )
    OR EXISTS (
      SELECT 1 FROM orders AS target
      WHERE target.id = NEW.order_id
        AND target.mp_preference_attempted_at IS NOT NULL
        AND (
          julianday(NEW.attempted_at) < julianday(target.mp_preference_attempted_at, '+30 minutes')
          OR json_extract(NEW.request_json, '$.paymentReconciledAt') IS NULL
          OR julianday(json_extract(NEW.request_json, '$.paymentReconciledAt')) IS NULL
          OR julianday(json_extract(NEW.request_json, '$.paymentReconciledAt')) > julianday(NEW.attempted_at)
          OR julianday(NEW.attempted_at) - julianday(json_extract(NEW.request_json, '$.paymentReconciledAt')) > (2.0 / 1440.0)
        )
    )
  THEN RAISE(ABORT, 'DUX_ASSISTED_RELEASE_FINANCIAL_GUARD') END;
END;

CREATE TRIGGER dux_automatic_finalize_financial_guard
BEFORE INSERT ON dux_order_operations
WHEN NEW.action = 'finalize'
  AND EXISTS (
    SELECT 1 FROM dux_order_links
    WHERE order_id = NEW.order_id AND verification_method = 'automatic_api'
  )
BEGIN
  SELECT CASE WHEN
    EXISTS (
      SELECT 1 FROM orders AS target
      WHERE target.id = NEW.order_id
        AND (
          target.mp_preference_attempted_at IS NULL
          OR target.mp_preference_id IS NULL
          OR target.mp_checkout_url IS NULL
        )
    )
    OR (SELECT COUNT(*)
      FROM payments AS payment
      INNER JOIN orders AS target ON target.id = payment.order_id
      WHERE payment.order_id = NEW.order_id
        AND payment.amount_minor = target.total_minor
        AND payment.currency = target.currency
        AND payment.external_reference = target.id
        AND payment.mapped_status = 'approved') <> 1
    OR EXISTS (
      SELECT 1 FROM payments AS payment
      INNER JOIN orders AS target ON target.id = payment.order_id
      WHERE payment.order_id = NEW.order_id
        AND (
          payment.amount_minor <> target.total_minor
          OR payment.currency <> target.currency
          OR payment.external_reference <> target.id
          OR payment.mapped_status IN ('pending', 'refunded')
        )
    )
    OR EXISTS (
      SELECT 1 FROM orders AS target
      WHERE target.id = NEW.order_id
        AND (
          json_extract(NEW.request_json, '$.paymentReconciledAt') IS NULL
          OR julianday(json_extract(NEW.request_json, '$.paymentReconciledAt')) IS NULL
          OR julianday(json_extract(NEW.request_json, '$.paymentReconciledAt')) > julianday(NEW.attempted_at)
          OR julianday(NEW.attempted_at) - julianday(json_extract(NEW.request_json, '$.paymentReconciledAt')) > (2.0 / 1440.0)
        )
    )
  THEN RAISE(ABORT, 'DUX_ASSISTED_FINALIZE_FINANCIAL_GUARD') END;
END;
