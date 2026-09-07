import manifestJson from '../catalog/internal/dux-editorial-triage-v1.json';
import type { CatalogProductDetail } from '../src/catalog/model';
import { DUX_CATALOG_COMPANY_ID, requireExpectedDuxCompany, requireVerifiedDuxCatalogTenant } from './dux-catalog-control';
import { isDuxCatalogBootstrapPendingError, readDuxCatalogSnapshot } from './dux-catalog';
import { getApprovedDuxEditorialManifest } from './dux-editorial-links';
import { readMercadoLibreMatchingSource, type MercadoLibreMatchingSource } from './dux-matching-source';
import { HttpError } from './http';
import type { D1Database, D1PreparedStatement, Env } from './platform';
import { assertExactKeys, isRecord, readSafeText } from './validation';

export const DUX_TRIAGE_BATCH_ID = 'dux_editorial_triage_20260903_v1';
export const DUX_TRIAGE_SOURCE_SHA256 = 'b439b4aaf9f37b58acefba6bd5f921ef513cd2d47b9693cb146946bfd7b511a8';
export const DUX_TRIAGE_CANONICAL_SHA256 = '5bae90361240682edaae78f2e16b40e9bc2771c542e0d46ca08040d85ee97437';
type Disposition = 'auto_confirmed' | 'pending_manual_review' | 'discarded_enrichment';
type ReviewState = 'auto_confirmed' | 'pending' | 'approved' | 'rejected' | 'discarded';
type Candidate = Readonly<{
  localProductId: string; localNameAtAnalysis: string; presentationRelation: string;
  reason: string; score: number;
}>;
export type DuxTriageEvidence = Readonly<{
  duxCode: string; duxNameAtAnalysis: string; disposition: Disposition; analysisStatus: string;
  automaticPersistenceAllowed: boolean; decisionMethod: string;
  selectedLocalProductId: string | null; presentationRelation: string | null;
  recommendedReuse: Readonly<{ images: boolean; description: boolean }>;
  candidates: readonly Candidate[]; blockers: readonly string[];
}>;
type TriageRow = Readonly<{
  cod_item: string; evidence_json: string; review_state: ReviewState; review_version: number;
  selected_local_product_id: string | null; link_id: number | null;
  active_link_id: number | null;
  decision_reason: string | null; updated_by: string; updated_at: string;
}>;
export type DuxTriageReview = Readonly<{
  code: string; decision: 'approve' | 'reject' | 'discard' | 'deactivate'; reason: string;
  localProductId?: string; reuseImages?: boolean; reuseDescription?: boolean;
}>;

let parsedManifest: ReturnType<typeof parseManifest> | undefined;

export function getDuxEditorialTriageManifest(): Readonly<{
  companyId: string; batchId: string; items: readonly DuxTriageEvidence[];
}> {
  return parsedManifest ??= parseManifest();
}

