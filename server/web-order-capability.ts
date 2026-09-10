import { readDuxSnapshotMaxAgeSeconds } from './config';
import { readDuxCatalogSnapshot } from './dux-catalog';
import { requireSecret } from './http';
import type { D1Database, Env } from './platform';

const REQUIRED_COLUMNS = [
  'intent_kind',
  'web_request_id',
  'web_request_token_hash',
  'web_request_owner_hash',
  'web_request_fingerprint',
  'web_request_json',
  'web_request_status',
] as const;

const REQUIRED_OBJECTS = [
  'commerce_request_rate_limits',
  'web_request_initial_guard',
  'web_request_snapshot_immutable',
  'web_request_resolution_guard',
  'web_request_preserve_history',
] as const;

/**
 * Capacidad pública deliberadamente binaria. No expone nombres de secretos,
 * tablas, flags ni bloqueos; el diagnóstico detallado permanece en admin.
 */
export async function webOrderRegistrationEnabled(
  database: D1Database,
  env: Env,
  nowMilliseconds = Date.now(),
): Promise<boolean> {
  if (env.WEB_ORDERS_ENABLED !== 'true' || !Number.isFinite(nowMilliseconds)) return false;
  try {
    void requireSecret(
      env.ORDER_TOKEN_SECRET,
      'ORDER_TOKEN_SECRET_MISSING',
      'La protección de solicitudes no está configurada.',
      32,
    );
    const columns = await database
      .prepare('PRAGMA table_info(checkout_intents)')
      .all<Readonly<{ name: string }>>();
    const columnNames = new Set((columns.results ?? []).map((row) => row.name));
    if (!REQUIRED_COLUMNS.every((name) => columnNames.has(name))) return false;

    const names = [
      ...REQUIRED_OBJECTS,
      'orders_require_web_request_conversion',
      'web_request_checkout_order_insert_guard',
    ];
    const placeholders = names.map(() => '?').join(', ');
    const objects = await database.prepare(`SELECT name FROM sqlite_schema
      WHERE name IN (${placeholders})`).bind(...names).all<Readonly<{ name: string }>>();
    const objectNames = new Set((objects.results ?? []).map((row) => row.name));
    if (!REQUIRED_OBJECTS.every((name) => objectNames.has(name))) return false;
    if (
      !objectNames.has('orders_require_web_request_conversion') &&
      !objectNames.has('web_request_checkout_order_insert_guard')
    ) {
      return false;
    }

    const control = await database.prepare(`SELECT public_catalog_enabled
      FROM dux_catalog_control WHERE company_id = '12862' LIMIT 1`)
      .first<Readonly<{ public_catalog_enabled: number }>>();
    if (control?.public_catalog_enabled !== 1) return false;

    const snapshot = await readDuxCatalogSnapshot(database);
    const observedAt = Date.parse(snapshot.stockReadAt ?? snapshot.syncedAt);
    if (!Number.isFinite(observedAt) || observedAt > nowMilliseconds) return false;
    return nowMilliseconds - observedAt <= readDuxSnapshotMaxAgeSeconds(env) * 1000;
  } catch {
    return false;
  }
}
