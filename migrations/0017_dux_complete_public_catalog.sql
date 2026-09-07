PRAGMA foreign_keys = ON;

-- Version 1 remains intact for evidence and rollback. No capability is enabled here.
ALTER TABLE dux_catalog_control ADD COLUMN public_catalog_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (public_catalog_enabled IN (0, 1));

CREATE TABLE dux_catalog_snapshots_v2 (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  inventory_run_id TEXT NOT NULL REFERENCES dux_sync_runs(id) ON DELETE RESTRICT,
  catalog_version TEXT NOT NULL CHECK (length(catalog_version) = 64 AND catalog_version NOT GLOB '*[^0-9a-f]*'),
  price_list_name TEXT NOT NULL CHECK (price_list_name = 'PRECIOS DEL NEGOCIO'),
  item_count INTEGER NOT NULL CHECK (item_count >= 0),
  payload_json TEXT NOT NULL CHECK (
    json_valid(payload_json) AND json_type(payload_json) = 'object'
    AND COALESCE(json_extract(payload_json, '$.schemaVersion') = 2, 0)
    AND COALESCE(json_extract(payload_json, '$.priceListName') = price_list_name, 0)
    AND COALESCE(json_type(payload_json, '$.items') = 'array', 0)
    AND json_array_length(payload_json, '$.items') = item_count
  ),
  synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TRIGGER dux_catalog_v2_insert_completed_run
BEFORE INSERT ON dux_catalog_snapshots_v2
WHEN NOT EXISTS (
  SELECT 1 FROM dux_sync_runs WHERE id = NEW.inventory_run_id AND status IN ('succeeded', 'partial')
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_REQUIRES_COMPLETED_SYNC');
END;

CREATE TRIGGER dux_catalog_v2_insert_collection_guard
BEFORE INSERT ON dux_catalog_snapshots_v2
WHEN NOT EXISTS (
  SELECT 1 FROM dux_catalog_control WHERE company_id = '12862' AND snapshot_collection_enabled = 1
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_SNAPSHOT_COLLECTION_DISABLED');
END;

CREATE TRIGGER dux_catalog_v2_insert_item_guard
BEFORE INSERT ON dux_catalog_snapshots_v2
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.payload_json, '$.items') AS item
  WHERE COALESCE(json_type(item.value, '$.code') <> 'text', 1)
    OR length(trim(json_extract(item.value, '$.code'))) NOT BETWEEN 1 AND 300
    OR COALESCE(json_type(item.value, '$.name') <> 'text', 1)
    OR length(trim(json_extract(item.value, '$.name'))) = 0
    OR COALESCE(json_extract(item.value, '$.priceStatus') NOT IN ('usable', 'placeholder', 'missing_or_zero', 'invalid'), 1)
    OR (json_extract(item.value, '$.priceStatus') = 'usable' AND (
      COALESCE(json_type(item.value, '$.priceAmount') NOT IN ('integer', 'real'), 1)
      OR json_extract(item.value, '$.priceAmount') <= 2
      OR json_extract(item.value, '$.priceAmount') <> round(json_extract(item.value, '$.priceAmount'), 2)
      OR json_extract(item.value, '$.priceAmount') * 100 > 9007199254740991
    ))
    OR (json_extract(item.value, '$.priceStatus') <> 'usable'
      AND COALESCE(json_type(item.value, '$.priceAmount') <> 'null', 1))
)
OR (SELECT COUNT(DISTINCT json_extract(value, '$.code')) FROM json_each(NEW.payload_json, '$.items')) <> NEW.item_count
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_ITEM_INVALID');
END;

CREATE TRIGGER dux_catalog_v2_insert_public_price_guard
BEFORE INSERT ON dux_catalog_snapshots_v2
WHEN EXISTS (SELECT 1 FROM dux_catalog_control WHERE public_cutover_enabled = 1)
AND EXISTS (
  SELECT 1 FROM json_each(NEW.payload_json, '$.items')
  WHERE json_extract(value, '$.priceStatus') <> 'usable'
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_PUBLIC_PRICE_INVALID');
END;

CREATE TRIGGER dux_catalog_public_insert_snapshot_guard
BEFORE INSERT ON dux_catalog_control
WHEN NEW.public_catalog_enabled = 1 AND (
  NOT EXISTS (SELECT 1 FROM dux_tenant_context WHERE id = 1 AND company_id = NEW.company_id)
  OR NOT EXISTS (
    SELECT 1 FROM dux_catalog_snapshots_v2 AS snapshot
    JOIN dux_sync_runs AS run ON run.id = snapshot.inventory_run_id
    WHERE snapshot.id = 1 AND snapshot.item_count > 0 AND run.status IN ('succeeded', 'partial')
  )
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_PUBLIC_REQUIRES_SNAPSHOT');
END;

-- Transactional cutover still needs a future migration that demonstrates Dux lifecycle.
CREATE TRIGGER dux_catalog_commerce_insert_lifecycle_guard
BEFORE INSERT ON dux_catalog_control
WHEN NEW.public_cutover_enabled = 1
BEGIN
  SELECT RAISE(ABORT, 'DUX_ORDER_LIFECYCLE_UNAVAILABLE');
END;

CREATE TRIGGER dux_catalog_v2_update_completed_run
BEFORE UPDATE ON dux_catalog_snapshots_v2
WHEN NOT EXISTS (
  SELECT 1 FROM dux_sync_runs WHERE id = NEW.inventory_run_id AND status IN ('succeeded', 'partial')
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_REQUIRES_COMPLETED_SYNC');
END;

CREATE TRIGGER dux_catalog_v2_update_collection_guard
BEFORE UPDATE ON dux_catalog_snapshots_v2
WHEN NOT EXISTS (
  SELECT 1 FROM dux_catalog_control WHERE company_id = '12862' AND snapshot_collection_enabled = 1
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_SNAPSHOT_COLLECTION_DISABLED');
END;

CREATE TRIGGER dux_catalog_v2_update_item_guard
BEFORE UPDATE ON dux_catalog_snapshots_v2
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.payload_json, '$.items') AS item
  WHERE COALESCE(json_type(item.value, '$.code') <> 'text', 1)
    OR length(trim(json_extract(item.value, '$.code'))) NOT BETWEEN 1 AND 300
    OR COALESCE(json_type(item.value, '$.name') <> 'text', 1)
    OR length(trim(json_extract(item.value, '$.name'))) = 0
    OR COALESCE(json_extract(item.value, '$.priceStatus') NOT IN ('usable', 'placeholder', 'missing_or_zero', 'invalid'), 1)
    OR (json_extract(item.value, '$.priceStatus') = 'usable' AND (
      COALESCE(json_type(item.value, '$.priceAmount') NOT IN ('integer', 'real'), 1)
      OR json_extract(item.value, '$.priceAmount') <= 2
      OR json_extract(item.value, '$.priceAmount') <> round(json_extract(item.value, '$.priceAmount'), 2)
      OR json_extract(item.value, '$.priceAmount') * 100 > 9007199254740991
    ))
    OR (json_extract(item.value, '$.priceStatus') <> 'usable'
      AND COALESCE(json_type(item.value, '$.priceAmount') <> 'null', 1))
)
OR (SELECT COUNT(DISTINCT json_extract(value, '$.code')) FROM json_each(NEW.payload_json, '$.items')) <> NEW.item_count
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_ITEM_INVALID');
END;

CREATE TRIGGER dux_catalog_v2_update_public_price_guard
BEFORE UPDATE ON dux_catalog_snapshots_v2
WHEN EXISTS (SELECT 1 FROM dux_catalog_control WHERE public_cutover_enabled = 1)
AND EXISTS (
  SELECT 1 FROM json_each(NEW.payload_json, '$.items')
  WHERE json_extract(value, '$.priceStatus') <> 'usable'
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_PUBLIC_PRICE_INVALID');
END;

CREATE TRIGGER dux_catalog_public_update_snapshot_guard
BEFORE UPDATE ON dux_catalog_control
WHEN OLD.public_catalog_enabled = 0 AND NEW.public_catalog_enabled = 1 AND (
  NOT EXISTS (SELECT 1 FROM dux_tenant_context WHERE id = 1 AND company_id = NEW.company_id)
  OR NOT EXISTS (
    SELECT 1 FROM dux_catalog_snapshots_v2 AS snapshot
    JOIN dux_sync_runs AS run ON run.id = snapshot.inventory_run_id
    WHERE snapshot.id = 1 AND snapshot.item_count > 0 AND run.status IN ('succeeded', 'partial')
  )
)
BEGIN
  SELECT RAISE(ABORT, 'DUX_CATALOG_PUBLIC_REQUIRES_SNAPSHOT');
END;

-- Transactional cutover still needs a future migration that demonstrates Dux lifecycle.
CREATE TRIGGER dux_catalog_commerce_update_lifecycle_guard
BEFORE UPDATE ON dux_catalog_control
WHEN NEW.public_cutover_enabled = 1
BEGIN
  SELECT RAISE(ABORT, 'DUX_ORDER_LIFECYCLE_UNAVAILABLE');
END;

-- Evidencia histórica separada de las decisiones editoriales activas.
CREATE TABLE dux_editorial_triage (
  company_id TEXT NOT NULL REFERENCES dux_catalog_control(company_id) ON DELETE RESTRICT,
  cod_item TEXT NOT NULL CHECK (length(cod_item) BETWEEN 1 AND 300),
  batch_id TEXT NOT NULL REFERENCES dux_editorial_link_imports(batch_id) ON DELETE RESTRICT,
  disposition TEXT NOT NULL CHECK (disposition IN ('auto_confirmed', 'pending_manual_review', 'discarded_enrichment')),
  analysis_status TEXT NOT NULL CHECK (analysis_status IN ('auto_full', 'confirmed_identity', 'review_full', 'review_image', 'review_fuzzy', 'ambiguous', 'no_candidate')),
  evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json) AND json_type(evidence_json, '$.candidates') = 'array'),
  review_state TEXT NOT NULL CHECK (review_state IN ('auto_confirmed', 'pending', 'approved', 'rejected', 'discarded')),
  selected_local_product_id TEXT,
  reuse_images INTEGER NOT NULL DEFAULT 0 CHECK (reuse_images IN (0, 1)),
  reuse_description INTEGER NOT NULL DEFAULT 0 CHECK (reuse_description IN (0, 1)),
  link_id INTEGER REFERENCES dux_editorial_links(id) ON DELETE RESTRICT,
  decision_reason TEXT CHECK (decision_reason IS NULL OR length(decision_reason) BETWEEN 1 AND 1000),
  review_version INTEGER NOT NULL DEFAULT 0 CHECK (review_version >= 0),
  created_by TEXT NOT NULL CHECK (length(created_by) BETWEEN 1 AND 512),
  updated_by TEXT NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 512),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, cod_item),
  CHECK (json_extract(evidence_json, '$.duxCode') = cod_item),
  CHECK (json_extract(evidence_json, '$.disposition') = disposition),
  CHECK (json_extract(evidence_json, '$.analysisStatus') = analysis_status),
  CHECK ((disposition = 'auto_confirmed' AND review_state = 'auto_confirmed')
    OR (disposition = 'discarded_enrichment' AND review_state = 'discarded')
    OR disposition = 'pending_manual_review'),
  CHECK ((review_state = 'approved' AND selected_local_product_id IS NOT NULL AND link_id IS NOT NULL
    AND decision_reason IS NOT NULL AND (reuse_images = 1 OR reuse_description = 1))
    OR (review_state <> 'approved' AND selected_local_product_id IS NULL AND link_id IS NULL
      AND reuse_images = 0 AND reuse_description = 0))
);

