import approvedManifestJson from '../catalog/internal/dux-editorial-links-auto-import.json';
import type { CatalogProductDetail } from '../src/catalog/model';
import { HttpError } from './http';
import {
  DUX_CATALOG_COMPANY_ID,
  DUX_CATALOG_CONTROL_MIGRATION,
  readDuxCatalogControl,
  requireExpectedDuxCompany,
} from './dux-catalog-control';
import type { D1Database, Env } from './platform';

export const DUX_EDITORIAL_SOURCE_MANIFEST_SHA256 =
  'f4f62b5a2b976fd357c92eba3bb0ed13655028802c0f2a40b6b2901beadc8766';

const APPROVED_BATCH_ID = 'dux_editorial_auto_20260903_v1';
const APPROVED_LINK_COUNT = 135;
const APPROVED_ANALYSIS_COMMIT = 'ce71f9d9a611b1038bd2e866b84645867db8c967';
const APPROVED_MATCHING_SOURCE_SHA256 =
  'bd418f6815ad4841967aaa667601ebe5380fc6af491968497a6a754931c169cb';
const APPROVED_BASE_MATCHING_REPORT_SHA256 =
  '788bd4d3506ea3d3c876f7966eb88ebdf6d90b88bfba9c77719b9091b5282f9a';
const APPROVED_AUTO_CONFIRMABLE_CSV_SHA256 =
  'b68e4dc366546537a622c1834e3682bf9fe5186dfb2c5eab959536ccc145d3f0';

type DecisionKind = 'confirmed_identity' | 'auto_full';
type DecisionMethod =
  | 'persisted_inventory_mapping'
  | 'exact_semantic_name'
  | 'exact_semantic_tokens';
type PresentationRelation = 'same' | 'none';

export type DuxEditorialLink = Readonly<{
  code: string;
  localProductId: string;
  reuseImages: boolean;
  reuseDescription: boolean;
  decisionKind: DecisionKind;
  decisionMethod: DecisionMethod;
  presentationRelation: PresentationRelation;
}>;

type ApprovedManifest = Readonly<{
  companyId: string;
  batchId: string;
  expectedLinkCount: number;
  evidence: Readonly<{
    matchingSourceSha256: string;
    baseMatchingReportSha256: string;
    autoConfirmableCsvSha256: string;
    analysisCommit: string;
  }>;
  links: readonly DuxEditorialLink[];
}>;

export type DuxEditorialImportResult = Readonly<{
  batchId: string;
  expected: number;
  created: number;
  idempotent: boolean;
}>;

type ImportRow = Readonly<{
  company_id: unknown;
  source_manifest_sha256: unknown;
  matching_source_sha256: unknown;
  base_matching_report_sha256: unknown;
  auto_confirmable_csv_sha256: unknown;
  analysis_commit: unknown;
  expected_link_count: unknown;
}>;

type LinkRow = Readonly<{
  cod_item: unknown;
  local_product_id: unknown;
  reuse_images: unknown;
  reuse_description: unknown;
  decision_kind: unknown;
  decision_method: unknown;
  presentation_relation: unknown;
  active: unknown;
}>;

const approvedManifest = parseApprovedManifest(approvedManifestJson);
const approvedLinksInsertSql = buildApprovedLinksInsertSql(approvedManifest.links);

export function getApprovedDuxEditorialManifest(): ApprovedManifest {
  return approvedManifest;
}

