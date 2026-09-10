import {
  assertDuxCommerceLifecycleAvailable,
  isEnabledFlag,
  readDuxSnapshotMaxAgeSeconds,
  requireCommerceMode,
  requireMercadoPagoAccessToken,
  requirePublicSiteUrl,
} from './config';
import { HttpError, requireSecret } from './http';
import type { D1Database, Env } from './platform';

const WEB_REQUEST_COLUMNS = Object.freeze([
  'intent_kind',
  'web_request_id',
  'web_request_token_hash',
  'web_request_owner_hash',
  'web_request_fingerprint',
  'web_request_json',
  'web_request_status',
  'web_request_updated_at',
  'web_request_resolved_at',
  'web_request_resolved_by',
]);
const WEB_REQUEST_OBJECTS = Object.freeze([
  'commerce_request_rate_limits',
  'web_request_initial_guard',
  'web_request_snapshot_immutable',
  'web_request_resolution_guard',
  'web_request_preserve_history',
  'orders_require_web_request_conversion',
]);
const DUX_OBJECTS = Object.freeze([
  'dux_catalog_control',
  'dux_catalog_snapshots_v2',
  'dux_sync_runs',
  'dux_tenant_context',
  'dux_order_links',
  'dux_order_operations',
]);

export type CommerceReadiness = Readonly<{
  checkedAt: string;
  webRequests: Readonly<{
    schemaReady: boolean;
    serverEnabled: boolean;
    tokenSecretConfigured: boolean;
    catalogSnapshotAvailable: boolean;
    catalogSnapshotFresh: boolean | null;
    totalCount: number | null;
    submittedCount: number | null;
    blockers: readonly string[];
    warnings: readonly string[];
  }>;
  checkout: Readonly<{
    serverEnabled: boolean;
    duxApiEnabled: boolean;
    paymentMode: 'sandbox' | 'production' | 'invalid_or_missing';
    paymentAccessTokenConfigured: boolean;
    webhookSecretConfigured: boolean;
    orderTokenSecretConfigured: boolean;
    publicSiteConfigured: boolean;
    guardCode: string | null;
    automaticDuxMutationAllowed: false;
    blockers: readonly string[];
  }>;
  dux: Readonly<{
    schemaReady: boolean;
    apiEnabled: boolean;
    credentialsConfigured: boolean;
    snapshotCollectionEnabled: boolean | null;
    publicCatalogEnabled: boolean | null;
    publicCutoverEnabled: boolean | null;
    snapshotAvailable: boolean;
    snapshotItemCount: number | null;
    snapshotSyncedAt: string | null;
    snapshotFresh: boolean | null;
    lastSyncStatus: string | null;
    lastSyncCompletedAt: string | null;
    linkAttentionCount: number | null;
    operationAttentionCount: number | null;
    orderApiContract: Readonly<{
      reviewedAt: '2026-09-10';
      createEndpoint: '/pedido/nuevopedido';
      queryEndpoint: '/pedidos';
      queryByReferenceDocumented: false;
      productObjectSchemaVerified: false;
      releaseOrFinalizeDocumented: false;
    }>;
  }>;
  attention: Readonly<{
    paymentIncidentCount: number;
  }>;
}>;

type SchemaInspection = Readonly<{
  webRequests: boolean;
  dux: boolean;
}>;

type DuxStatus = CommerceReadiness['dux'];

