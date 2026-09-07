-- Additive preparation only. Retirement is a separate, backed-up operation.
CREATE TABLE manual_catalog_retirement (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  retired_at TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 64 AND source_sha256 NOT GLOB '*[^0-9a-f]*'),
  removed_product_count INTEGER NOT NULL CHECK (removed_product_count > 0),
  preserved_editorial_count INTEGER NOT NULL CHECK (preserved_editorial_count > 0),
  expected_mutation_count INTEGER NOT NULL CHECK (expected_mutation_count >= 0),
  expected_latest_mutation_at TEXT
);

CREATE TABLE dux_editorial_content (
  company_id TEXT NOT NULL REFERENCES dux_catalog_control(company_id),
  cod_item TEXT NOT NULL,
  source_link_id INTEGER NOT NULL UNIQUE REFERENCES dux_editorial_links(id),
  images_json TEXT NOT NULL CHECK (json_valid(images_json) AND json_type(images_json) = 'array'),
  description TEXT,
  preserved_at TEXT NOT NULL,
  PRIMARY KEY (company_id, cod_item)
);

CREATE TRIGGER manual_catalog_retirement_guard
BEFORE INSERT ON manual_catalog_retirement
BEGIN
  SELECT RAISE(ABORT, 'RETIREMENT_REQUIRES_DUX_PUBLIC_CATALOG') WHERE NOT EXISTS (
    SELECT 1 FROM dux_catalog_control WHERE company_id = '12862' AND public_catalog_enabled = 1
  );
  SELECT RAISE(ABORT, 'RETIREMENT_REQUIRES_PRESERVED_EDITORIAL') WHERE NEW.preserved_editorial_count != (
    SELECT COUNT(*) FROM dux_editorial_content WHERE company_id = '12862'
  ) OR EXISTS (
    SELECT 1 FROM dux_editorial_links l
    LEFT JOIN dux_editorial_content c ON c.source_link_id = l.id AND c.company_id = l.company_id AND c.cod_item = l.cod_item
    WHERE l.company_id = '12862' AND l.active = 1 AND c.source_link_id IS NULL
  );
  SELECT RAISE(ABORT, 'RETIREMENT_MANUAL_CATALOG_CHANGED')
    WHERE NEW.expected_mutation_count != (SELECT COUNT(*) FROM catalog_product_mutations)
      OR NEW.expected_latest_mutation_at IS NOT (SELECT MAX(updated_at) FROM catalog_product_mutations);
END;

-- The marker and physical deletion commit together in one SQL statement.
CREATE TRIGGER manual_catalog_retirement_delete_products
AFTER INSERT ON manual_catalog_retirement
BEGIN DELETE FROM catalog_product_mutations; END;

CREATE TRIGGER manual_catalog_retirement_no_update BEFORE UPDATE ON manual_catalog_retirement
BEGIN SELECT RAISE(ABORT, 'MANUAL_CATALOG_RETIRED'); END;
CREATE TRIGGER manual_catalog_retirement_no_delete BEFORE DELETE ON manual_catalog_retirement
BEGIN SELECT RAISE(ABORT, 'MANUAL_CATALOG_RETIRED'); END;
CREATE TRIGGER manual_catalog_no_insert BEFORE INSERT ON catalog_product_mutations
WHEN EXISTS (SELECT 1 FROM manual_catalog_retirement)
BEGIN SELECT RAISE(ABORT, 'MANUAL_CATALOG_RETIRED'); END;
CREATE TRIGGER manual_catalog_no_update BEFORE UPDATE ON catalog_product_mutations
WHEN EXISTS (SELECT 1 FROM manual_catalog_retirement)
BEGIN SELECT RAISE(ABORT, 'MANUAL_CATALOG_RETIRED'); END;