export async function importDuxEditorialTriage(database: D1Database, env: Env, actor: string) {
  const manifest = getDuxEditorialTriageManifest();
  requireExpectedDuxCompany(env);
  await requireVerifiedDuxCatalogTenant(database);
  const safeActor = readSafeText(actor, 'actor', 512);
  await assertManifestIntegrity();
  const approved = getApprovedDuxEditorialManifest();
  const now = new Date().toISOString();
  try {
    const existing = await database.prepare(
      'SELECT source_manifest_sha256 FROM dux_editorial_link_imports WHERE batch_id = ?1',
    ).bind(DUX_TRIAGE_BATCH_ID).first<{ source_manifest_sha256: string }>();
    if (existing !== null) {
      if (existing.source_manifest_sha256 !== DUX_TRIAGE_SOURCE_SHA256) throw evidenceConflict();
      await assertStoredEvidence(database);
      return { batchId: DUX_TRIAGE_BATCH_ID, expected: 747, created: 0, idempotent: true,
        counts: await readCounts(database) };
    }
    const statements = [database.prepare(`INSERT INTO dux_editorial_link_imports (
      batch_id, company_id, source_manifest_sha256, matching_source_sha256,
      base_matching_report_sha256, auto_confirmable_csv_sha256, analysis_commit,
      expected_link_count, actor, imported_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9)`).bind(
      DUX_TRIAGE_BATCH_ID, DUX_CATALOG_COMPANY_ID, DUX_TRIAGE_SOURCE_SHA256,
      approved.evidence.matchingSourceSha256, approved.evidence.baseMatchingReportSha256,
      approved.evidence.autoConfirmableCsvSha256, approved.evidence.analysisCommit, safeActor, now,
    )];
    // Each statement has four bindings and a bounded JSON payload, below D1 limits.
    for (let offset = 0; offset < manifest.items.length; offset += 20) {
      statements.push(database.prepare(`INSERT INTO dux_editorial_triage (
        company_id, cod_item, batch_id, disposition, analysis_status, evidence_json,
        review_state, created_by, updated_by, created_at, updated_at
      ) SELECT ?1, json_extract(value, '$.duxCode'), '${DUX_TRIAGE_BATCH_ID}',
        json_extract(value, '$.disposition'), json_extract(value, '$.analysisStatus'), value,
        CASE json_extract(value, '$.disposition') WHEN 'auto_confirmed' THEN 'auto_confirmed'
          WHEN 'pending_manual_review' THEN 'pending' ELSE 'discarded' END,
        ?3, ?3, ?4, ?4 FROM json_each(?2)`).bind(
        DUX_CATALOG_COMPANY_ID, JSON.stringify(manifest.items.slice(offset, offset + 20)), safeActor, now,
      ));
    }
    await database.batch(statements);
    await assertStoredEvidence(database);
    return { batchId: DUX_TRIAGE_BATCH_ID, expected: 747, created: 747, idempotent: false,
      counts: await readCounts(database) };
  } catch (error: unknown) { throw normalizeError(error); }
}

