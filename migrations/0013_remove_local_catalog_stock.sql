PRAGMA foreign_keys = ON;

-- Dux es la única autoridad de inventario. Se retiran los contadores locales
-- del catálogo editorial sin tocar líneas de pedidos ni auditoría histórica.
-- Los triggers legacy que reservaban o consumían ese contador dejan de formar
-- parte del esquema vigente.
DROP TRIGGER IF EXISTS commerce_order_items_reserve_stock;
DROP TRIGGER IF EXISTS catalog_mutations_insert_reservation_guard;
DROP TRIGGER IF EXISTS catalog_mutations_update_reservation_guard;
DROP TRIGGER IF EXISTS whatsapp_orders_approve_consistency;
DROP TRIGGER IF EXISTS whatsapp_orders_consume_reservation;
DROP TRIGGER IF EXISTS checkout_orders_consume_stock_consistency;
DROP TRIGGER IF EXISTS checkout_orders_pending_stock_consistency;
DROP TRIGGER IF EXISTS checkout_orders_consume_stock;
DROP TRIGGER IF EXISTS local_order_items_require_configured_stock;

UPDATE catalog_product_mutations
SET payload_json = json_remove(
      payload_json,
      '$.stockQuantity',
      '$.reservedQuantity',
      '$.availableQuantity'
    ),
    updated_by = 'migration-0013-dux-authoritative-inventory',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE deleted = 0
  AND payload_json IS NOT NULL
  AND (
    json_type(payload_json, '$.stockQuantity') IS NOT NULL
    OR json_type(payload_json, '$.reservedQuantity') IS NOT NULL
    OR json_type(payload_json, '$.availableQuantity') IS NOT NULL
  );

-- Ni la API administrativa ni una escritura SQL accidental pueden volver a
-- introducir cantidades de inventario dentro del documento editorial.
CREATE TRIGGER IF NOT EXISTS catalog_mutations_insert_dux_inventory_guard
BEFORE INSERT ON catalog_product_mutations
WHEN NEW.payload_json IS NOT NULL
  AND (
    json_type(NEW.payload_json, '$.stockQuantity') IS NOT NULL
    OR json_type(NEW.payload_json, '$.reservedQuantity') IS NOT NULL
    OR json_type(NEW.payload_json, '$.availableQuantity') IS NOT NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'DUX_LOCAL_STOCK_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS catalog_mutations_update_dux_inventory_guard
BEFORE UPDATE OF payload_json ON catalog_product_mutations
WHEN NEW.payload_json IS NOT NULL
  AND (
    json_type(NEW.payload_json, '$.stockQuantity') IS NOT NULL
    OR json_type(NEW.payload_json, '$.reservedQuantity') IS NOT NULL
    OR json_type(NEW.payload_json, '$.availableQuantity') IS NOT NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'DUX_LOCAL_STOCK_FORBIDDEN');
END;

-- Toda línea comercial nueva debe quedar asociada a una versión exacta de un
-- snapshot Dux mapeado. Las líneas históricas se preservan sin reescritura.
CREATE TRIGGER IF NOT EXISTS order_items_require_dux_inventory_snapshot
BEFORE INSERT ON order_items
WHEN EXISTS (
  SELECT 1
  FROM orders
  WHERE id = NEW.order_id
    AND channel IN ('checkout_pro', 'whatsapp')
)
  AND (
    NEW.stock_controlled <> 0
    OR NEW.provider_catalog_version IS NULL
    OR length(NEW.provider_catalog_version) <> 64
    OR NEW.provider_catalog_version GLOB '*[^0-9a-f]*'
    OR NOT EXISTS (
      SELECT 1
      FROM dux_inventory_items AS dux_item
      WHERE dux_item.local_product_id = NEW.product_id
        AND dux_item.mapping_status = 'mapped'
        AND dux_item.last_sync_status = 'ok'
        AND dux_item.catalog_version = NEW.provider_catalog_version
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'DUX_INVENTORY_SNAPSHOT_REQUIRED');
END;
