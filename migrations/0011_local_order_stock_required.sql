PRAGMA foreign_keys = ON;

-- Ningún pedido online local puede persistir una línea sin inventario controlado.
-- Las líneas respaldadas por Mercado Libre se distinguen por provider_catalog_version.
CREATE TRIGGER IF NOT EXISTS local_order_items_require_configured_stock
BEFORE INSERT ON order_items
WHEN NEW.stock_controlled = 0
  AND NEW.provider_catalog_version IS NULL
  AND EXISTS (
    SELECT 1
    FROM orders
    WHERE id = NEW.order_id
      AND channel IN ('checkout_pro', 'whatsapp')
  )
BEGIN
  SELECT RAISE(ABORT, 'STOCK_PRODUCT_UNAVAILABLE');
END;
