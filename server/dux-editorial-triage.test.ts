import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { onRequest as importEndpoint } from '../functions/api/admin/dux/editorial-triage/import';
import { onRequest as linksImportEndpoint } from '../functions/api/admin/dux/editorial-links/import';
import { onRequest as reviewEndpoint } from '../functions/api/admin/dux/editorial-triage/review';
import { onRequest as listEndpoint } from '../functions/api/admin/dux/editorial-triage';
import type { CatalogProductDetail } from '../src/catalog/model';
import { createTestD1 } from '../src/test/d1';
import priceBaseline from './test-fixtures/dux-price-baseline-v1.json';
import { listCatalogProductDetails } from './catalog-store';
import { listActiveDuxEditorialLinks, getApprovedDuxEditorialManifest, importApprovedDuxEditorialLinks } from './dux-editorial-links';
import {
  corroboratingUnits, DUX_TRIAGE_BATCH_ID, DUX_TRIAGE_SOURCE_SHA256,
  getDuxEditorialTriageManifest, importDuxEditorialTriage, listDuxEditorialTriage,
  parseDuxTriageReview, reviewDuxEditorialTriage, type DuxTriageReview,
} from './dux-editorial-triage';
import type { MercadoLibreMatchingSource } from './dux-matching-source';
import type { AdminContextData, D1Database, Env, PagesFunctionContext } from './platform';

const migrations = readdirSync(resolve('migrations')).filter((file) => file.endsWith('.sql')).sort()
  .map((file) => readFileSync(resolve('migrations', file), 'utf8'));
const env = { DUX_COMPANY_ID: '12862', PUBLIC_SITE_URL: 'https://example.test' };
const manifest = getDuxEditorialTriageManifest();
const manual = manifest.items.find((item) => item.disposition === 'pending_manual_review');
if (manual === undefined || manual.candidates[0] === undefined) throw new Error('Fixture manual requerida.');
const manualCode = manual.duxCode;
const manualLocal = manual.candidates[0].localProductId;

