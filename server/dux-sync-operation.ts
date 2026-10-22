import { DUX_MAX_ITEMS_PER_SYNC, DUX_SYNC_DEADLINE_MS, DuxApiError, parseDuxWarehousePage, safeDuxQueryFields,
  type DuxFetch, type DuxReadEndpoint, type DuxProviderReasonCode, type DuxQueryField } from './dux-api';
import { persistDuxCatalogSnapshotWhenEnabled } from './dux-catalog-control';
import { isDuxInventoryBootstrapPending, readDuxInventoryConfig, syncDuxInventory, type DuxSyncSummary } from './dux-inventory';
import { createDuxInventoryReader } from './dux-inventory-reader';
import { createDuxRequestGate } from './dux-request-gate';
import { authorizedDuxWarehouses } from './dux-stock-observation';
import { recordDuxFreshnessBreach } from './dux-freshness';
import { HttpError, jsonResponse } from './http';
import type { D1Database, Env } from './platform';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const LEASE_MS = 60_000;
const PAGE_BYTES = 1_900_000;
const MAX_PHASE_ATTEMPTS = 3;
const MIN_RETRY_DELAY_MS = 6_000;
const MAX_RETRY_WAIT_PER_STEP_MS = 24_000;
// Estimated logical rows, not Cloudflare's index-inclusive D1 billing. The daily
// guard retains its existing margin for indexes and other application writes.
const COLLECTION_WRITE_RESERVATION = 120;
const PUBLICATION_WRITE_RESERVATION = 16;
const MANUAL_AUDIT_WRITE_RESERVATION = 96;
const EXTRA_ATTEMPT_WRITE_RESERVATION = 5;
type Phase = 'companies' | 'branches' | 'warehouses' | 'items' | 'publish';
type Operation = Readonly<{
  request_id: string; run_id: string; company_id: string; branch_id: string; deposit_id: string;
  kind: 'initial' | 'manual' | 'scheduled'; actor: string;
  status: 'running' | 'completed' | 'failed'; phase: Phase; item_offset: number; total: number | null;
  collected_bytes: number; attempts: number;
  lease_token: string | null; lease_until_ms: number; result_json: string | null;
  error_code: string | null; error_status: number | null; started_at: string;
  provider_status: number | null; provider_endpoint: DuxReadEndpoint | null;
  provider_error_code: string | null; provider_error_at: string | null;
  phase_attempts: number; retry_not_before_ms: number;
  provider_reason_code: DuxProviderReasonCode | null; provider_invalid_fields_json: string;
  provider_error_fingerprint: string | null;
}>;

/** An absent body retains the historical local/rollout caller contract. */
export async function readDuxSyncRequestId(request: Request): Promise<string | null> {
  const text = request.body === null ? '' : await boundedText(new Response(request.body), 128);
  if (text === '') return null;
  if (text.length > 128) throw invalidRequest();
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw invalidRequest(); }
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      Object.keys(value).length !== 1 || !('requestId' in value) ||
      typeof value.requestId !== 'string' || !UUID.test(value.requestId)) throw invalidRequest();
  return value.requestId;
}