export async function listDuxEditorialTriage(
  database: D1Database, env: Env, url: URL, localProducts: readonly CatalogProductDetail[],
) {
  requireExpectedDuxCompany(env);
  await requireVerifiedDuxCatalogTenant(database);
  const allowedStates = ['all', 'auto_confirmed', 'pending', 'approved', 'rejected', 'discarded'];
  const status = url.searchParams.get('status') ?? 'pending';
  if (!allowedStates.includes(status)) throw new HttpError(400, 'DUX_TRIAGE_FILTER_INVALID', 'Filtro inválido.');
  const search = (url.searchParams.get('search') ?? '').trim();
  if (search.length > 120) throw new HttpError(400, 'DUX_TRIAGE_SEARCH_INVALID', 'La búsqueda es demasiado larga.');
  const limit = boundedPage(url.searchParams.get('limit'), 20, 1, 50);
  const offset = boundedPage(url.searchParams.get('offset'), 0, 0, 10000);
  const where = `company_id = ?1 AND (?2 = 'all' OR review_state = ?2)
    AND (?3 = '' OR instr(lower(cod_item), lower(?3)) > 0
      OR instr(lower(json_extract(evidence_json, '$.duxNameAtAnalysis')), lower(?3)) > 0)`;
  try {
    const counts = await readCounts(database);
    const count = await database.prepare(`SELECT COUNT(*) total FROM dux_editorial_triage WHERE ${where}`)
      .bind(DUX_CATALOG_COMPANY_ID, status, search).first<{ total: number }>();
    const ml = await readMercadoLibreMatchingSource(database, 900);
    const usableMl = corroboratingUnits(ml);
    const result = await database.prepare(`SELECT dux_editorial_triage.*,
      (SELECT id FROM dux_editorial_links link WHERE link.company_id = dux_editorial_triage.company_id
        AND link.cod_item = dux_editorial_triage.cod_item AND link.active = 1) active_link_id
      FROM dux_editorial_triage WHERE ${where}
      ORDER BY CASE WHEN EXISTS (SELECT 1 FROM json_each(?4) ml,
        json_each(dux_editorial_triage.evidence_json, '$.candidates') candidate
        WHERE json_extract(ml.value, '$.sellerSku') = cod_item
          AND json_extract(ml.value, '$.localProductId') = json_extract(candidate.value, '$.localProductId'))
        THEN 0 ELSE 1 END, cod_item LIMIT ?5 OFFSET ?6`).bind(
        DUX_CATALOG_COMPANY_ID, status, search,
        JSON.stringify(usableMl.map(({ sellerSku, localProductId }) => ({ sellerSku, localProductId }))), limit, offset,
      ).all<TriageRow>();
    const snapshot = await readDuxCatalogSnapshot(database).catch((error: unknown) => {
      if (isDuxCatalogBootstrapPendingError(error)) return null;
      throw error;
    });
    const localById = new Map(localProducts.map((product) => [product.id, product]));
    const rows = (result.results ?? []).map((row) => {
      const evidence = evidenceForRow(row);
      const current = snapshot?.items.find((item) => item.code === row.cod_item);
      return { code: row.cod_item, evidence, reviewState: row.review_state,
        activeLink: row.active_link_id !== null,
        currentDux: current === undefined || snapshot === null ? null : {
          code: current.code, name: current.name, priceStatus: current.priceStatus, priceAmount: current.priceAmount,
          categories: current.categories, syncedAt: snapshot.syncedAt,
        },
        selectedLocalProductId: row.selected_local_product_id, reason: row.decision_reason,
        updatedBy: row.updated_by, updatedAt: row.updated_at,
        candidates: (evidence.disposition === 'discarded_enrichment' ? [] : evidence.candidates).map((candidate) => {
          const local = localById.get(candidate.localProductId);
          return { ...candidate, exists: local !== undefined, name: local?.name ?? candidate.localNameAtAnalysis,
            images: local?.images ?? [], description: local?.description ?? null,
            mercadoLibreEvidence: usableMl.filter((unit) =>
              unit.sellerSku === row.cod_item && unit.localProductId === candidate.localProductId,
            ).map((unit) => ({ itemId: unit.itemId, variationId: unit.variationId, reason: 'exact_sku_and_local_mapping' })) };
        }),
      };
    });
    return { batchId: DUX_TRIAGE_BATCH_ID, counts, total: count?.total ?? 0,
      limit, offset, rows, mercadoLibreEvidenceCount: usableMl.length };
  } catch (error: unknown) { throw normalizeError(error); }
}

export function corroboratingUnits(source: MercadoLibreMatchingSource, now = new Date()) {
  if (source.sellerId !== '445638367' || !source.freshByLegacyThreshold || source.latestRunStatus !== 'succeeded') return [];
  const units = source.units.filter((unit) => unit.lastSyncStatus === 'ok' && unit.mappingStatus === 'mapped'
    && unit.itemStatus === 'active' && unit.sellerSku !== null && unit.localProductId !== null
    && now.getTime() - Date.parse(unit.lastSyncedAt) >= 0
    && now.getTime() - Date.parse(unit.lastSyncedAt) <= source.maximumAgeSeconds * 1000);
  // Colliding identities provide no evidence, regardless of title similarity.
  return units.filter((unit) => units.filter((other) => other.sellerSku === unit.sellerSku).length === 1
    && units.filter((other) => other.localProductId === unit.localProductId).length === 1);
}

