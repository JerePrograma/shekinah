-- Presentación y publicación web independientes del catálogo/inventario Dux.
CREATE TABLE dux_product_web_settings (
  company_id TEXT NOT NULL CHECK (company_id = '12862'),
  cod_item TEXT NOT NULL CHECK (length(cod_item) BETWEEN 1 AND 300),
  publication_status TEXT NOT NULL DEFAULT 'published' CHECK (publication_status IN ('published', 'unpublished')),
  description TEXT CHECK (description IS NULL OR length(description) <= 12000),
  images_json TEXT CHECK (images_json IS NULL OR (json_valid(images_json) AND json_type(images_json) = 'array')),
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, cod_item)
);

-- NULL hereda la fuente editorial; texto vacío / [] ocultan ese contenido.
-- Las bajas no alteran pedidos existentes ni reservas que ya se intentaron.
CREATE TRIGGER dux_web_publication_request_guard
BEFORE INSERT ON checkout_intents
WHEN NEW.intent_kind = 'web_request'
  AND NOT EXISTS (SELECT 1 FROM checkout_intents WHERE checkout_idempotency_key = NEW.checkout_idempotency_key)
  AND EXISTS (
    SELECT 1 FROM json_each(NEW.web_request_json, '$.lines') line
    JOIN dux_product_web_settings settings ON settings.company_id = '12862'
      AND settings.cod_item = json_extract(line.value, '$.duxCode')
    WHERE settings.publication_status = 'unpublished'
  )
BEGIN SELECT RAISE(ABORT, 'DUX_PRODUCT_UNPUBLISHED'); END;

CREATE TRIGGER dux_web_publication_preparation_guard
BEFORE INSERT ON order_items
WHEN EXISTS (SELECT 1 FROM orders WHERE id = NEW.order_id AND web_request_id IS NOT NULL)
  AND EXISTS (SELECT 1 FROM dux_product_web_settings
    WHERE company_id = '12862' AND cod_item = NEW.sku AND publication_status = 'unpublished')
BEGIN SELECT RAISE(ABORT, 'DUX_PRODUCT_UNPUBLISHED'); END;

CREATE TRIGGER dux_web_publication_reservation_guard
BEFORE UPDATE OF attempted_at ON dux_order_operations
WHEN NEW.action = 'reserve' AND OLD.attempted_at IS NULL AND NEW.attempted_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM order_items line JOIN dux_product_web_settings settings
    ON settings.company_id = '12862' AND settings.cod_item = line.sku
    WHERE line.order_id = NEW.order_id AND settings.publication_status = 'unpublished')
BEGIN SELECT RAISE(ABORT, 'DUX_PRODUCT_UNPUBLISHED'); END;