/** One authenticated request performs one bounded provider read or the final publication. */
export async function advanceDuxSyncOperation(
  database: D1Database, env: Env, actor: string, requestId: string,
  kind: 'manual' | 'scheduled', fetchImplementation: DuxFetch = fetch,
): Promise<Response> {
  if (!UUID.test(requestId)) throw invalidRequest();
  const config = readDuxInventoryConfig(env);
  let operation: Operation;
  try {
    const existing = await readOperation(database, requestId);
    operation = existing ?? await startOperation(database, env, actor, requestId, kind);
  } catch (error: unknown) {
    if (error instanceof Error && /no such (?:table: dux_sync_operation|column: (?:provider_|phase_attempts|retry_not_before))/u.test(error.message)) {
      throw new HttpError(503, 'DUX_SYNC_MIGRATION_REQUIRED', 'Falta aplicar las migraciones Dux 0026 y 0030.');
    }
    throw error;
  }
  if (operation.company_id !== String(config.companyId) || operation.branch_id !== String(config.branchId) ||
      operation.deposit_id !== String(config.depositId) || operation.actor !== actor) {
    throw new HttpError(409, 'DUX_SYNC_IDENTITY_MISMATCH', 'La actualización pertenece a otra operación.');
  }
  if (operation.status === 'completed') return completedResponse(operation);
  if (operation.status === 'failed') throw operationError(operation);
  if (operation.lease_until_ms > Date.now()) return progressResponse(operation);
  // A first HTTP claim increments attempts atomically. An expired non-null
  // lease with zero attempts can only be an unconfirmed initialization; its
  // collection reservation must not be assumed to have committed.
  if (operation.phase === 'companies' && operation.attempts === 0 && operation.lease_token !== null) {
    const error = new HttpError(503, 'DUX_SYNC_START_UNCERTAIN', 'No se pudo confirmar el inicio seguro de la actualización. El catálogo anterior se conserva.');
    await failOperation(database, operation, error);
    return currentResponse(database, requestId);
  }
  if (operation.retry_not_before_ms > Date.now()) {
    await new Promise(resolve => setTimeout(resolve, Math.min(operation.retry_not_before_ms - Date.now(), MAX_RETRY_WAIT_PER_STEP_MS)));
  }
  if (Date.now() - Date.parse(operation.started_at) >= DUX_SYNC_DEADLINE_MS) {
    const error = new HttpError(504, 'DUX_SYNC_DEADLINE_EXCEEDED', 'La actualización excedió su plazo seguro. El catálogo anterior se conserva.');
    await failOperation(database, operation, error);
    throw error;
  }
  // Daily write reservations belong to the UTC date on which collection began.
  // Never extend collection/publication into an unreserved accounting day.
  if (new Date().toISOString().slice(0, 10) !== operation.started_at.slice(0, 10)) {
    const error = new HttpError(503, 'DUX_SYNC_BUDGET_DAY_EXPIRED', 'La actualización cambió de día de presupuesto. El catálogo anterior se conserva.');
    await failOperation(database, operation, error);
    return currentResponse(database, requestId);
  }
  const lease = crypto.randomUUID();
  const claimed = await database.prepare(`UPDATE dux_sync_operations SET lease_token = ?2, lease_until_ms = ?3,
    attempts = attempts + CASE WHEN phase = 'publish' THEN 0 ELSE 1 END,
    phase_attempts = phase_attempts + CASE WHEN phase = 'publish' THEN 0 ELSE 1 END
    WHERE request_id = ?1 AND status = 'running' AND lease_until_ms <= ?4
    AND retry_not_before_ms <= ?4 AND (phase = 'publish' OR (attempts < 45 AND phase_attempts < 3)) RETURNING *`)
    .bind(requestId, lease, Date.now() + LEASE_MS, Date.now()).first<Operation>();
  if (claimed === null) return currentResponse(database, requestId);
  operation = claimed;
  let observedProviderStatus: number | null = null;
  try {
    if (operation.phase === 'publish') {
      // Charge each publication lease, including recovery after a lost receipt.
      await reserveOperationWriteBudget(database, operation.started_at, PUBLICATION_WRITE_RESERVATION);
      return await publishOperation(database, env, operation);
    }
    const expectedAttempt = operation.phase === 'companies' ? 1 : operation.phase === 'branches' ? 2
      : operation.phase === 'warehouses' ? 3 : 4 + Math.floor(operation.item_offset / 50);
    if (operation.attempts > expectedAttempt) {
      // After any interrupted read, later ordinals also pay this conservative
      // allowance. It covers the claim, gate, page, checkpoint and ledger writes.
      await reserveOperationWriteBudget(database, operation.started_at, EXTRA_ATTEMPT_WRITE_RESERVATION);
    }
    let captured: string | null = null;
    const capture: DuxFetch = async (input, init) => {
      const response = await fetchImplementation(input, init);
      observedProviderStatus = response.status;
      if (!response.ok) return response;
      captured = await boundedText(response);
      const headers = new Headers(response.headers);
      headers.delete('content-encoding'); headers.delete('content-length');
      return new Response(captured, { status: response.status, headers });
    };
    const warehouses = operation.phase === 'items'
      ? authorizedDuxWarehouses(parseDuxWarehousePage(JSON.parse(await readPage(database, requestId, 'warehouses'))).data, config.companyId)
      : undefined;
    const gate = createDuxRequestGate(database);
    const reader = createDuxInventoryReader(env, capture, {
      ...(warehouses === undefined ? {} : { warehouses }),
      client: { minRequestIntervalMs: 0, maxGetAttempts: 1,
        syncDeadlineMs: Math.max(1, DUX_SYNC_DEADLINE_MS - (Date.now() - Date.parse(operation.started_at))),
        beforeRequest: async () => {
          await gate();
          if (new Date().toISOString().slice(0, 10) !== operation.started_at.slice(0, 10)) {
            throw new HttpError(503, 'DUX_SYNC_BUDGET_DAY_EXPIRED', 'La actualización cambió de día de presupuesto. El catálogo anterior se conserva.');
          }
        } },
    });
    let phase: Phase;
    let offset = operation.item_offset;
    let total = operation.total;
    switch (operation.phase) {
      case 'companies': {
        const companies = await reader.listEmpresas();
        if (companies.filter(company => company.id === config.companyId).length !== 1) throw tenantInvalid();
        phase = 'branches'; break;
      }
      case 'branches': {
        const branches = await reader.listSucursales(config.companyId);
        if (branches.filter(branch => branch.id === config.branchId && branch.companyId === config.companyId).length !== 1) throw tenantInvalid();
        phase = 'warehouses'; break;
      }
      case 'warehouses': {
        const scope = authorizedDuxWarehouses(await reader.listDepositos(), config.companyId);
        if (scope.length === 0) throw tenantInvalid();
        phase = 'items'; break;
      }
      case 'items': {
        const page = await reader.listItemsPage({ enabled: true, offset, limit: 50 });
        total ??= page.pagination.total;
        const received = offset + page.data.length;
        if (total > DUX_MAX_ITEMS_PER_SYNC || page.pagination.total !== total || received > total ||
            (page.pagination.hasMore ? page.data.length === 0 || received >= total : received !== total)) {
          throw new HttpError(502, 'DUX_RESPONSE_INVALID', 'Dux devolvió una paginación incompleta o incompatible.');
        }
        offset = page.pagination.hasMore ? page.pagination.offset + page.pagination.limit : received;
        if (page.pagination.hasMore && offset !== received) throw new HttpError(502, 'DUX_RESPONSE_INVALID', 'Dux devolvió una página incompleta.');
        phase = page.pagination.hasMore ? 'items' : 'publish'; break;
      }
    }
    if (captured === null) throw new HttpError(502, 'DUX_RESPONSE_INVALID', 'No se pudo conservar la lectura Dux.');
    const collectedBytes = operation.collected_bytes + new TextEncoder().encode(captured).byteLength;
    if (collectedBytes > 8_000_000) throw new HttpError(502, 'DUX_STAGING_PAYLOAD_TOO_LARGE', 'La lectura Dux excedió el tamaño seguro de procesamiento.');
    const staged = await database.batch([
      database.prepare(`INSERT INTO dux_sync_operation_pages (request_id, page_key, payload_json)
        SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM dux_sync_operations WHERE request_id = ?1 AND lease_token = ?4 AND status = 'running')
        ON CONFLICT(request_id, page_key) DO UPDATE SET payload_json = excluded.payload_json`)
        .bind(requestId, pageKey(operation), captured, lease),
      database.prepare(`UPDATE dux_sync_operations SET phase = ?3, item_offset = ?4, total = ?5, collected_bytes = ?7,
        lease_token = NULL, lease_until_ms = 0, phase_attempts = 0, retry_not_before_ms = 0, error_code = NULL, error_status = NULL,
        updated_at = ?6 WHERE request_id = ?1 AND lease_token = ?2 AND status = 'running'`)
        .bind(requestId, lease, phase, offset, total, new Date().toISOString(), collectedBytes),
    ]);
    if (staged[1]?.meta.changes !== 1) return currentResponse(database, requestId);
    return progressResponse({ ...operation, phase, item_offset: offset, total });
  } catch (error: unknown) {
    const safe = error instanceof DuxApiError ? new DuxApiError(error.status, error.code, error.message,
      error.providerStatus ?? observedProviderStatus, { endpoint: error.endpoint ?? phaseEndpoint(operation.phase),
        retryAfterMs: error.retryAfterMs, providerError: error.providerError })
      : error instanceof HttpError ? error
      : new HttpError(503, 'DUX_SYNC_STEP_UNAVAILABLE', 'No se pudo confirmar el resultado de la actualización. Consultá su estado antes de reintentar.');
    const retryDelay = transientRetryDelay(operation, safe);
    if (retryDelay !== null) {
      await deferOperationRetry(database, operation, safe as DuxApiError, retryDelay);
      return currentResponse(database, requestId);
    }
    await failOperation(database, operation, safe);
    throw safe;
  }
}