export async function readCommerceReadiness(
  database: D1Database,
  env: Env,
  nowMilliseconds = Date.now(),
): Promise<CommerceReadiness> {
  if (!Number.isFinite(nowMilliseconds)) {
    throw new HttpError(500, 'READINESS_CLOCK_INVALID', 'No se pudo evaluar la preparación comercial.');
  }
  const checkedAt = new Date(nowMilliseconds).toISOString();
  const schema = await inspectSchema(database);
  const dux = await readDuxStatus(database, env, schema.dux, nowMilliseconds);
  const config = readConfiguration(env);
  const webCounts = schema.webRequests
    ? await readWebRequestCounts(database)
    : Object.freeze({ total: null, submitted: null });
  const paymentIncidentCount = await readPaymentIncidentCount(database);

  const webBlockers: string[] = [];
  const webWarnings: string[] = [];
  if (!schema.webRequests) webBlockers.push('WEB_REQUEST_MIGRATION_REQUIRED');
  if (!config.orderTokenSecretConfigured) webBlockers.push('ORDER_TOKEN_SECRET_MISSING');
  if (!dux.snapshotAvailable) webBlockers.push('DUX_CATALOG_SNAPSHOT_UNAVAILABLE');
  if (!isEnabledFlag(env.WEB_ORDERS_ENABLED)) webBlockers.push('WEB_ORDERS_DISABLED');
  if (dux.snapshotFresh === false) webWarnings.push('DUX_CATALOG_SNAPSHOT_STALE');
  if (dux.publicCatalogEnabled === false) webWarnings.push('DUX_PUBLIC_CATALOG_DISABLED');

  const checkoutBlockers = [...config.checkoutConfigurationErrors];
  if (!isEnabledFlag(env.COMMERCE_ENABLED)) checkoutBlockers.push('COMMERCE_DISABLED');
  if (config.guardCode !== null) checkoutBlockers.push(config.guardCode);
  if (!dux.snapshotAvailable) checkoutBlockers.push('DUX_CATALOG_SNAPSHOT_UNAVAILABLE');
  if (dux.snapshotFresh === false) checkoutBlockers.push('DUX_CATALOG_SNAPSHOT_STALE');
  checkoutBlockers.push(
    'DUX_ORDER_PRODUCT_SCHEMA_UNVERIFIED',
    'DUX_ORDER_REFERENCE_RECOVERY_UNVERIFIED',
    'DUX_ORDER_RELEASE_FINALIZE_UNVERIFIED',
  );

  return Object.freeze({
    checkedAt,
    webRequests: Object.freeze({
      schemaReady: schema.webRequests,
      serverEnabled: isEnabledFlag(env.WEB_ORDERS_ENABLED),
      tokenSecretConfigured: config.orderTokenSecretConfigured,
      catalogSnapshotAvailable: dux.snapshotAvailable,
      catalogSnapshotFresh: dux.snapshotFresh,
      totalCount: webCounts.total,
      submittedCount: webCounts.submitted,
      blockers: Object.freeze(unique(webBlockers)),
      warnings: Object.freeze(unique(webWarnings)),
    }),
    checkout: Object.freeze({
      serverEnabled: isEnabledFlag(env.COMMERCE_ENABLED),
      duxApiEnabled: isEnabledFlag(env.DUX_API_ENABLED),
      paymentMode: config.paymentMode,
      paymentAccessTokenConfigured: config.paymentAccessTokenConfigured,
      webhookSecretConfigured: config.webhookSecretConfigured,
      orderTokenSecretConfigured: config.orderTokenSecretConfigured,
      publicSiteConfigured: config.publicSiteConfigured,
      guardCode: config.guardCode,
      automaticDuxMutationAllowed: false,
      blockers: Object.freeze(unique(checkoutBlockers)),
    }),
    dux,
    attention: Object.freeze({ paymentIncidentCount }),
  });
}

async function inspectSchema(database: D1Database): Promise<SchemaInspection> {
  const columns = await database
    .prepare('PRAGMA table_info(checkout_intents)')
    .all<Readonly<{ name: string }>>();
  const columnNames = new Set((columns.results ?? []).map((row) => row.name));
  const trackedObjects = [...WEB_REQUEST_OBJECTS, ...DUX_OBJECTS];
  const placeholders = trackedObjects.map(() => '?').join(', ');
  const objects = await database
    .prepare(`SELECT name FROM sqlite_schema WHERE name IN (${placeholders})`)
    .bind(...trackedObjects)
    .all<Readonly<{ name: string }>>();
  const objectNames = new Set((objects.results ?? []).map((row) => row.name));
  return Object.freeze({
    webRequests:
      WEB_REQUEST_COLUMNS.every((name) => columnNames.has(name)) &&
      WEB_REQUEST_OBJECTS.every((name) => objectNames.has(name)),
    dux: DUX_OBJECTS.every((name) => objectNames.has(name)),
  });
}

