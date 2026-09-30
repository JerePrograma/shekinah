-- Segunda operación puntual autorizada por el titular el 2026-09-30.
-- El titular amplió el alcance a sus pedidos, pruebas/controladas y pendientes,
-- declaró que ninguno tuvo pago y pidió NO consultar nuevamente Mercado Pago.
-- Los cinco IDs siguientes son el resultado completo de esa selección en D1.
-- Ejecutar sólo como archivo completo por import remoto aislado de D1.
-- No es una migración ni una capacidad genérica de borrado del producto.
PRAGMA foreign_keys = ON;
CREATE TABLE owner_legacy_purge_scope_20260930 (
  order_id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  total_minor INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  created_at TEXT NOT NULL,
  preference_id TEXT
);
INSERT INTO owner_legacy_purge_scope_20260930 VALUES
  ('ord_rIMjecGO5jK2OOZdKIDfDOlX','whatsapp','approved',150000,'abedul','ABEDUL','2026-08-12T19:09:45.679Z',NULL),
  ('ord_9GAeh-ZzHsn5wCoObMAijvFZ','checkout_pro','pending',25000,'aji-panca-salteno-en-vaina','AJPANCASAL','2026-08-13T23:37:20.274Z','240850958-2f437cd7-9e66-4202-b4d1-f00f827d4cb5'),
  ('ord_krUrLYTgjjdzBL-ccQc3EBp8','checkout_pro','pending',25000,'aji-panca-salteno-en-vaina','AJPANCASAL','2026-08-14T18:49:03.739Z','240850958-b5c67ff0-8fd5-4f8e-8d7c-545d19f04899'),
  ('ord_Flz23lHXjgcpdx6S6fQnaOAf','checkout_pro','pending',25000,'aji-panca-salteno-en-vaina','AJPANCASAL','2026-08-15T14:27:27.664Z','240850958-772d6dca-b94f-4ba6-b91c-f5ec1e4de6ec'),
  ('ord_rQ5c3obb0UKwB2bvMnSjs9g-','checkout_pro','pending',25000,'aji-panca-salteno-en-vaina','AJPANCASAL','2026-08-18T15:26:48.420Z','240850958-9ea7fe0c-215f-4aca-95ce-7971b3cdf955');
CREATE TABLE owner_legacy_purge_guard_20260930 (
  control TEXT PRIMARY KEY,
  passed INTEGER NOT NULL CHECK (passed = 1)
);
INSERT INTO owner_legacy_purge_guard_20260930
SELECT 'orders', COUNT(*) = 5 FROM orders o JOIN owner_legacy_purge_scope_20260930 s ON s.order_id=o.id
WHERE o.channel=s.channel AND o.status=s.status AND o.total_minor=s.total_minor AND o.currency='ARS'
  AND o.item_count=1 AND o.created_at=s.created_at AND o.mp_preference_id IS s.preference_id
  AND o.web_request_id IS NULL AND o.stock_reserved_at IS NULL
  AND o.stock_reservation_expires_at IS NULL AND o.stock_consumed_at IS NULL
  AND ((s.channel='whatsapp' AND o.approved_at IS NOT NULL AND o.resolved_at IS NOT NULL
      AND o.mp_preference_attempted_at IS NULL AND o.mp_checkout_url IS NULL)
    OR (s.channel='checkout_pro' AND o.approved_at IS NULL
      AND julianday(o.mp_preference_attempted_at)<julianday('now','-30 minutes')));
INSERT INTO owner_legacy_purge_guard_20260930
SELECT 'items', COUNT(*)=5 AND COALESCE(SUM(i.stock_controlled),0)=0 FROM order_items i
JOIN owner_legacy_purge_scope_20260930 s ON s.order_id=i.order_id
WHERE i.product_id=s.product_id AND i.sku=s.sku AND i.quantity=1
  AND i.unit_price_minor=s.total_minor AND i.subtotal_minor=s.total_minor;
