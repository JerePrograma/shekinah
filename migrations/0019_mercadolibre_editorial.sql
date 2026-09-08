PRAGMA foreign_keys = ON;

-- Editorial metadata only. Existing manual retirement, orders and inventory tables are untouched.
CREATE TABLE ml_editorial_objects (
  hash TEXT PRIMARY KEY CHECK (length(hash) = 64 AND hash NOT GLOB '*[^0-9a-f]*'),
  kind TEXT NOT NULL CHECK (kind IN ('item', 'content')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  created_at TEXT NOT NULL
);

CREATE TABLE ml_editorial_runs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  phase TEXT NOT NULL CHECK (phase IN ('search', 'metadata', 'content', 'publish', 'complete')),
  state_json TEXT NOT NULL CHECK (json_valid(state_json) AND json_type(state_json) = 'object'),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  lease_owner TEXT,
  lease_until TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  error_code TEXT,
  CHECK ((lease_owner IS NULL) = (lease_until IS NULL)),
  CHECK ((status = 'running' AND completed_at IS NULL) OR (status <> 'running' AND completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX ml_editorial_one_running ON ml_editorial_runs((1)) WHERE status = 'running';
CREATE INDEX ml_editorial_runs_started ON ml_editorial_runs(started_at DESC);

CREATE TABLE ml_editorial_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_run_id TEXT REFERENCES ml_editorial_runs(id) ON DELETE RESTRICT,
  updated_at TEXT NOT NULL
);

CREATE TABLE ml_editorial_links (
  company_id TEXT NOT NULL CHECK (company_id = '12862') REFERENCES dux_catalog_control(company_id),
  cod_item TEXT NOT NULL,
  item_id TEXT NOT NULL CHECK (item_id GLOB 'MLA[0-9]*'),
  variation_id TEXT NOT NULL DEFAULT '',
  seller_id TEXT NOT NULL CHECK (seller_id = '445638367'),
  status TEXT NOT NULL CHECK (status IN ('approved', 'rejected', 'revoked')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  dux_identity_json TEXT NOT NULL CHECK (json_valid(dux_identity_json) AND json_type(dux_identity_json) = 'object'),
  source_identity_json TEXT NOT NULL CHECK (json_valid(source_identity_json) AND json_type(source_identity_json) = 'object'),
  evidence_hash TEXT NOT NULL REFERENCES ml_editorial_objects(hash),
  images_approved INTEGER NOT NULL CHECK (images_approved IN (0, 1)),
  description_approved INTEGER NOT NULL CHECK (description_approved IN (0, 1)),
  method TEXT NOT NULL CHECK (method IN ('reviewed_exact_sku', 'reviewed_exact_barcode', 'explicit_review')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  PRIMARY KEY (company_id, cod_item)
);
CREATE UNIQUE INDEX ml_editorial_approved_source ON ml_editorial_links(item_id, variation_id) WHERE status = 'approved';

CREATE TABLE ml_editorial_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id TEXT NOT NULL CHECK (company_id = '12862'),
  cod_item TEXT NOT NULL,
  revision INTEGER NOT NULL,
  decision_json TEXT NOT NULL CHECK (json_valid(decision_json) AND json_type(decision_json) = 'object'),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (company_id, cod_item, revision)
);

CREATE TRIGGER ml_editorial_publication_complete
BEFORE UPDATE OF current_run_id ON ml_editorial_state
WHEN NEW.current_run_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM ml_editorial_runs WHERE id = NEW.current_run_id AND status = 'succeeded' AND phase = 'complete'
)
BEGIN SELECT RAISE(ABORT, 'ML_EDITORIAL_REQUIRES_COMPLETE_RUN'); END;
CREATE TRIGGER ml_editorial_initial_publication_complete
BEFORE INSERT ON ml_editorial_state
WHEN NEW.current_run_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM ml_editorial_runs WHERE id = NEW.current_run_id AND status = 'succeeded' AND phase = 'complete'
)
BEGIN SELECT RAISE(ABORT, 'ML_EDITORIAL_REQUIRES_COMPLETE_RUN'); END;

CREATE TRIGGER ml_editorial_link_requires_dux_insert
BEFORE INSERT ON ml_editorial_links WHEN NOT EXISTS (
  SELECT 1 FROM dux_catalog_snapshots_v2 snapshot, json_each(snapshot.payload_json, '$.items') item
  WHERE snapshot.id = 1 AND json_extract(item.value, '$.code') = NEW.cod_item
)
BEGIN SELECT RAISE(ABORT, 'ML_EDITORIAL_REQUIRES_DUX_IDENTITY'); END;
CREATE TRIGGER ml_editorial_link_requires_dux_update
BEFORE UPDATE ON ml_editorial_links WHEN NEW.status = 'approved' AND NOT EXISTS (
  SELECT 1 FROM dux_catalog_snapshots_v2 snapshot, json_each(snapshot.payload_json, '$.items') item
  WHERE snapshot.id = 1 AND json_extract(item.value, '$.code') = NEW.cod_item
)
BEGIN SELECT RAISE(ABORT, 'ML_EDITORIAL_REQUIRES_DUX_IDENTITY'); END;
CREATE TRIGGER ml_editorial_decisions_no_update BEFORE UPDATE ON ml_editorial_decisions
BEGIN SELECT RAISE(ABORT, 'ML_EDITORIAL_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER ml_editorial_decisions_no_delete BEFORE DELETE ON ml_editorial_decisions
BEGIN SELECT RAISE(ABORT, 'ML_EDITORIAL_AUDIT_IMMUTABLE'); END;

CREATE TRIGGER ml_editorial_objects_no_update BEFORE UPDATE ON ml_editorial_objects
BEGIN SELECT RAISE(ABORT, 'ML_EDITORIAL_OBJECT_IMMUTABLE'); END;
CREATE TRIGGER ml_editorial_objects_no_delete BEFORE DELETE ON ml_editorial_objects
BEGIN SELECT RAISE(ABORT, 'ML_EDITORIAL_OBJECT_IMMUTABLE'); END;
CREATE TRIGGER ml_editorial_completed_runs_no_update BEFORE UPDATE ON ml_editorial_runs WHEN OLD.status <> 'running'
BEGIN SELECT RAISE(ABORT, 'ML_EDITORIAL_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER ml_editorial_completed_runs_no_delete BEFORE DELETE ON ml_editorial_runs
BEGIN SELECT RAISE(ABORT, 'ML_EDITORIAL_AUDIT_IMMUTABLE'); END;