export function parseDuxTriageReview(value: unknown): DuxTriageReview {
  if (!isRecord(value)) throw new HttpError(400, 'DUX_TRIAGE_REVIEW_INVALID', 'La revisión no es válida.');
  assertExactKeys(value, ['code', 'decision', 'reason', 'localProductId', 'reuseImages', 'reuseDescription']);
  const code = readSafeText(value.code, 'code', 300);
  const reason = readSafeText(value.reason, 'reason', 1000);
  const decision = value.decision;
  if (decision !== 'approve' && decision !== 'reject' && decision !== 'discard' && decision !== 'deactivate') {
    throw new HttpError(400, 'DUX_TRIAGE_REVIEW_INVALID', 'La decisión no es válida.');
  }
  if (decision !== 'approve') {
    assertExactKeys(value, ['code', 'decision', 'reason']);
    return { code, reason, decision };
  }
  if (typeof value.reuseImages !== 'boolean' || typeof value.reuseDescription !== 'boolean'
    || (!value.reuseImages && !value.reuseDescription)) {
    throw new HttpError(400, 'DUX_TRIAGE_REUSE_INVALID', 'Elegí imagen y/o descripción para el vínculo.');
  }
  return { code, reason, decision, localProductId: readSafeText(value.localProductId, 'localProductId', 180),
    reuseImages: value.reuseImages, reuseDescription: value.reuseDescription };
}

export async function reviewDuxEditorialTriage(
  database: D1Database, env: Env, actor: string, input: DuxTriageReview,
  localProducts: readonly CatalogProductDetail[],
) {
  requireExpectedDuxCompany(env);
  await requireVerifiedDuxCatalogTenant(database);
  const safeActor = readSafeText(actor, 'actor', 512);
  const review = parseDuxTriageReview(input);
  try {
    const row = await database.prepare(`SELECT dux_editorial_triage.*,
      (SELECT id FROM dux_editorial_links link WHERE link.company_id = dux_editorial_triage.company_id
        AND link.cod_item = dux_editorial_triage.cod_item AND link.active = 1) active_link_id
      FROM dux_editorial_triage WHERE company_id = ?1 AND cod_item = ?2`)
      .bind(DUX_CATALOG_COMPANY_ID, review.code).first<TriageRow>();
    if (row === null) throw new HttpError(404, 'DUX_TRIAGE_CASE_NOT_FOUND', 'El caso no existe.');
    const evidence = evidenceForRow(row);
    if (review.decision === 'deactivate' ? row.active_link_id === null
      : evidence.disposition !== 'pending_manual_review' || row.review_state !== 'pending') {
      throw new HttpError(409, 'DUX_TRIAGE_STATE_CONFLICT', 'El caso ya fue resuelto; desactivá el vínculo antes de volver a revisar.');
    }
    const now = new Date().toISOString();
    let statements: D1PreparedStatement[];
    if (review.decision === 'approve') {
      const candidate = evidence.candidates.find((entry) => entry.localProductId === review.localProductId);
      if (candidate === undefined) throw new HttpError(400, 'DUX_TRIAGE_CANDIDATE_NOT_ALLOWED', 'El candidato no pertenece a este caso.');
      const local = localProducts.find((product) => product.id === candidate.localProductId);
      if (local === undefined) throw new HttpError(409, 'DUX_EDITORIAL_LOCAL_PRODUCT_MISSING', 'La ficha editorial local ya no existe.');
      if (review.reuseImages && local.images.length === 0) throw new HttpError(409, 'DUX_EDITORIAL_IMAGE_MISSING', 'La ficha no tiene imagen reutilizable.');
      if (review.reuseDescription && (local.description ?? '').trim() === '') throw new HttpError(409, 'DUX_EDITORIAL_DESCRIPTION_MISSING', 'La ficha no tiene descripción reutilizable.');
      statements = [database.prepare(`INSERT INTO dux_editorial_links (
        company_id, cod_item, local_product_id, reuse_images, reuse_description, decision_kind,
        decision_method, presentation_relation, batch_id, active, created_by, updated_by, created_at, updated_at
      ) SELECT company_id, cod_item, ?3, ?4, ?5, 'confirmed_identity', 'manual_review', ?6,
        batch_id, 1, ?7, ?7, ?8, ?8 FROM dux_editorial_triage
        WHERE company_id = ?1 AND cod_item = ?2 AND review_state = 'pending' AND review_version = ?9`).bind(
        DUX_CATALOG_COMPANY_ID, review.code, candidate.localProductId, review.reuseImages ? 1 : 0,
        review.reuseDescription ? 1 : 0, candidate.presentationRelation === 'same' ? 'same' : 'none', safeActor, now, row.review_version,
      ), database.prepare(`UPDATE dux_editorial_triage SET review_state = 'approved',
        selected_local_product_id = ?3, reuse_images = ?4, reuse_description = ?5,
        link_id = (SELECT id FROM dux_editorial_links WHERE company_id = ?1 AND cod_item = ?2 AND active = 1),
        decision_reason = ?6, updated_by = ?7, updated_at = ?8, review_version = review_version + 1
        WHERE company_id = ?1 AND cod_item = ?2 AND review_state = 'pending' AND review_version = ?9`).bind(
        DUX_CATALOG_COMPANY_ID, review.code, candidate.localProductId, review.reuseImages ? 1 : 0,
        review.reuseDescription ? 1 : 0, review.reason, safeActor, now, row.review_version,
      )];
    } else {
      statements = [];
      if (review.decision === 'deactivate') statements.push(database.prepare(`UPDATE dux_editorial_links
        SET active = 0, updated_by = ?3, updated_at = ?4 WHERE id = ?5 AND company_id = ?1 AND cod_item = ?2
        AND EXISTS (SELECT 1 FROM dux_editorial_triage WHERE company_id = ?1 AND cod_item = ?2
          AND review_state = ?7 AND review_version = ?6)`).bind(
        DUX_CATALOG_COMPANY_ID, review.code, safeActor, now, row.active_link_id, row.review_version, row.review_state,
      ));
      statements.push(database.prepare(`UPDATE dux_editorial_triage SET review_state = ?3,
        selected_local_product_id = NULL, reuse_images = 0, reuse_description = 0, link_id = NULL,
        decision_reason = ?4, updated_by = ?5, updated_at = ?6, review_version = review_version + 1
        WHERE company_id = ?1 AND cod_item = ?2 AND review_state = ?7 AND review_version = ?8`).bind(
        DUX_CATALOG_COMPANY_ID, review.code, review.decision === 'deactivate'
          ? evidence.disposition === 'pending_manual_review' ? 'pending' : row.review_state
          : review.decision === 'reject' ? 'rejected' : 'discarded',
        review.reason, safeActor, now, row.review_state, row.review_version,
      ));
    }
    const result = await database.batch(statements);
    if (result[result.length - 1]?.meta.changes !== 1) throw new HttpError(409, 'DUX_TRIAGE_STATE_CONFLICT', 'El caso cambió durante la revisión. Actualizá el listado.');
    return { code: review.code, decision: review.decision, counts: await readCounts(database) };
  } catch (error: unknown) { throw normalizeError(error); }
}