CREATE INDEX ix_dux_editorial_triage_queue ON dux_editorial_triage(company_id, review_state, cod_item);

CREATE TRIGGER dux_editorial_triage_evidence_immutable
BEFORE UPDATE OF company_id, cod_item, batch_id, disposition, analysis_status, evidence_json, created_by, created_at
ON dux_editorial_triage
BEGIN
  SELECT RAISE(ABORT, 'DUX_EDITORIAL_TRIAGE_EVIDENCE_IMMUTABLE');
END;

CREATE TRIGGER dux_editorial_triage_approval_guard
BEFORE UPDATE OF review_state ON dux_editorial_triage
WHEN NEW.review_state = 'approved'
BEGIN
  SELECT RAISE(ABORT, 'DUX_EDITORIAL_TRIAGE_APPROVAL_INVALID')
  WHERE OLD.review_state <> 'pending'
    OR NEW.review_version <> OLD.review_version + 1
    OR NOT EXISTS (SELECT 1 FROM json_each(OLD.evidence_json, '$.candidates') candidate
      WHERE json_extract(candidate.value, '$.localProductId') = NEW.selected_local_product_id)
    OR NOT EXISTS (SELECT 1 FROM dux_editorial_links link
      WHERE link.id = NEW.link_id AND link.company_id = NEW.company_id AND link.cod_item = NEW.cod_item
        AND link.local_product_id = NEW.selected_local_product_id AND link.active = 1
        AND link.reuse_images = NEW.reuse_images AND link.reuse_description = NEW.reuse_description
        AND link.decision_method = 'manual_review');
END;

CREATE TRIGGER dux_editorial_triage_resolution_guard
BEFORE UPDATE OF review_state ON dux_editorial_triage
WHEN NEW.review_state <> 'approved'
BEGIN
  SELECT RAISE(ABORT, 'DUX_EDITORIAL_TRIAGE_ACTIVE_LINK_CONFLICT')
  WHERE NEW.review_version <> OLD.review_version + 1
    OR EXISTS (SELECT 1 FROM dux_editorial_links link
      WHERE link.company_id = NEW.company_id AND link.cod_item = NEW.cod_item AND link.active = 1);
END;
