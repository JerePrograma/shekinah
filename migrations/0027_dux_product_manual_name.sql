-- Excepción presentacional por SKU: el nombre web manual prevalece hasta
-- restablecer NULL. Identidad, precio, cantidades y reservas siguen en Dux.
ALTER TABLE dux_product_web_settings ADD COLUMN name_override TEXT
  CHECK (name_override IS NULL OR (
    length(name_override) BETWEEN 1 AND 500 AND name_override = trim(name_override)
  ));