async function startOperation(database: D1Database, env: Env, actor: string, requestId: string, kind: 'manual' | 'scheduled'): Promise<Operation> {
  const config = readDuxInventoryConfig(env);
  const now = new Date().toISOString();
  // Expired collection is safe to discard; no provider mutation has occurred.
  await database.batch([
    database.prepare(`UPDATE dux_sync_operations SET status = 'failed', error_code = 'DUX_SYNC_DEADLINE_EXCEEDED', error_status = 504,
      lease_token = NULL, lease_until_ms = 0, updated_at = ?1 WHERE status = 'running' AND lease_until_ms <= ?2 AND started_at <= ?3`)
      .bind(now, Date.now(), new Date(Date.now() - DUX_SYNC_DEADLINE_MS).toISOString()),
    database.prepare(`DELETE FROM dux_sync_operation_pages WHERE request_id IN (SELECT request_id FROM dux_sync_operations WHERE status <> 'running')`),
  ]);
  const bootstrap = await isDuxInventoryBootstrapPending(database);
  if (kind === 'scheduled' && bootstrap) throw new HttpError(409, 'DUX_INITIAL_SYNC_REQUIRED', 'La primera sincronización Dux debe ejecutarse desde el backoffice antes de habilitar el scheduler.');
  const runId = `dux_sync_${crypto.randomUUID()}`;
  const initialLease = crypto.randomUUID();
  try {
    const started = await database.prepare(`INSERT OR IGNORE INTO dux_sync_operations
      (request_id, run_id, company_id, branch_id, deposit_id, kind, actor, status, phase, started_at, updated_at, lease_token, lease_until_ms)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'running', 'companies', ?8, ?8, ?10, ?11
      WHERE NOT EXISTS (SELECT 1 FROM dux_sync_runs WHERE status = 'running' AND updated_at > ?9)
      RETURNING request_id`).bind(requestId, runId, String(config.companyId), String(config.branchId), String(config.depositId),
      bootstrap ? 'initial' : kind, actor, now, new Date(Date.now() - 30 * 60_000).toISOString(), initialLease, Date.now() + LEASE_MS).first();
    if (started === null) {
      const existing = await readOperation(database, requestId);
      if (existing !== null) return existing;
      throw new HttpError(409, 'DUX_SYNC_IN_PROGRESS', 'Ya existe una sincronización Dux en curso.');
    }
    // Prepay all collection and cleanup writes even if publication never starts.
    // Manual/initial requests also carry the administrative per-POST audit cost.
    await reserveOperationWriteBudget(database, now, COLLECTION_WRITE_RESERVATION +
      (kind === 'scheduled' ? 0 : MANUAL_AUDIT_WRITE_RESERVATION));
    if (kind === 'scheduled') await recordDuxFreshnessBreach(database, actor);
    await database.prepare(`UPDATE dux_sync_operations SET lease_token = NULL, lease_until_ms = 0
      WHERE request_id = ?1 AND lease_token = ?2 AND status = 'running'`).bind(requestId, initialLease).run();
  } catch (error: unknown) {
    const operation = await readOperation(database, requestId);
    if (operation !== null && error instanceof HttpError) await failOperation(database, { ...operation, lease_token: initialLease }, error);
    throw error;
  }
  const operation = await readOperation(database, requestId);
  if (operation === null) throw new HttpError(503, 'DUX_SYNC_STEP_UNAVAILABLE', 'No se pudo iniciar la actualización.');
  return operation;
}

