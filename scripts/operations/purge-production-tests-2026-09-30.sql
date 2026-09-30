-- Operación puntual autorizada por el titular el 2026-09-30.
-- NO es una migración ni una capacidad de borrado del producto.
-- Requiere los tres pedidos Dux anulados, stock liberado y una consulta
-- autoritativa actual de Mercado Pago sin pagos para las tres órdenes.
-- Ejecutar el archivo completo mediante el import atómico de Wrangler D1;
-- nunca ejecutar estas sentencias por separado. Ver el recibo de validación.
PRAGMA foreign_keys = ON;

CREATE TABLE production_test_purge_scope_20260930 (
  request_id TEXT PRIMARY KEY,
  order_id TEXT UNIQUE,
  total_minor INTEGER,
  sku TEXT,
  preference_id TEXT
);
INSERT INTO production_test_purge_scope_20260930 VALUES
  ('req_klYbZQNnzcZBF1NAUWvxdJjN', 'ord_wNdSN3hQXcKHU4SPz1DsRUks', 350000, '799000001', '445638367-33977e51-a400-4956-896a-8f365dea388f'),
  ('req_SSxw2QbNUO37Gn-x3C-_5syj', 'ord_QV2DVvj5lWELqOKLBJi0oCuZ', 2190000, '799000516', NULL),
  ('req_K6tG1vGCUOSoX8cU7Mp0gBH_', 'ord_l5iXS4a6bPMrSiu9hVOJm-FX', 2190000, '799000516', '445638367-7cd16e9f-393a-45bc-96a0-a4c9a34de3a4'),
  ('req_Xcfq-0wMTO23pDEkMWm0WtGq', NULL, NULL, NULL, NULL),
  ('req_K7eKP-Nv0Wvfc-ZOj2ucvhwU', NULL, NULL, NULL, NULL),
  ('req_Du-P7e_aRpJCO30Dics_bddw', NULL, NULL, NULL, NULL),
  ('req_rGOZ82A8RKGmR_wien6g1ZJm', NULL, NULL, NULL, NULL);

CREATE TABLE production_test_purge_guard_20260930 (
  control TEXT PRIMARY KEY,
  passed INTEGER NOT NULL CHECK (passed = 1)
);
INSERT INTO production_test_purge_guard_20260930
SELECT 'tenant', COUNT(*) = 1 FROM dux_tenant_context
WHERE id = 1 AND company_id = '12862' AND branch_id = '1' AND deposit_id = '25566';
INSERT INTO production_test_purge_guard_20260930
SELECT 'requests', COUNT(*) = 7 FROM checkout_intents r
JOIN production_test_purge_scope_20260930 s ON s.request_id = r.web_request_id
WHERE r.intent_kind = 'web_request'
  AND r.created_at >= '2026-09-14T00:00:00.000Z' AND r.created_at < '2026-09-22T00:00:00.000Z'
  AND ((s.order_id IS NULL AND r.web_request_status = 'rejected' AND r.direct_checkout_state IS NULL)
    OR (s.order_id IS NOT NULL AND r.web_request_status = 'accepted'
      AND r.direct_checkout_state IN ('prepared', 'requires_review')))
  AND r.direct_checkout_lease_until_ms <= unixepoch() * 1000;
INSERT INTO production_test_purge_guard_20260930
SELECT 'orders', COUNT(*) = 3 FROM orders o
JOIN production_test_purge_scope_20260930 s ON s.order_id = o.id AND s.request_id = o.web_request_id
JOIN checkout_intents r ON r.web_request_id = s.request_id
WHERE o.checkout_idempotency_key = r.checkout_idempotency_key
  AND o.channel = 'checkout_pro' AND o.currency = 'ARS' AND o.total_minor = s.total_minor AND o.item_count = 1
  AND o.created_at >= '2026-09-21T00:00:00.000Z' AND o.created_at < '2026-09-22T00:00:00.000Z'
  AND o.status IN ('preference_pending', 'pending', 'cancelled') AND o.approved_at IS NULL
  AND o.mp_preference_id IS s.preference_id
  AND ((s.preference_id IS NULL AND o.mp_preference_attempted_at IS NULL AND o.mp_checkout_url IS NULL)
    OR (s.preference_id IS NOT NULL AND julianday(o.mp_preference_attempted_at) < julianday('now', '-30 minutes')))
  AND o.stock_reserved_at IS NULL AND o.stock_consumed_at IS NULL;