export async function importApprovedDuxEditorialLinks(
  database: D1Database,
  env: Env,
  actor: string,
  localProducts: readonly CatalogProductDetail[],
): Promise<DuxEditorialImportResult> {
  requireExpectedDuxCompany(env);
  const control = await readDuxCatalogControl(database);
  if (!control.migrationApplied) throw editorialMigrationRequired();
  const safeActor = normalizeActor(actor);
  validateLocalEditorialSources(localProducts, approvedManifest.links);
  const existing = await readImport(database, approvedManifest.batchId);
  if (existing !== null) {
    assertStoredImportMatches(existing);
    await assertStoredLinksMatch(database);
    return Object.freeze({
      batchId: approvedManifest.batchId,
      expected: approvedManifest.expectedLinkCount,
      created: 0,
      idempotent: true,
    });
  }

  await assertNoActiveConflicts(database);
  const now = new Date().toISOString();
  const statements = [
    database.prepare(
      `INSERT INTO dux_editorial_link_imports (
        batch_id, company_id, source_manifest_sha256, matching_source_sha256,
        base_matching_report_sha256, auto_confirmable_csv_sha256,
        analysis_commit, expected_link_count, actor, imported_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    ).bind(
      approvedManifest.batchId,
      approvedManifest.companyId,
      DUX_EDITORIAL_SOURCE_MANIFEST_SHA256,
      approvedManifest.evidence.matchingSourceSha256,
      approvedManifest.evidence.baseMatchingReportSha256,
      approvedManifest.evidence.autoConfirmableCsvSha256,
      approvedManifest.evidence.analysisCommit,
      approvedManifest.expectedLinkCount,
      safeActor,
      now,
    ),
    database.prepare(approvedLinksInsertSql).bind(safeActor, now),
  ];

  try {
    await database.batch(statements);
  } catch (error: unknown) {
    if (isMissingEditorialTable(error)) throw editorialMigrationRequired();
    if (isUniqueConstraint(error)) {
      throw new HttpError(
        409,
        'DUX_EDITORIAL_LINK_CONFLICT',
        'Los vínculos aprobados entran en conflicto con un vínculo activo existente.',
      );
    }
    throw error;
  }
  await assertStoredLinksMatch(database);
  return Object.freeze({
    batchId: approvedManifest.batchId,
    expected: approvedManifest.expectedLinkCount,
    created: approvedManifest.expectedLinkCount,
    idempotent: false,
  });
}

export async function listActiveDuxEditorialLinks(
  database: D1Database,
): Promise<readonly DuxEditorialLink[]> {
  let rows: readonly LinkRow[];
  try {
    const result = await database
      .prepare(
        `SELECT cod_item, local_product_id, reuse_images, reuse_description,
                decision_kind, decision_method, presentation_relation, active
         FROM dux_editorial_links
         WHERE company_id = ?1 AND active = 1
         ORDER BY cod_item`,
      )
      .bind(DUX_CATALOG_COMPANY_ID)
      .all<LinkRow>();
    rows = result.results ?? Object.freeze([]);
  } catch (error: unknown) {
    if (isMissingEditorialTable(error)) throw editorialMigrationRequired();
    throw error;
  }
  return Object.freeze(rows.map(parseStoredLink));
}

export function applyDuxEditorialLinks(
  duxProducts: readonly CatalogProductDetail[],
  localProducts: readonly CatalogProductDetail[],
  links: readonly DuxEditorialLink[],
): readonly CatalogProductDetail[] {
  const localById = new Map(localProducts.map((product) => [product.id, product]));
  const linkByCode = new Map(links.map((link) => [link.code, link]));
  return Object.freeze(duxProducts.map((product) => {
    const code = product.sku;
    if (code === undefined) return product;
    const link = linkByCode.get(code);
    if (link === undefined) return product;
    const local = localById.get(link.localProductId);
    if (local === undefined) return product;

    const localPrimaryImage = local.images[0];
    return Object.freeze({
      ...product,
      ...(link.reuseImages && localPrimaryImage !== undefined
        ? {
            images: Object.freeze([...local.images]),
            primaryImage: localPrimaryImage,
          }
        : {}),
      ...(link.reuseDescription && local.description !== undefined
        ? { description: local.description }
        : {}),
    });
  }));
}

function parseApprovedManifest(value: unknown): ApprovedManifest {
  if (!isRecord(value) || !isRecord(value.evidence) || !Array.isArray(value.links)) {
    throw new Error('El manifiesto Dux editorial versionado no es válido.');
  }
  if (
    value.schemaVersion !== 1 ||
    value.companyId !== DUX_CATALOG_COMPANY_ID ||
    value.batchId !== APPROVED_BATCH_ID ||
    value.expectedLinkCount !== APPROVED_LINK_COUNT ||
    value.evidence.analysisCommit !== APPROVED_ANALYSIS_COMMIT ||
    value.evidence.matchingSourceSha256 !== APPROVED_MATCHING_SOURCE_SHA256 ||
    value.evidence.baseMatchingReportSha256 !== APPROVED_BASE_MATCHING_REPORT_SHA256 ||
    value.evidence.autoConfirmableCsvSha256 !== APPROVED_AUTO_CONFIRMABLE_CSV_SHA256 ||
    value.links.length !== APPROVED_LINK_COUNT
  ) {
    throw new Error('El manifiesto Dux editorial no coincide con la evidencia aprobada.');
  }
  const links = Object.freeze(value.links.map(parseManifestLink));
  const codes = new Set(links.map((link) => link.code));
  const localIds = new Set(links.map((link) => link.localProductId));
  if (codes.size !== links.length || localIds.size !== links.length) {
    throw new Error('El manifiesto Dux editorial no conserva cardinalidad 1:1.');
  }
  return Object.freeze({
    companyId: DUX_CATALOG_COMPANY_ID,
    batchId: APPROVED_BATCH_ID,
    expectedLinkCount: APPROVED_LINK_COUNT,
    evidence: Object.freeze({
      matchingSourceSha256: APPROVED_MATCHING_SOURCE_SHA256,
      baseMatchingReportSha256: APPROVED_BASE_MATCHING_REPORT_SHA256,
      autoConfirmableCsvSha256: APPROVED_AUTO_CONFIRMABLE_CSV_SHA256,
      analysisCommit: APPROVED_ANALYSIS_COMMIT,
    }),
    links,
  });
}

function parseManifestLink(value: unknown): DuxEditorialLink {
  if (!isRecord(value)) throw new Error('El manifiesto contiene un vínculo inválido.');
  if (
    typeof value.code !== 'string' || !/^[A-Za-z0-9._:-]{1,300}$/u.test(value.code) ||
    typeof value.localProductId !== 'string' ||
    !/^[a-z0-9][a-z0-9-]{0,179}$/u.test(value.localProductId) ||
    typeof value.reuseImages !== 'boolean' ||
    typeof value.reuseDescription !== 'boolean' ||
    (value.decisionKind !== 'confirmed_identity' && value.decisionKind !== 'auto_full') ||
    !isDecisionMethod(value.decisionMethod) ||
    (value.presentationRelation !== 'same' && value.presentationRelation !== 'none')
  ) {
    throw new Error('El manifiesto contiene un vínculo fuera de política.');
  }
  return Object.freeze({
    code: value.code,
    localProductId: value.localProductId,
    reuseImages: value.reuseImages,
    reuseDescription: value.reuseDescription,
    decisionKind: value.decisionKind,
    decisionMethod: value.decisionMethod,
    presentationRelation: value.presentationRelation,
  });
}

function buildApprovedLinksInsertSql(links: readonly DuxEditorialLink[]): string {
  const values = links.map((link) => `(
    ${sqlText(DUX_CATALOG_COMPANY_ID)},
    ${sqlText(link.code)},
    ${sqlText(link.localProductId)},
    ${link.reuseImages ? '1' : '0'},
    ${link.reuseDescription ? '1' : '0'},
    ${sqlText(link.decisionKind)},
    ${sqlText(link.decisionMethod)},
    ${sqlText(link.presentationRelation)},
    ${sqlText(APPROVED_BATCH_ID)},
    1, ?1, ?1, ?2, ?2
  )`).join(',');
  const sql = `INSERT INTO dux_editorial_links (
    company_id, cod_item, local_product_id, reuse_images, reuse_description,
    decision_kind, decision_method, presentation_relation, batch_id,
    active, created_by, updated_by, created_at, updated_at
  ) VALUES ${values}`;
  if (new TextEncoder().encode(sql).byteLength > 95_000) {
    throw new Error('El manifiesto Dux editorial excede el tamaño SQL seguro para D1.');
  }
  return sql;
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function validateLocalEditorialSources(
  products: readonly CatalogProductDetail[],
  links: readonly DuxEditorialLink[],
): void {
  const byId = new Map(products.map((product) => [product.id, product]));
  for (const link of links) {
    const product = byId.get(link.localProductId);
    if (product === undefined) {
      throw new HttpError(
        409,
        'DUX_EDITORIAL_LOCAL_PRODUCT_MISSING',
        `No existe la ficha editorial local requerida: ${link.localProductId}.`,
      );
    }
    if (link.reuseImages && product.images.length === 0) {
      throw new HttpError(
        409,
        'DUX_EDITORIAL_IMAGE_MISSING',
        `La ficha editorial local no tiene imagen reutilizable: ${link.localProductId}.`,
      );
    }
    if (
      link.reuseDescription &&
      (product.description === undefined || product.description.trim() === '')
    ) {
      throw new HttpError(
        409,
        'DUX_EDITORIAL_DESCRIPTION_MISSING',
        `La ficha editorial local no tiene descripción reutilizable: ${link.localProductId}.`,
      );
    }
  }
}

async function readImport(database: D1Database, batchId: string): Promise<ImportRow | null> {
  try {
    return await database
      .prepare(
        `SELECT company_id, source_manifest_sha256, matching_source_sha256,
                base_matching_report_sha256, auto_confirmable_csv_sha256,
                analysis_commit, expected_link_count
         FROM dux_editorial_link_imports
         WHERE batch_id = ?1`,
      )
      .bind(batchId)
      .first<ImportRow>();
  } catch (error: unknown) {
    if (isMissingEditorialTable(error)) throw editorialMigrationRequired();
    throw error;
  }
}

function assertStoredImportMatches(row: ImportRow): void {
  if (
    row.company_id !== approvedManifest.companyId ||
    row.source_manifest_sha256 !== DUX_EDITORIAL_SOURCE_MANIFEST_SHA256 ||
    row.matching_source_sha256 !== approvedManifest.evidence.matchingSourceSha256 ||
    row.base_matching_report_sha256 !== approvedManifest.evidence.baseMatchingReportSha256 ||
    row.auto_confirmable_csv_sha256 !== approvedManifest.evidence.autoConfirmableCsvSha256 ||
    row.analysis_commit !== approvedManifest.evidence.analysisCommit ||
    row.expected_link_count !== approvedManifest.expectedLinkCount
  ) {
    throw new HttpError(
      409,
      'DUX_EDITORIAL_IMPORT_EVIDENCE_CONFLICT',
      'El batch aprobado ya existe con evidencia diferente.',
    );
  }
}

async function assertStoredLinksMatch(database: D1Database): Promise<void> {
  const result = await database
    .prepare(
      `SELECT cod_item, local_product_id, reuse_images, reuse_description,
              decision_kind, decision_method, presentation_relation, active
       FROM dux_editorial_links
       WHERE batch_id = ?1
       ORDER BY cod_item`,
    )
    .bind(approvedManifest.batchId)
    .all<LinkRow>();
  const rows = result.results ?? Object.freeze([]);
  if (rows.length !== approvedManifest.expectedLinkCount) throw storedLinksConflict();
  const expectedByCode = new Map(approvedManifest.links.map((link) => [link.code, link]));
  for (const row of rows) {
    const parsed = parseStoredLink(row);
    const expected = expectedByCode.get(parsed.code);
    if (
      expected === undefined ||
      parsed.localProductId !== expected.localProductId ||
      parsed.reuseImages !== expected.reuseImages ||
      parsed.reuseDescription !== expected.reuseDescription ||
      parsed.decisionKind !== expected.decisionKind ||
      parsed.decisionMethod !== expected.decisionMethod ||
      parsed.presentationRelation !== expected.presentationRelation ||
      row.active !== 1
    ) {
      throw storedLinksConflict();
    }
  }
}

async function assertNoActiveConflicts(database: D1Database): Promise<void> {
  let rows: readonly LinkRow[];
  try {
    const result = await database
      .prepare(
        `SELECT cod_item, local_product_id, reuse_images, reuse_description,
                decision_kind, decision_method, presentation_relation, active
         FROM dux_editorial_links
         WHERE company_id = ?1 AND active = 1`,
      )
      .bind(approvedManifest.companyId)
      .all<LinkRow>();
    rows = result.results ?? Object.freeze([]);
  } catch (error: unknown) {
    if (isMissingEditorialTable(error)) throw editorialMigrationRequired();
    throw error;
  }
  const approvedCodes = new Set(approvedManifest.links.map((link) => link.code));
  const approvedLocalIds = new Set(approvedManifest.links.map((link) => link.localProductId));
  for (const row of rows) {
    if (
      (typeof row.cod_item === 'string' && approvedCodes.has(row.cod_item)) ||
      (typeof row.local_product_id === 'string' && approvedLocalIds.has(row.local_product_id))
    ) {
      throw new HttpError(
        409,
        'DUX_EDITORIAL_LINK_CONFLICT',
        'Ya existe un vínculo editorial activo incompatible con el batch aprobado.',
      );
    }
  }
}

function parseStoredLink(row: LinkRow): DuxEditorialLink {
  if (
    typeof row.cod_item !== 'string' ||
    typeof row.local_product_id !== 'string' ||
    (row.reuse_images !== 0 && row.reuse_images !== 1) ||
    (row.reuse_description !== 0 && row.reuse_description !== 1) ||
    (row.decision_kind !== 'confirmed_identity' && row.decision_kind !== 'auto_full') ||
    !isDecisionMethod(row.decision_method) ||
    (row.presentation_relation !== 'same' && row.presentation_relation !== 'none') ||
    row.active !== 1
  ) {
    throw storedLinksConflict();
  }
  return Object.freeze({
    code: row.cod_item,
    localProductId: row.local_product_id,
    reuseImages: row.reuse_images === 1,
    reuseDescription: row.reuse_description === 1,
    decisionKind: row.decision_kind,
    decisionMethod: row.decision_method,
    presentationRelation: row.presentation_relation,
  });
}

function isDecisionMethod(value: unknown): value is DecisionMethod {
  return value === 'persisted_inventory_mapping' ||
    value === 'exact_semantic_name' ||
    value === 'exact_semantic_tokens';
}

function normalizeActor(actor: string): string {
  const normalized = actor.trim();
  if (normalized.length === 0 || normalized.length > 512) {
    throw new HttpError(400, 'ADMIN_ACTOR_INVALID', 'La identidad administrativa no es válida.');
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingEditorialTable(error: unknown): boolean {
  return error instanceof Error && (
    error.message.includes('no such table: dux_editorial_link_imports') ||
    error.message.includes('no such table: dux_editorial_links') ||
    error.message.includes('no such table: dux_catalog_control')
  );
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}

function editorialMigrationRequired(): HttpError {
  return new HttpError(
    503,
    'DUX_EDITORIAL_LINKS_MIGRATION_REQUIRED',
    `Falta aplicar la migración ${DUX_CATALOG_CONTROL_MIGRATION}.`,
  );
}

function storedLinksConflict(): HttpError {
  return new HttpError(
    409,
    'DUX_EDITORIAL_IMPORT_STATE_CONFLICT',
    'El batch aprobado no coincide con los vínculos persistidos.',
  );
}