async function readWebRequestCounts(database: D1Database): Promise<Readonly<{
  total: number;
  submitted: number;
}>> {
  const row = await database
    .prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN web_request_status = 'submitted' THEN 1 ELSE 0 END) AS submitted
      FROM checkout_intents WHERE intent_kind = 'web_request'`)
    .first<Readonly<{ total: number; submitted: number | null }>>();
  return Object.freeze({ total: row?.total ?? 0, submitted: row?.submitted ?? 0 });
}

async function readPaymentIncidentCount(database: D1Database): Promise<number> {
  const row = await database
    .prepare(`SELECT COUNT(*) AS count FROM (
      SELECT o.id
      FROM orders AS o
      INNER JOIN payments AS p ON p.order_id = o.id
      WHERE p.amount_minor = o.total_minor
        AND p.currency = o.currency
        AND p.external_reference = o.id
      GROUP BY o.id
      HAVING SUM(CASE WHEN p.mapped_status = 'approved' THEN 1 ELSE 0 END) > 1
        OR (
          SUM(CASE WHEN p.mapped_status = 'approved' THEN 1 ELSE 0 END) > 0
          AND o.status <> 'approved'
        )
        OR (
          SUM(CASE WHEN p.mapped_status = 'approved' THEN 1 ELSE 0 END) = 0
          AND SUM(CASE WHEN p.mapped_status = 'refunded' THEN 1 ELSE 0 END) > 0
          AND o.status <> 'refunded'
        )
    )`)
    .first<Readonly<{ count: number }>>();
  return row?.count ?? 0;
}

async function readDuxStatus(
  database: D1Database,
  env: Env,
  schemaReady: boolean,
  nowMilliseconds: number,
): Promise<DuxStatus> {
  const defaults = Object.freeze({
    schemaReady,
    apiEnabled: isEnabledFlag(env.DUX_API_ENABLED),
    credentialsConfigured: duxCredentialsConfigured(env),
    snapshotCollectionEnabled: null,
    publicCatalogEnabled: null,
    publicCutoverEnabled: null,
    snapshotAvailable: false,
    snapshotItemCount: null,
    snapshotSyncedAt: null,
    snapshotFresh: null,
    lastSyncStatus: null,
    lastSyncCompletedAt: null,
    linkAttentionCount: null,
    operationAttentionCount: null,
    orderApiContract: orderApiContract(),
  } satisfies DuxStatus);
  if (!schemaReady) return defaults;

  try {
    const [control, snapshot, sync, attention] = await Promise.all([
      database
        .prepare(`SELECT snapshot_collection_enabled, public_catalog_enabled, public_cutover_enabled
          FROM dux_catalog_control WHERE company_id = '12862' LIMIT 1`)
        .first<Readonly<{
          snapshot_collection_enabled: number;
          public_catalog_enabled: number;
          public_cutover_enabled: number;
        }>>(),
      database
        .prepare(`SELECT catalog.item_count, catalog.synced_at, run.status AS source_status
          FROM dux_catalog_snapshots_v2 AS catalog
          INNER JOIN dux_sync_runs AS run ON run.id = catalog.inventory_run_id
          WHERE catalog.id = 1 LIMIT 1`)
        .first<Readonly<{ item_count: number; synced_at: string; source_status: string }>>(),
      database
        .prepare(`SELECT status, completed_at FROM dux_sync_runs
          ORDER BY started_at DESC LIMIT 1`)
        .first<Readonly<{ status: string; completed_at: string | null }>>(),
      database
        .prepare(`SELECT
          (SELECT COUNT(*) FROM dux_order_links
            WHERE reservation_state IN ('pending', 'uncertain', 'compensation_pending', 'blocked')) AS link_attention,
          (SELECT COUNT(*) FROM dux_order_operations
            WHERE status IN ('pending', 'uncertain', 'compensation_pending', 'failed', 'blocked')) AS operation_attention`)
        .first<Readonly<{ link_attention: number; operation_attention: number }>>(),
    ]);
    const snapshotFresh = snapshot === null
      ? null
      : isSnapshotFresh(snapshot.synced_at, env, nowMilliseconds);
    return Object.freeze({
      ...defaults,
      snapshotCollectionEnabled: control === null ? null : control.snapshot_collection_enabled === 1,
      publicCatalogEnabled: control === null ? null : control.public_catalog_enabled === 1,
      publicCutoverEnabled: control === null ? null : control.public_cutover_enabled === 1,
      snapshotAvailable:
        snapshot !== null &&
        snapshot.item_count > 0 &&
        (snapshot.source_status === 'succeeded' || snapshot.source_status === 'partial'),
      snapshotItemCount: snapshot?.item_count ?? null,
      snapshotSyncedAt: snapshot?.synced_at ?? null,
      snapshotFresh,
      lastSyncStatus: sync?.status ?? null,
      lastSyncCompletedAt: sync?.completed_at ?? null,
      linkAttentionCount: attention?.link_attention ?? 0,
      operationAttentionCount: attention?.operation_attention ?? 0,
    });
  } catch {
    return Object.freeze({ ...defaults, schemaReady: false });
  }
}

function isSnapshotFresh(syncedAt: string, env: Env, nowMilliseconds: number): boolean {
  const timestamp = Date.parse(syncedAt);
  if (!Number.isFinite(timestamp) || timestamp > nowMilliseconds) return false;
  try {
    return nowMilliseconds - timestamp <= readDuxSnapshotMaxAgeSeconds(env) * 1_000;
  } catch {
    return false;
  }
}

function readConfiguration(env: Env): Readonly<{
  paymentMode: 'sandbox' | 'production' | 'invalid_or_missing';
  paymentAccessTokenConfigured: boolean;
  webhookSecretConfigured: boolean;
  orderTokenSecretConfigured: boolean;
  publicSiteConfigured: boolean;
  guardCode: string | null;
  checkoutConfigurationErrors: readonly string[];
}> {
  const errors: string[] = [];
  let mode: 'sandbox' | 'production' | null = null;
  try {
    mode = requireCommerceMode(env);
  } catch (error: unknown) {
    errors.push(errorCode(error, 'PAYMENT_MODE_INVALID'));
  }
  let paymentAccessTokenConfigured = false;
  if (mode !== null) {
    try {
      void requireMercadoPagoAccessToken(env, mode);
      paymentAccessTokenConfigured = true;
    } catch (error: unknown) {
      errors.push(errorCode(error, 'PAYMENT_CREDENTIALS_MISSING'));
    }
  }
  const webhookSecretConfigured = validSecret(
    env.MERCADO_PAGO_WEBHOOK_SECRET,
    'WEBHOOK_SECRET_MISSING',
    errors,
  );
  const orderTokenSecretConfigured = validSecret(
    env.ORDER_TOKEN_SECRET,
    'ORDER_TOKEN_SECRET_MISSING',
    errors,
  );
  let publicSiteConfigured = false;
  try {
    void requirePublicSiteUrl(env);
    publicSiteConfigured = true;
  } catch (error: unknown) {
    errors.push(errorCode(error, 'SITE_URL_INVALID'));
  }
  let guardCode: string | null = null;
  try {
    assertDuxCommerceLifecycleAvailable(env);
  } catch (error: unknown) {
    guardCode = errorCode(error, 'COMMERCE_GUARD_UNAVAILABLE');
  }
  return Object.freeze({
    paymentMode: mode ?? 'invalid_or_missing',
    paymentAccessTokenConfigured,
    webhookSecretConfigured,
    orderTokenSecretConfigured,
    publicSiteConfigured,
    guardCode,
    checkoutConfigurationErrors: Object.freeze(unique(errors)),
  });
}

function validSecret(value: string | undefined, code: string, errors: string[]): boolean {
  try {
    void requireSecret(value, code, 'Configuración ausente.', 32);
    return true;
  } catch (error: unknown) {
    errors.push(errorCode(error, code));
    return false;
  }
}

function duxCredentialsConfigured(env: Env): boolean {
  return (
    typeof env.DUX_API_TOKEN === 'string' &&
    env.DUX_API_TOKEN.length > 0 &&
    env.DUX_API_TOKEN.length <= 4_096 &&
    identifier(env.DUX_COMPANY_ID) &&
    identifier(env.DUX_BRANCH_ID) &&
    identifier(env.DUX_DEPOSIT_ID)
  );
}

function identifier(value: string | undefined): boolean {
  return typeof value === 'string' && /^[1-9][0-9]{0,18}$/u.test(value);
}

function errorCode(error: unknown, fallback: string): string {
  return error instanceof HttpError ? error.code : fallback;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function orderApiContract(): DuxStatus['orderApiContract'] {
  return Object.freeze({
    reviewedAt: '2026-09-10',
    createEndpoint: '/pedido/nuevopedido',
    queryEndpoint: '/pedidos',
    queryByReferenceDocumented: false,
    productObjectSchemaVerified: false,
    releaseOrFinalizeDocumented: false,
  });
}