INSERT INTO production_test_purge_guard_20260930
SELECT 'no_extra_order', NOT EXISTS (
  SELECT 1 FROM orders o JOIN production_test_purge_scope_20260930 s ON s.request_id = o.web_request_id
  WHERE o.id IS NOT s.order_id
);
INSERT INTO production_test_purge_guard_20260930
SELECT 'no_payment', NOT EXISTS (
  SELECT 1 FROM payments p JOIN production_test_purge_scope_20260930 s
    ON s.order_id = p.order_id OR s.order_id = p.external_reference
);
INSERT INTO production_test_purge_guard_20260930
SELECT 'items', COUNT(*) = 3 AND COALESCE(SUM(i.stock_controlled), 0) = 0 FROM order_items i
JOIN production_test_purge_scope_20260930 s ON s.order_id = i.order_id
WHERE i.sku = s.sku AND i.quantity = 1 AND i.unit_price_minor = s.total_minor AND i.subtotal_minor = s.total_minor;
INSERT INTO production_test_purge_guard_20260930
SELECT 'no_extra_item', (SELECT COUNT(*) FROM order_items i
  JOIN production_test_purge_scope_20260930 s ON s.order_id = i.order_id) = 3;
INSERT INTO production_test_purge_guard_20260930
SELECT 'dux_identity', COUNT(*) = 3 FROM dux_order_links l
JOIN production_test_purge_scope_20260930 s ON s.order_id = l.order_id
WHERE l.verification_method = 'automatic_api' AND l.dux_reference = 'shekinah:web:' || s.request_id
  AND l.company_id = '12862' AND l.branch_id = '1' AND l.deposit_id = '25566'
  AND l.finalized_at IS NULL
  AND ((l.order_id = 'ord_wNdSN3hQXcKHU4SPz1DsRUks' AND l.dux_order_id = '3417590'
    AND l.dux_order_number = '1' AND l.reservation_state = 'released' AND l.released_at IS NOT NULL)
    OR (l.order_id = 'ord_l5iXS4a6bPMrSiu9hVOJm-FX' AND l.dux_order_id = '3422535'
      AND l.dux_order_number = '3' AND l.reservation_state = 'released' AND l.released_at IS NOT NULL)
    OR (l.order_id = 'ord_QV2DVvj5lWELqOKLBJi0oCuZ' AND l.dux_order_id IS NULL
      AND l.dux_order_number IS NULL AND l.reservation_state = 'pending'
      AND EXISTS (SELECT 1 FROM checkout_intents r WHERE r.web_request_id = s.request_id
        AND r.direct_checkout_state = 'requires_review' AND r.direct_checkout_error_code = 'DIRECT_RESERVATION_UNVERIFIED'
        AND json_extract(r.direct_checkout_progress_json, '$.reservationReview.duxOrderId') = 3421572
        AND json_extract(r.direct_checkout_progress_json, '$.reservationReview.duxOrderNumber') = 2)));