async function publishOperation(database: D1Database, env: Env, operation: Operation): Promise<Response> {
  const rows = await database.prepare('SELECT page_key, payload_json FROM dux_sync_operation_pages WHERE request_id = ?1')
    .bind(operation.request_id).all<{ page_key: string; payload_json: string }>();
  const pages = new Map((rows.results ?? []).map(row => [row.page_key, row.payload_json]));
  // Replay through the same bounded parsers and complete pagination checks. No
  // network or rate-limit slot is used to read already validated private staging.
  const replay: DuxFetch = input => {
    const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
    const key = url.pathname.endsWith('/items') ? `items:${url.searchParams.get('offset')}`
      : url.pathname.endsWith('/empresas') ? 'companies' : url.pathname.endsWith('/sucursales') ? 'branches' : 'warehouses';
    const payload = pages.get(key);
    if (payload === undefined) throw new HttpError(503, 'DUX_SYNC_STAGING_INVALID', 'La lectura Dux conservada está incompleta.');
    return Promise.resolve(new Response(payload, { headers: { 'content-type': 'application/json' } }));
  };
  const reader = createDuxInventoryReader(env, replay, { client: { beforeRequest: () => Promise.resolve(), minRequestIntervalMs: 0, maxGetAttempts: 1 } });
  let summary: DuxSyncSummary;
  const existing = await database.prepare('SELECT * FROM dux_sync_runs WHERE id = ?1').bind(operation.run_id).first<Record<string, unknown>>();
  if (existing === null) {
    summary = await syncDuxInventory(database, env, operation.actor, {
      kind: operation.kind, localProducts: [], client: reader, createRunId: () => operation.run_id, collectedAt: operation.started_at,
      writeBudgetBasePrepaid: true,
    });
  } else {
    if (existing.status !== 'succeeded' && existing.status !== 'partial') {
      throw new HttpError(409, 'DUX_SYNC_PUBLICATION_UNCERTAIN', 'La publicación anterior requiere revisión. No se repetirá la lectura Dux.');
    }
    summary = restoreSummary(existing, operation);
    const config = readDuxInventoryConfig(env);
    await reader.listEmpresas(); await reader.listSucursales(config.companyId); await reader.listDepositos();
    await reader.listItems({ enabled: true });
  }
  const catalog = await persistDuxCatalogSnapshotWhenEnabled(database, env, summary.runId, reader.takeCatalogItems(), summary.completedAt);
  if (catalog.status !== 'persisted') throw new HttpError(503, 'DUX_CATALOG_PUBLICATION_UNCONFIRMED', 'No se confirmó la publicación del catálogo. Revisá sus controles antes de iniciar otra actualización.');
  const result = { status: 'completed', summary, catalog: catalog.summary };
  const committed = await database.batch([
    database.prepare(`UPDATE dux_sync_operations SET status = 'completed', result_json = ?3, lease_token = NULL, lease_until_ms = 0,
      updated_at = ?4 WHERE request_id = ?1 AND lease_token = ?2 AND status = 'running'`)
      .bind(operation.request_id, operation.lease_token, JSON.stringify(result), new Date().toISOString()),
    database.prepare(`DELETE FROM dux_sync_operation_pages WHERE request_id = ?1 AND EXISTS
      (SELECT 1 FROM dux_sync_operations WHERE request_id = ?1 AND status = 'completed')`).bind(operation.request_id),
  ]);
  if (committed[0]?.meta.changes !== 1) return currentResponse(database, operation.request_id);
  return jsonResponse(result);
}