describe('triage editorial Dux versionado y revisión', () => {
  it('reconcilia evidencia de precios 592/87/68/155 sin sembrar precios en runtime', () => {
    expect(priceBaseline.counts).toEqual({ total: 747, usable: 592, placeholder: 87, missingOrZero: 68, nonUsable: 155 });
    expect(priceBaseline.blockers).toHaveLength(155);
    expect(new Set(priceBaseline.blockers.map((item) => item.code)).size).toBe(155);
    expect(priceBaseline.blockers.filter((item) => item.status === 'placeholder')).toHaveLength(87);
    expect(priceBaseline.blockers.filter((item) => item.status === 'missing_or_zero')).toHaveLength(68);
    expect(priceBaseline.counts.total - priceBaseline.blockers.length).toBe(592);
    const codes = new Set(manifest.items.map((item) => item.duxCode));
    expect(priceBaseline.blockers.every((item) => codes.has(item.code))).toBe(true);
    expect(priceBaseline.sourceSha256.priceBlockersCsv).toBe('3f321363b8d9a2efabeb323803bc0508a390c0daf3a4c29b30468c78d1f38453');
  });
  it('conserva 747 códigos únicos, 135/294/318, hashes y auto-confirmados existentes', () => {
    expect(createHash('sha256').update(readFileSync(resolve('catalog/internal/dux-editorial-triage-v1.json'))).digest('hex')).toBe(DUX_TRIAGE_SOURCE_SHA256);
    expect(manifest.items).toHaveLength(747);
    expect(new Set(manifest.items.map((item) => item.duxCode)).size).toBe(747);
    expect(manifest.items.filter((item) => item.disposition === 'auto_confirmed')).toHaveLength(135);
    expect(manifest.items.filter((item) => item.disposition === 'pending_manual_review')).toHaveLength(294);
    expect(manifest.items.filter((item) => item.disposition === 'discarded_enrichment')).toHaveLength(318);
    for (const item of manifest.items) {
      if (item.disposition === 'auto_confirmed') expect(getApprovedDuxEditorialManifest().links).toContainEqual(expect.objectContaining({ code: item.duxCode, localProductId: item.selectedLocalProductId }));
      else expect(item.automaticPersistenceAllowed).toBe(false);
      if (item.analysisStatus === 'no_candidate') expect(item).toMatchObject({ disposition: 'discarded_enrichment', selectedLocalProductId: null, recommendedReuse: { images: false, description: false } });
      if (['ambiguous', 'review_fuzzy'].includes(item.analysisStatus)) expect(item.disposition).toBe('pending_manual_review');
    }
  });

  it('importa 747 una vez, conserva hashes y estados, no crea links ni activa flags', async () => {
    const test = database();
    try {
      expect(await importDuxEditorialTriage(test.database, env, 'admin')).toMatchObject({ created: 747, idempotent: false,
        counts: { total: 747, autoConfirmed: 135, pendingManualReview: 294, discardedEnrichment: 318, approvedManual: 0, rejected: 0 } });
      expect(await importDuxEditorialTriage(test.database, env, 'admin')).toMatchObject({ created: 0, idempotent: true });
      expect(test.sqlite.prepare('SELECT source_manifest_sha256, matching_source_sha256 FROM dux_editorial_link_imports WHERE batch_id = ?').get(DUX_TRIAGE_BATCH_ID)).toEqual({
        source_manifest_sha256: DUX_TRIAGE_SOURCE_SHA256,
        matching_source_sha256: 'bd418f6815ad4841967aaa667601ebe5380fc6af491968497a6a754931c169cb',
      });
      expect(await listActiveDuxEditorialLinks(test.database)).toEqual([]);
      expect(test.sqlite.prepare('SELECT snapshot_collection_enabled, public_catalog_enabled, public_cutover_enabled FROM dux_catalog_control').get()).toEqual({ snapshot_collection_enabled: 0, public_catalog_enabled: 0, public_cutover_enabled: 0 });
      expect(test.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { test.close(); }
  });

  it('paginación y búsqueda preservan conteos y mirror vacío entrega cero evidencia', async () => {
    const test = database();
    try {
      await importDuxEditorialTriage(test.database, env, 'admin');
      const page = await listDuxEditorialTriage(test.database, env, new URL('https://example.test/?limit=10&offset=10'), []);
      expect(page.rows).toHaveLength(10); expect(page.total).toBe(294); expect(page.counts.total).toBe(747); expect(page.mercadoLibreEvidenceCount).toBe(0);
      expect(page.rows.every((row) => row.reviewState === 'pending')).toBe(true);
      const search = await listDuxEditorialTriage(test.database, env, new URL(`https://example.test/?search=${manualCode}`), []);
      expect(search.total).toBe(1); expect(search.counts).toEqual(page.counts);
      await expect(listDuxEditorialTriage(test.database, env, new URL('https://example.test/?limit=9999'), [])).rejects.toMatchObject({ status: 400 });
    } finally { test.close(); }
  });

  it('aprueba candidato permitido y resuelve atómicamente, import posterior respeta decisión', async () => {
    const test = database();
    try {
      await importDuxEditorialTriage(test.database, env, 'admin');
      const local = await localFixture(test.database, manualLocal);
      await reviewDuxEditorialTriage(test.database, env, 'reviewer', approval(), [local]);
      expect(await listActiveDuxEditorialLinks(test.database)).toEqual([expect.objectContaining({ code: manualCode, localProductId: manualLocal, decisionMethod: 'manual_review', reuseImages: true })]);
      expect(test.sqlite.prepare('SELECT review_state, decision_reason, updated_by, review_version FROM dux_editorial_triage WHERE cod_item = ?').get(manualCode)).toEqual({ review_state: 'approved', decision_reason: 'Identidad verificada manualmente', updated_by: 'reviewer', review_version: 1 });
      expect(await importDuxEditorialTriage(test.database, env, 'admin')).toMatchObject({ idempotent: true, counts: { approvedManual: 1, pendingManualReview: 293 } });
      await expect(reviewDuxEditorialTriage(test.database, env, 'reviewer', approval(), [local])).rejects.toMatchObject({ code: 'DUX_TRIAGE_STATE_CONFLICT' });
      await reviewDuxEditorialTriage(test.database, env, 'reviewer', { code: manualCode, decision: 'deactivate', reason: 'Revisar otra vez' }, [local]);
      expect(await listActiveDuxEditorialLinks(test.database)).toEqual([]);
      await reviewDuxEditorialTriage(test.database, env, 'reviewer', approval(), [local]);
      expect(test.sqlite.prepare('SELECT COUNT(*) total FROM dux_editorial_links').get()).toEqual({ total: 2 });
    } finally { test.close(); }
  });

  it.each(['candidate', 'missing', 'images', 'description'] as const)('rechaza aprobación inválida %s sin mutaciones', async (failure) => {
    const test = database();
    try {
      await importDuxEditorialTriage(test.database, env, 'admin');
      const local = await localFixture(test.database, manualLocal);
      const input = { ...approval(), ...(failure === 'candidate' ? { localProductId: 'unlisted' } : {}), reuseDescription: failure === 'description' };
      const products = failure === 'missing' ? [] : [{ ...local, ...(failure === 'images' ? { images: [] } : {}), ...(failure === 'description' ? { description: '' } : {}) }];
      await expect(reviewDuxEditorialTriage(test.database, env, 'reviewer', input, products)).rejects.toBeDefined();
      expect(await listActiveDuxEditorialLinks(test.database)).toEqual([]);
      expect(test.sqlite.prepare('SELECT review_state FROM dux_editorial_triage WHERE cod_item = ?').get(manualCode)).toEqual({ review_state: 'pending' });
    } finally { test.close(); }
  });

  it('colisión 1:N falla sin resolver caso y rollback de batch preserva links al fallar update', async () => {
    const test = database();
    try {
      await importDuxEditorialTriage(test.database, env, 'admin');
      const local = await localFixture(test.database, manualLocal);
      test.sqlite.exec(`CREATE TRIGGER test_review_failure BEFORE UPDATE ON dux_editorial_triage BEGIN SELECT RAISE(ABORT, 'test-failure'); END;`);
      await expect(reviewDuxEditorialTriage(test.database, env, 'reviewer', approval(), [local])).rejects.toThrow('test-failure');
      expect(await listActiveDuxEditorialLinks(test.database)).toEqual([]);
      test.sqlite.exec('DROP TRIGGER test_review_failure');
      const pair = sharedCandidateCases();
      const commonLocal = await localFixture(test.database, pair.localId);
      await reviewDuxEditorialTriage(test.database, env, 'admin', { ...approval(), code: pair.codes[0], localProductId: pair.localId }, [commonLocal]);
      await expect(reviewDuxEditorialTriage(test.database, env, 'admin', { ...approval(), code: pair.codes[1], localProductId: pair.localId }, [commonLocal])).rejects.toMatchObject({ code: 'DUX_EDITORIAL_LINK_CONFLICT' });
      expect(test.sqlite.prepare('SELECT review_state FROM dux_editorial_triage WHERE cod_item = ?').get(pair.codes[1])).toEqual({ review_state: 'pending' });
    } finally { test.close(); }
  });

  it('rechazar y descartar no crean links; evidencia persistida es inmutable', async () => {
    const test = database();
    try {
      await importDuxEditorialTriage(test.database, env, 'admin');
      await reviewDuxEditorialTriage(test.database, env, 'reviewer', { code: manualCode, decision: 'reject', reason: 'No es la misma identidad' }, []);
      expect(await listActiveDuxEditorialLinks(test.database)).toEqual([]);
      expect(() => test.sqlite.prepare("UPDATE dux_editorial_triage SET evidence_json = '{}' WHERE cod_item = ?").run(manualCode)).toThrow();
      expect(test.sqlite.prepare('SELECT review_state FROM dux_editorial_triage WHERE cod_item = ?').get(manualCode)).toEqual({ review_state: 'rejected' });
    } finally { test.close(); }
  });

  it('los triggers bloquean SQL directo sin vínculo aprobado o incremento de versión', async () => {
    const test = database();
    try {
      await importDuxEditorialTriage(test.database, env, 'admin');
      expect(() => test.sqlite.prepare("UPDATE dux_editorial_triage SET review_state = 'approved', review_version = 1 WHERE cod_item = ?")
        .run(manualCode)).toThrow('DUX_EDITORIAL_TRIAGE_APPROVAL_INVALID');
      expect(() => test.sqlite.prepare("UPDATE dux_editorial_triage SET review_state = 'rejected' WHERE cod_item = ?")
        .run(manualCode)).toThrow('DUX_EDITORIAL_TRIAGE_ACTIVE_LINK_CONFLICT');
      expect(test.sqlite.prepare('SELECT review_state, review_version FROM dux_editorial_triage WHERE cod_item = ?')
        .get(manualCode)).toEqual({ review_state: 'pending', review_version: 0 });
      test.sqlite.prepare("UPDATE dux_editorial_triage SET review_state = 'rejected', review_version = 1 WHERE cod_item = ?")
        .run(manualCode);
      expect(test.sqlite.prepare('SELECT review_state, review_version FROM dux_editorial_triage WHERE cod_item = ?')
        .get(manualCode)).toEqual({ review_state: 'rejected', review_version: 1 });
    } finally { test.close(); }
  });

  it('links previos de un caso pendiente o descartado nunca enriquecen el runtime', async () => {
    const test = database();
    try {
      await importDuxEditorialTriage(test.database, env, 'admin');
      const discarded = manifest.items.find((item) => item.disposition === 'discarded_enrichment');
      if (discarded === undefined) throw new Error('Fixture discarded required.');
      const insert = test.sqlite.prepare(`INSERT INTO dux_editorial_links (company_id,cod_item,local_product_id,reuse_images,reuse_description,
        decision_kind,decision_method,presentation_relation,batch_id,active,created_by,updated_by,created_at,updated_at)
        VALUES ('12862',?,?,1,0,'confirmed_identity','manual_review','none',?,1,'admin','admin','2026-09-03','2026-09-03')`);
      insert.run(manualCode, manualLocal, DUX_TRIAGE_BATCH_ID);
      insert.run(discarded.duxCode, 'local-discarded', DUX_TRIAGE_BATCH_ID);
      expect(await listActiveDuxEditorialLinks(test.database)).toEqual([]);
      const page = await listDuxEditorialTriage(test.database, env, new URL(`https://example.test/?status=discarded&search=${discarded.duxCode}`), []);
      expect(page.rows[0]?.candidates).toEqual([]);
      await expect(reviewDuxEditorialTriage(test.database, env, 'admin', { code: manualCode, decision: 'reject', reason: 'Existe link previo' }, [])).rejects.toMatchObject({ code: 'DUX_EDITORIAL_LINK_CONFLICT' });
    } finally { test.close(); }
  });

  it('permite desactivar explícitamente un auto-confirmado sin alterar la clasificación histórica', async () => {
    const test = database();
    try {
      const locals = await listCatalogProductDetails(test.database);
      await importApprovedDuxEditorialLinks(test.database, env, 'admin', locals);
      await importDuxEditorialTriage(test.database, env, 'admin');
      const link = getApprovedDuxEditorialManifest().links[0];
      if (link === undefined) throw new Error('Auto fixture required.');
      await reviewDuxEditorialTriage(test.database, env, 'reviewer', { code: link.code, decision: 'deactivate', reason: 'Desactivar antes de otro vínculo' }, locals);
      expect(await listActiveDuxEditorialLinks(test.database)).toHaveLength(134);
      expect(test.sqlite.prepare('SELECT disposition, review_state, decision_reason FROM dux_editorial_triage WHERE cod_item = ?').get(link.code)).toEqual({
        disposition: 'auto_confirmed', review_state: 'auto_confirmed', decision_reason: 'Desactivar antes de otro vínculo',
      });
      expect(await importDuxEditorialTriage(test.database, env, 'admin')).toMatchObject({ idempotent: true, counts: { autoConfirmed: 135 } });
    } finally { test.close(); }
  });

  it('auth/same-origin/body/tenant y auditoría de éxito/error protegen endpoints', async () => {
    const test = database();
    try {
      const request = (body?: string, origin = 'https://example.test') => new Request('https://example.test/api/admin/dux/editorial-triage/import', { method: 'POST', headers: { origin }, ...(body === undefined ? {} : { body }) });
      expect((await importEndpoint(context(test.database, request(), false))).status).toBe(401);
      expect((await listEndpoint(context(test.database, new Request('https://example.test/api/admin/dux/editorial-triage'), false))).status).toBe(401);
      expect((await importEndpoint(context(test.database, request(undefined, 'https://evil.test')))).status).toBe(403);
      expect((await importEndpoint(context(test.database, request('{}')))).status).toBe(400);
      expect((await importEndpoint({ ...context(test.database, request()), env: { ...env, DB: test.database, DUX_COMPANY_ID: '1' } })).status).toBe(503);
      test.sqlite.exec("UPDATE dux_tenant_context SET company_id = 'other'");
      expect((await importEndpoint(context(test.database, request()))).status).toBe(409);
      test.sqlite.exec("UPDATE dux_tenant_context SET company_id = '12862'");
      expect((await importEndpoint(context(test.database, request()))).status).toBe(200);
      const reviewRequest = new Request('https://example.test/api/admin/dux/editorial-triage/review', { method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json' }, body: JSON.stringify({ code: manualCode, decision: 'reject', reason: 'No corresponde' }) });
      expect((await reviewEndpoint(context(test.database, reviewRequest.clone(), false))).status).toBe(401);
      const crossOriginReview = reviewRequest.clone();
      crossOriginReview.headers.set('origin', 'https://evil.test');
      expect((await reviewEndpoint(context(test.database, crossOriginReview))).status).toBe(403);
      expect((await reviewEndpoint(context(test.database, reviewRequest))).status).toBe(409);
      expect(test.sqlite.prepare('SELECT DISTINCT outcome_status FROM admin_audit ORDER BY outcome_status').all()).toEqual([{ outcome_status: 200 }, { outcome_status: 400 }, { outcome_status: 403 }, { outcome_status: 409 }, { outcome_status: 503 }]);
      expect(() => parseDuxTriageReview({ ...approval(), price: 10 })).toThrow();
    } finally { test.close(); }
  });

  it.each([
    ['editorial-links', linksImportEndpoint, 'DUX_EDITORIAL_IMPORT_BODY_NOT_ALLOWED'],
    ['editorial-triage', importEndpoint, 'DUX_TRIAGE_IMPORT_BODY_NOT_ALLOWED'],
  ] as const)('importación %s acepta streams vacíos y rechaza cualquier byte del cliente', async (path, endpoint, errorCode) => {
    const test = database();
    try {
      const request = (body?: string) => new Request(`https://example.test/api/admin/dux/${path}/import`, {
        method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/x-www-form-urlencoded', 'content-length': '0' },
        ...(body === undefined ? {} : { body }),
      });
      expect((await endpoint(context(test.database, request()))).status).toBe(200);
      const empty = request('');
      expect(empty.body).not.toBeNull();
      const repeated = await endpoint(context(test.database, empty));
      expect(repeated.status).toBe(200);
      expect(await repeated.json()).toMatchObject({ created: 0, idempotent: true });
      for (const body of ['{}', ' ', 'null', '\u0000']) {
        const rejected = await endpoint(context(test.database, request(body)));
        expect(rejected.status).toBe(400);
        expect(await rejected.json()).toMatchObject({ error: { code: errorCode } });
      }
      expect(test.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { test.close(); }
  });

  it('ML sólo acepta seller correcto, sync ok e identidad SKU/local única, nunca título', () => {
    const source: MercadoLibreMatchingSource = { available: true, connectionPresent: true, sellerId: '445638367', nickname: null, lastVerifiedAt: null, latestRunStatus: 'succeeded', latestRunCompletedAt: null, latestSyncedAt: null, freshByLegacyThreshold: true, maximumAgeSeconds: 900, invalidRowCount: 0,
      units: [{ itemId: 'MLA1', variationId: null, sellerSku: manualCode, localProductId: manualLocal, title: 'Título parecido', itemStatus: 'active', primaryImageUrl: null, permalink: null, mappingStatus: 'mapped', lastSyncStatus: 'ok', lastSyncedAt: new Date().toISOString() }] };
    expect(corroboratingUnits(source)).toHaveLength(1);
    expect(corroboratingUnits({ ...source, sellerId: 'other' })).toHaveLength(0);
    expect(corroboratingUnits({ ...source, units: source.units.map((unit) => ({ ...unit, sellerSku: null })) })).toHaveLength(0);
    expect(corroboratingUnits({ ...source, units: [...source.units, ...source.units] })).toHaveLength(0);
    expect(corroboratingUnits({ ...source, freshByLegacyThreshold: false })).toHaveLength(0);
    expect(corroboratingUnits({ ...source, units: source.units.map((unit) => ({ ...unit, lastSyncedAt: '2000-01-01T00:00:00.000Z' })) })).toHaveLength(0);
  });
});

function approval(): DuxTriageReview { return { code: manualCode, decision: 'approve', reason: 'Identidad verificada manualmente', localProductId: manualLocal, reuseImages: true, reuseDescription: false }; }
async function localFixture(database: D1Database, id: string): Promise<CatalogProductDetail> {
  const first = (await listCatalogProductDetails(database)).find((product) => product.images.length > 0);
  if (first === undefined) throw new Error('Fixture local requerida.');
  return { ...first, id };
}
function sharedCandidateCases() {
  const entries = new Map<string, string[]>();
  for (const item of manifest.items.filter((item) => item.disposition === 'pending_manual_review')) for (const candidate of item.candidates) {
    const codes = entries.get(candidate.localProductId) ?? []; codes.push(item.duxCode); entries.set(candidate.localProductId, codes);
  }
  for (const [localId, codes] of entries) if (codes[0] !== undefined && codes[1] !== undefined) return { localId, codes: [codes[0], codes[1]] as const };
  throw new Error('Fixture collision requerida.');
}
function context(database: D1Database, request: Request, authenticated = true): PagesFunctionContext<Env, string, AdminContextData> {
  return { request, env: { ...env, DB: database }, params: {}, data: authenticated ? { adminIdentity: { sub: 'admin', actor: 'admin', authMethod: 'password' } } : {}, next: () => Promise.resolve(new Response()), waitUntil: () => undefined };
}

function database() {
  const test = createTestD1(...migrations);
  test.sqlite.exec("INSERT INTO dux_tenant_context VALUES (1, 'v2', '12862', 'Test company', '1', 'Branch', '25566', 'Deposit', '2026-09-03T12:00:00.000Z', '2026-09-03T12:00:00.000Z')");
  return test;
}