INSERT INTO production_test_purge_guard_20260930
SELECT 'no_external_inventory', NOT EXISTS (
  SELECT 1 FROM mercadolibre_inventory_operations l JOIN production_test_purge_scope_20260930 s ON s.order_id = l.order_id
);
INSERT INTO production_test_purge_guard_20260930
SELECT 'operations', (SELECT COUNT(*) FROM dux_order_operations op
  JOIN production_test_purge_scope_20260930 s ON s.order_id = op.order_id
  WHERE op.action = 'reserve' AND op.idempotency_key = 'automatic-reserve:' || op.order_id) = 3
  AND NOT EXISTS (SELECT 1 FROM dux_order_operations op
    JOIN production_test_purge_scope_20260930 s ON s.order_id = op.order_id
    WHERE op.action NOT IN ('reserve', 'release') OR op.status NOT IN ('pending', 'confirmed')
      OR (op.order_id <> 'ord_QV2DVvj5lWELqOKLBJi0oCuZ' AND op.status <> 'confirmed')
      OR (op.order_id = 'ord_QV2DVvj5lWELqOKLBJi0oCuZ' AND (op.action <> 'reserve' OR op.status <> 'pending')));
INSERT INTO production_test_purge_guard_20260930
SELECT 'guards', COUNT(*) = 2 FROM sqlite_schema WHERE type = 'trigger'
  AND name IN ('web_request_preserve_history', 'dux_automatic_operation_preserve_history');

-- D1 mantiene el import aislado: ninguna operación concurrente observa guards
-- retirados. Si cualquier sentencia falla, el import restaura el estado inicial.
DROP TRIGGER web_request_preserve_history;
DROP TRIGGER dux_automatic_operation_preserve_history;
DELETE FROM dux_order_operations WHERE order_id IN (SELECT order_id FROM production_test_purge_scope_20260930);
DELETE FROM dux_order_links WHERE order_id IN (SELECT order_id FROM production_test_purge_scope_20260930);
DELETE FROM order_items WHERE order_id IN (SELECT order_id FROM production_test_purge_scope_20260930);
DELETE FROM order_fulfillment WHERE order_id IN (SELECT order_id FROM production_test_purge_scope_20260930);
DELETE FROM orders WHERE id IN (SELECT order_id FROM production_test_purge_scope_20260930);
DELETE FROM checkout_intents WHERE web_request_id IN (SELECT request_id FROM production_test_purge_scope_20260930);
DELETE FROM admin_audit WHERE target_id IN (SELECT request_id FROM production_test_purge_scope_20260930)
  OR target_id IN (SELECT order_id FROM production_test_purge_scope_20260930);

CREATE TRIGGER web_request_preserve_history BEFORE DELETE ON checkout_intents
WHEN OLD.intent_kind = 'web_request'
BEGIN SELECT RAISE(ABORT, 'WEB_REQUEST_HISTORY_REQUIRED'); END;
CREATE TRIGGER dux_automatic_operation_preserve_history
BEFORE DELETE ON dux_order_operations
WHEN OLD.idempotency_key GLOB 'automatic-reserve:*'
BEGIN
  SELECT RAISE(ABORT, 'DUX_AUTOMATIC_HISTORY_IMMUTABLE');
END;

INSERT INTO production_test_purge_guard_20260930
SELECT 'purged', NOT EXISTS (SELECT 1 FROM orders WHERE id IN (SELECT order_id FROM production_test_purge_scope_20260930))
  AND NOT EXISTS (SELECT 1 FROM checkout_intents WHERE web_request_id IN (SELECT request_id FROM production_test_purge_scope_20260930))
  AND NOT EXISTS (SELECT 1 FROM dux_order_operations WHERE order_id IN (SELECT order_id FROM production_test_purge_scope_20260930))
  AND NOT EXISTS (SELECT 1 FROM dux_order_links WHERE order_id IN (SELECT order_id FROM production_test_purge_scope_20260930))
  AND NOT EXISTS (SELECT 1 FROM order_items WHERE order_id IN (SELECT order_id FROM production_test_purge_scope_20260930))
  AND NOT EXISTS (SELECT 1 FROM order_fulfillment WHERE order_id IN (SELECT order_id FROM production_test_purge_scope_20260930));
INSERT INTO production_test_purge_guard_20260930
SELECT 'foreign_keys', NOT EXISTS (SELECT 1 FROM pragma_foreign_key_check);
DROP TABLE production_test_purge_scope_20260930;
DROP TABLE production_test_purge_guard_20260930;