async function readCounts(database: D1Database) {
  const row = await database.prepare(`SELECT COUNT(*) total,
    COALESCE(SUM(disposition = 'auto_confirmed'), 0) autoConfirmed,
    COALESCE(SUM(review_state = 'pending'), 0) pendingManualReview,
    COALESCE(SUM(review_state = 'approved'), 0) approvedManual,
    COALESCE(SUM(review_state = 'rejected'), 0) rejected,
    COALESCE(SUM(review_state = 'discarded'), 0) discardedEnrichment
    FROM dux_editorial_triage WHERE company_id = ?1`).bind(DUX_CATALOG_COMPANY_ID).first<{
      total: number; autoConfirmed: number; pendingManualReview: number; approvedManual: number; rejected: number; discardedEnrichment: number;
    }>();
  return row ?? { total: 0, autoConfirmed: 0, pendingManualReview: 0, approvedManual: 0, rejected: 0, discardedEnrichment: 0 };
}

async function assertManifestIntegrity(): Promise<void> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(manifestJson)));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== DUX_TRIAGE_CANONICAL_SHA256) throw evidenceConflict();
}

function parseManifest() {
  const value: unknown = manifestJson;
  if (!isRecord(value) || value.schemaVersion !== 1 || value.companyId !== DUX_CATALOG_COMPANY_ID
    || value.purpose !== 'identity_and_editorial_enrichment_triage_only' || !Array.isArray(value.items)
    || value.items.length !== 747) throw evidenceConflict();
  const items = value.items.map((item: unknown) => {
    if (!isRecord(item) || typeof item.duxCode !== 'string' || typeof item.duxNameAtAnalysis !== 'string'
      || !Array.isArray(item.candidates) || !Array.isArray(item.blockers) || !isRecord(item.recommendedReuse)
      || (item.disposition !== 'auto_confirmed' && item.disposition !== 'pending_manual_review' && item.disposition !== 'discarded_enrichment')) throw evidenceConflict();
    return item as DuxTriageEvidence;
  });
  if (new Set(items.map((item) => item.duxCode)).size !== 747
    || items.filter((item) => item.disposition === 'auto_confirmed').length !== 135
    || items.filter((item) => item.disposition === 'pending_manual_review').length !== 294
    || items.filter((item) => item.disposition === 'discarded_enrichment').length !== 318) throw evidenceConflict();
  const auto = getApprovedDuxEditorialManifest();
  for (const item of items) {
    if (item.disposition === 'auto_confirmed') {
      if (!auto.links.some((link) => link.code === item.duxCode && link.localProductId === item.selectedLocalProductId
        && link.reuseImages === item.recommendedReuse.images && link.reuseDescription === item.recommendedReuse.description)) throw evidenceConflict();
    } else if (item.automaticPersistenceAllowed) throw evidenceConflict();
    if (item.disposition === 'discarded_enrichment' && (item.selectedLocalProductId !== null || item.analysisStatus !== 'no_candidate'
      || item.recommendedReuse.images || item.recommendedReuse.description)) throw evidenceConflict();
  }
  return Object.freeze({ companyId: DUX_CATALOG_COMPANY_ID, batchId: DUX_TRIAGE_BATCH_ID, items: Object.freeze(items) });
}