function restoreSummary(row: Record<string, unknown>, operation: Operation): DuxSyncSummary {
  const metric = (key: string): number => {
    const value = row[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid persisted Dux summary');
    return value;
  };
  if ((row.status !== 'succeeded' && row.status !== 'partial') || typeof row.completed_at !== 'string' || row.started_at !== operation.started_at) throw new Error('Invalid persisted Dux summary');
  return { runId: operation.run_id, status: row.status, processed: metric('processed_count'), mapped: metric('mapped_count'),
    unmapped: metric('unmapped_count'), ambiguous: metric('ambiguous_count'), absent: metric('absent_count'), failed: metric('failed_count'),
    localProductsPreserved: 0, startedAt: operation.started_at, completedAt: row.completed_at };
}

async function failOperation(database: D1Database, operation: Operation, error: HttpError): Promise<boolean> {
  const result = await database.batch([
    database.prepare(`UPDATE dux_sync_operations SET status = 'failed', error_code = ?2, error_status = ?3,
      lease_token = NULL, lease_until_ms = 0, retry_not_before_ms = 0,
      provider_status = CASE WHEN ?9 THEN ?10 ELSE provider_status END,
      provider_endpoint = CASE WHEN ?9 THEN ?11 ELSE provider_endpoint END,
      provider_error_code = CASE WHEN ?9 THEN ?2 ELSE provider_error_code END,
      provider_error_at = CASE WHEN ?9 THEN ?4 ELSE provider_error_at END,
      provider_reason_code = CASE WHEN ?9 THEN ?12 ELSE provider_reason_code END,
      provider_invalid_fields_json = CASE WHEN ?9 THEN ?13 ELSE provider_invalid_fields_json END,
      provider_error_fingerprint = CASE WHEN ?9 THEN ?14 ELSE provider_error_fingerprint END,
      updated_at = ?4 WHERE request_id = ?1 AND status = 'running'
      AND lease_token IS ?5 AND phase = ?6 AND item_offset = ?7 AND attempts = ?8`)
      .bind(operation.request_id, error.code, error.status, new Date().toISOString(), operation.lease_token,
        operation.phase, operation.item_offset, operation.attempts, error instanceof DuxApiError ? 1 : 0,
        error instanceof DuxApiError ? error.providerStatus : null,
        error instanceof DuxApiError ? error.endpoint : null,
        error instanceof DuxApiError ? error.providerError?.reasonCode ?? null : null,
        JSON.stringify(error instanceof DuxApiError ? error.providerError?.invalidFields ?? [] : []),
        error instanceof DuxApiError ? error.providerError?.fingerprint ?? null : null),
    database.prepare(`DELETE FROM dux_sync_operation_pages WHERE request_id = ?1 AND EXISTS
      (SELECT 1 FROM dux_sync_operations WHERE request_id = ?1 AND status = 'failed')`).bind(operation.request_id),
  ]);
  return result[0]?.meta.changes === 1;
}
async function reserveOperationWriteBudget(database: D1Database, startedAt: string, estimatedRows: number): Promise<void> {
  const now = new Date().toISOString();
  const budget = await database.prepare(`INSERT INTO dux_d1_write_budget (utc_date, estimated_rows, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?3) ON CONFLICT(utc_date) DO UPDATE SET estimated_rows = estimated_rows + excluded.estimated_rows,
    updated_at = excluded.updated_at WHERE estimated_rows + excluded.estimated_rows <= 40000 RETURNING estimated_rows`)
    .bind(startedAt.slice(0, 10), estimatedRows, now).first();
  if (budget === null) throw new HttpError(503, 'DUX_D1_WRITE_BUDGET_EXHAUSTED', 'Dux excedió el presupuesto diario seguro de escrituras de inventario.');
}
function readOperation(database: D1Database, requestId: string): Promise<Operation | null> {
  return database.prepare('SELECT *, provider_status, provider_endpoint, provider_error_code, provider_error_at, phase_attempts, retry_not_before_ms, provider_reason_code, provider_invalid_fields_json, provider_error_fingerprint FROM dux_sync_operations WHERE request_id = ?1').bind(requestId).first<Operation>();
}
async function readPage(database: D1Database, requestId: string, key: string): Promise<string> {
  const row = await database.prepare('SELECT payload_json FROM dux_sync_operation_pages WHERE request_id = ?1 AND page_key = ?2')
    .bind(requestId, key).first<{ payload_json: string }>();
  if (row === null) throw new HttpError(503, 'DUX_SYNC_STAGING_INVALID', 'La lectura Dux conservada está incompleta.');
  return row.payload_json;
}
function pageKey(operation: Operation): string { return operation.phase === 'items' ? `items:${operation.item_offset}` : operation.phase; }
function progressResponse(operation: Operation): Response {
  return jsonResponse({ status: 'running', requestId: operation.request_id, runId: operation.run_id, phase: operation.phase,
    processed: operation.item_offset, total: operation.total, retryAfterMs: 1000 }, 202);
}
function completedResponse(operation: Operation): Response {
  if (operation.result_json === null) throw new HttpError(503, 'DUX_SYNC_RESULT_INVALID', 'No se pudo comprobar el resultado conservado.');
  return jsonResponse(JSON.parse(operation.result_json) as unknown);
}
async function currentResponse(database: D1Database, requestId: string): Promise<Response> {
  const operation = await readOperation(database, requestId);
  if (operation === null) throw new HttpError(503, 'DUX_SYNC_RESULT_INVALID', 'No se pudo comprobar la actualización.');
  if (operation.status === 'failed') throw operationError(operation);
  if (operation.status === 'running' && operation.phase !== 'publish' && operation.phase_attempts >= MAX_PHASE_ATTEMPTS && operation.lease_until_ms <= Date.now()) {
    const error = new HttpError(503, 'DUX_PHASE_ATTEMPTS_EXHAUSTED', 'La consulta Dux agotó sus intentos seguros. El catálogo anterior se conserva.');
    if (await failOperation(database, operation, error)) throw error;
    return currentResponse(database, requestId);
  }
  if (operation.status === 'running' && operation.phase !== 'publish' && operation.attempts >= 45 && operation.lease_until_ms <= Date.now()) {
    const error = new HttpError(503, 'DUX_SUBREQUEST_BUDGET_EXHAUSTED', 'Dux excedió el presupuesto seguro de solicitudes.');
    if (await failOperation(database, operation, error)) throw error;
    return currentResponse(database, requestId);
  }
  return operation.status === 'completed' ? completedResponse(operation) : progressResponse(operation);
}
export async function latestDuxSyncOperation(database: D1Database): Promise<Readonly<{
  id: string; kind: string; status: string; processed: number; failed: number;
  errorCode: string | null; startedAt: string; completedAt: string | null;
  providerStatus: number | null; providerEndpoint: DuxReadEndpoint | null; providerErrorCode: string | null; providerErrorAt: string | null;
  providerReasonCode: DuxProviderReasonCode | null; providerInvalidFields: readonly DuxQueryField[]; providerErrorFingerprint: string | null;
}> | null> {
  let row: (Operation & { updated_at: string }) | null;
  try {
    row = await database.prepare('SELECT * FROM dux_sync_operations ORDER BY started_at DESC, request_id DESC LIMIT 1')
      .first<Operation & { updated_at: string }>();
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('no such table: dux_sync_operations')) return null;
    throw error;
  }
  if (row === null) return null;
  const expired = row.status === 'running' && Date.now() - Date.parse(row.started_at) >= DUX_SYNC_DEADLINE_MS && row.lease_until_ms <= Date.now();
  return { id: row.run_id, kind: row.kind, status: expired ? 'failed' : row.status === 'completed' ? 'succeeded' : row.status, processed: row.item_offset,
    failed: row.status === 'failed' || expired ? 1 : 0, errorCode: expired ? 'DUX_SYNC_DEADLINE_EXCEEDED' : row.error_code,
    startedAt: row.started_at, completedAt: row.status === 'running' ? null : row.updated_at,
    providerStatus: row.provider_status ?? null, providerEndpoint: row.provider_endpoint ?? null,
    providerErrorCode: row.provider_error_code ?? null, providerErrorAt: row.provider_error_at ?? null,
    providerReasonCode: row.provider_reason_code ?? null,
    providerInvalidFields: safeDuxQueryFields(JSON.parse(row.provider_invalid_fields_json ?? '[]') as unknown),
    providerErrorFingerprint: row.provider_error_fingerprint ?? null };
}
function operationError(operation: Operation): HttpError {
  return new DuxApiError(operation.error_status ?? 503, operation.error_code ?? 'DUX_SYNC_STEP_UNAVAILABLE',
    'No se confirmó la actualización. Consultá el estado antes de volver a actualizar.', operation.provider_status,
    { ...(operation.provider_endpoint === null ? {} : { endpoint: operation.provider_endpoint }),
      ...(operation.provider_reason_code === null || operation.provider_error_fingerprint === null ? {} : { providerError: {
        reasonCode: operation.provider_reason_code, fingerprint: operation.provider_error_fingerprint,
        invalidFields: safeDuxQueryFields(JSON.parse(operation.provider_invalid_fields_json) as unknown),
      } }) });
}
function phaseEndpoint(phase: Phase): DuxReadEndpoint {
  return phase === 'companies' ? '/v2/empresas' : phase === 'branches' ? '/v2/sucursales'
    : phase === 'warehouses' ? '/v2/depositos' : '/v2/items';
}
function transientRetryDelay(operation: Operation, error: HttpError): number | null {
  if (!(error instanceof DuxApiError) || operation.phase === 'publish' || operation.phase_attempts >= MAX_PHASE_ATTEMPTS || operation.attempts >= 45) return null;
  if (!['DUX_TIMEOUT', 'DUX_UNAVAILABLE', 'DUX_RATE_LIMITED'].includes(error.code)) return null;
  const status = error.providerStatus;
  if (status !== null && status !== 429 && status < 500 && (status < 200 || status >= 300)) return null;
  // A provider delay beyond the client's bounded allowance is terminal: do not
  // replace a longer Retry-After with a shorter, unsupported interval.
  if ((status === 429 || (status !== null && status >= 500)) && error.retryAfterMs === null) return null;
  const delay = Math.max(MIN_RETRY_DELAY_MS, error.retryAfterMs ?? MIN_RETRY_DELAY_MS);
  return delay <= 30_000 && Date.now() + delay - Date.parse(operation.started_at) < DUX_SYNC_DEADLINE_MS ? delay : null;
}
async function deferOperationRetry(database: D1Database, operation: Operation, error: DuxApiError, delay: number): Promise<void> {
  // The next and all later read ordinals prepay EXTRA_ATTEMPT_WRITE_RESERVATION
  // before contacting Dux; this checkpoint replaces the normal page checkpoint.
  await database.prepare(`UPDATE dux_sync_operations SET lease_token = NULL, lease_until_ms = 0,
    retry_not_before_ms = ?9, error_code = ?2, error_status = ?3,
    provider_status = ?10, provider_endpoint = ?11, provider_error_code = ?2, provider_error_at = ?4, updated_at = ?4
    , provider_reason_code = ?12, provider_invalid_fields_json = ?13, provider_error_fingerprint = ?14
    WHERE request_id = ?1 AND status = 'running' AND lease_token IS ?5 AND phase = ?6 AND item_offset = ?7 AND attempts = ?8`)
    .bind(operation.request_id, error.code, error.status, new Date().toISOString(), operation.lease_token,
      operation.phase, operation.item_offset, operation.attempts, Date.now() + delay, error.providerStatus, error.endpoint,
      error.providerError?.reasonCode ?? null, JSON.stringify(error.providerError?.invalidFields ?? []), error.providerError?.fingerprint ?? null).run();
}
function invalidRequest(): HttpError { return new HttpError(400, 'DUX_SYNC_REQUEST_INVALID', 'La identidad de actualización no es válida.'); }
function tenantInvalid(): HttpError { return new HttpError(503, 'DUX_TENANT_INVALID', 'Dux no confirmó la empresa, sucursal o depósitos configurados.'); }
async function boundedText(response: Response, maximumBytes = PAGE_BYTES): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new HttpError(502, 'DUX_RESPONSE_INVALID', 'Dux devolvió una respuesta vacía.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.byteLength;
    if (length > maximumBytes) { await reader.cancel(); if (maximumBytes === 128) throw invalidRequest(); throw new HttpError(502, 'DUX_STAGING_PAYLOAD_TOO_LARGE', 'La página Dux excedió el tamaño seguro.'); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