INSERT INTO owner_legacy_purge_guard_20260930
SELECT 'no_extra_item', (SELECT COUNT(*) FROM order_items WHERE order_id IN
  (SELECT order_id FROM owner_legacy_purge_scope_20260930))=5;
INSERT INTO owner_legacy_purge_guard_20260930
SELECT 'fulfillment', COUNT(*)=5 FROM order_fulfillment f
JOIN owner_legacy_purge_scope_20260930 s ON s.order_id=f.order_id
WHERE f.delivery_method='coordinated_pickup' AND f.shipping_minor=0 AND f.products_total_minor=s.total_minor;
INSERT INTO owner_legacy_purge_guard_20260930
SELECT 'no_payment', NOT EXISTS (SELECT 1 FROM payments p JOIN owner_legacy_purge_scope_20260930 s
  ON s.order_id=p.order_id OR s.order_id=p.external_reference);
INSERT INTO owner_legacy_purge_guard_20260930
SELECT 'no_provider_inventory', NOT EXISTS (SELECT 1 FROM dux_order_links WHERE order_id IN
    (SELECT order_id FROM owner_legacy_purge_scope_20260930))
  AND NOT EXISTS (SELECT 1 FROM dux_order_operations WHERE order_id IN (SELECT order_id FROM owner_legacy_purge_scope_20260930))
  AND NOT EXISTS (SELECT 1 FROM mercadolibre_inventory_operations WHERE order_id IN (SELECT order_id FROM owner_legacy_purge_scope_20260930));
INSERT INTO owner_legacy_purge_guard_20260930
SELECT 'legacy_intents', COUNT(*)=4 FROM checkout_intents c JOIN orders o
  ON o.checkout_idempotency_key=c.checkout_idempotency_key JOIN owner_legacy_purge_scope_20260930 s ON s.order_id=o.id
WHERE s.channel='checkout_pro' AND c.intent_kind='legacy' AND c.web_request_id IS NULL;
INSERT INTO owner_legacy_purge_guard_20260930
SELECT 'no_other_intent', NOT EXISTS (SELECT 1 FROM checkout_intents c JOIN orders o
  ON o.checkout_idempotency_key=c.checkout_idempotency_key JOIN owner_legacy_purge_scope_20260930 s ON s.order_id=o.id
  WHERE s.channel<>'checkout_pro' OR c.intent_kind<>'legacy' OR c.web_request_id IS NOT NULL);

DELETE FROM checkout_intents WHERE checkout_idempotency_key IN (SELECT o.checkout_idempotency_key FROM orders o
  JOIN owner_legacy_purge_scope_20260930 s ON s.order_id=o.id);
DELETE FROM orders WHERE id IN (SELECT order_id FROM owner_legacy_purge_scope_20260930);
-- Las FK eliminan sólo las líneas y contactos de esas órdenes. Todos los
-- triggers se conservan: no se modifica estado, catálogo ni inventario.
DELETE FROM admin_audit WHERE target_id IN (SELECT order_id FROM owner_legacy_purge_scope_20260930);
INSERT INTO owner_legacy_purge_guard_20260930
SELECT 'purged', NOT EXISTS (SELECT 1 FROM orders WHERE id IN (SELECT order_id FROM owner_legacy_purge_scope_20260930))
  AND NOT EXISTS (SELECT 1 FROM order_items WHERE order_id IN (SELECT order_id FROM owner_legacy_purge_scope_20260930))
  AND NOT EXISTS (SELECT 1 FROM order_fulfillment WHERE order_id IN (SELECT order_id FROM owner_legacy_purge_scope_20260930));
INSERT INTO owner_legacy_purge_guard_20260930
SELECT 'foreign_keys', NOT EXISTS (SELECT 1 FROM pragma_foreign_key_check);
DROP TABLE owner_legacy_purge_scope_20260930;
DROP TABLE owner_legacy_purge_guard_20260930;