async function assertStoredEvidence(database: D1Database): Promise<void> {
  const rows = await database.prepare('SELECT cod_item, evidence_json FROM dux_editorial_triage WHERE company_id = ?1 AND batch_id = ?2')
    .bind(DUX_CATALOG_COMPANY_ID, DUX_TRIAGE_BATCH_ID).all<TriageRow>();
  if (rows.results?.length !== 747) throw evidenceConflict();
  for (const row of rows.results) evidenceForRow(row);
}

function evidenceForRow(row: Pick<TriageRow, 'cod_item' | 'evidence_json'>): DuxTriageEvidence {
  const evidence = getDuxEditorialTriageManifest().items.find((item) => item.duxCode === row.cod_item);
  if (evidence === undefined || JSON.stringify(JSON.parse(row.evidence_json)) !== JSON.stringify(evidence)) throw evidenceConflict();
  return evidence;
}

function boundedPage(value: string | null, fallback: number, minimum: number, maximum: number) {
  if (value === null) return fallback;
  const parsed = /^\d+$/u.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new HttpError(400, 'DUX_TRIAGE_PAGINATION_INVALID', 'La paginación no es válida.');
  return parsed;
}

function evidenceConflict() {
  return new HttpError(409, 'DUX_TRIAGE_EVIDENCE_CONFLICT', 'La clasificación no coincide con la evidencia versionada.');
}

function normalizeError(error: unknown): unknown {
  if (error instanceof Error && /no such table: dux_editorial_triage/u.test(error.message)) return new HttpError(503, 'DUX_TRIAGE_MIGRATION_REQUIRED', 'Falta aplicar la migración 0017 para la revisión editorial.');
  if (error instanceof Error && /UNIQUE constraint failed|DUX_EDITORIAL_TRIAGE_/u.test(error.message)) return new HttpError(409, 'DUX_EDITORIAL_LINK_CONFLICT', 'Existe una decisión incompatible. Desactivá explícitamente el vínculo anterior antes de volver a vincular.');
  return error;
}
