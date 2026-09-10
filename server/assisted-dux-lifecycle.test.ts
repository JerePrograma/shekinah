import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseAssistedCheckoutInput, prepareAssistedCheckout } from './assisted-checkout';
import {
  confirmAssistedDuxLifecycle,
  inspectAssistedDuxLifecycle,
} from './assisted-dux-lifecycle';
import type { Env } from './platform';
import { SqliteD1 } from './test/sqlite-d1';

function migrationsThrough(lastName: string): string {
  return readdirSync(resolve(process.cwd(), 'migrations'))
    .filter((name) => /^\d{4}_.*\.sql$/u.test(name) && name <= lastName)
    .sort()
    .map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8'))
    .join('\n');
}

const migrations = migrationsThrough('0023_assisted_dux_lifecycle_financial_guard.sql');
const migrationsBeforeFinancialGuard = migrationsThrough('0022_assisted_dux_order_number_unique.sql');
const env: Env = {
  DUX_COMPANY_ID: '12862', DUX_BRANCH_ID: '1', DUX_DEPOSIT_ID: '25566', DUX_SNAPSHOT_MAX_AGE_SECONDS: '900',
};
const productId = 'dux-lifecycle-producto-0000000000000001';

function seedAuthority(database: SqliteD1, timestamp: string): string {
  const payload = JSON.stringify({
    schemaVersion: 2, priceListName: 'PRECIOS DEL NEGOCIO',
    items: [{ slug: productId, code: 'LIFE-1', name: 'Producto lifecycle', priceAmount: 100,
      priceStatus: 'usable', categories: [], unitsPerPackage: null, imageUrl: null, description: null }],
  });
  const version = createHash('sha256').update(payload).digest('hex');
  const db = database.database;
  db.prepare(`INSERT INTO dux_tenant_context (id, api_version, company_id, company_name, branch_id, branch_name,
    deposit_id, deposit_name, verified_at, updated_at)
    VALUES (1, 'v2', '12862', 'Empresa', '1', 'Sucursal', '25566', 'Depósito', ?, ?)`)
    .run(timestamp, timestamp);
  db.prepare(`UPDATE dux_catalog_control SET snapshot_collection_enabled = 1, updated_by = 'test', updated_at = ?
    WHERE company_id = '12862'`).run(timestamp);
  db.prepare(`INSERT INTO dux_sync_runs (id, kind, status, trigger_actor, processed_count, mapped_count, unmapped_count,
    ambiguous_count, absent_count, failed_count, started_at, completed_at, created_at, updated_at)
    VALUES ('dux_sync_lifecycle', 'manual', 'succeeded', 'test', 1, 0, 1, 0, 0, 0, ?, ?, ?, ?)`)
    .run(timestamp, timestamp, timestamp, timestamp);
  db.prepare(`INSERT INTO dux_catalog_snapshots_v2 (id, inventory_run_id, catalog_version, price_list_name, item_count,
    payload_json, synced_at, created_at, updated_at)
    VALUES (1, 'dux_sync_lifecycle', ?, 'PRECIOS DEL NEGOCIO', 1, ?, ?, ?, ?)`)
    .run(version, payload, timestamp, timestamp, timestamp);
  db.prepare(`UPDATE dux_catalog_control SET public_catalog_enabled = 1, updated_by = 'test', updated_at = ?
    WHERE company_id = '12862'`).run(timestamp);
  return version;
}

async function seedPrepared(database: SqliteD1, timestamp: string): Promise<string> {
  const version = seedAuthority(database, timestamp);
  const requestId = `req_${'l'.repeat(24)}`;
  const requestSnapshot = JSON.stringify({
    schemaVersion: 1, catalogVersion: version, observedAt: timestamp,
    lines: [{ productId, duxCode: 'LIFE-1', name: 'Producto lifecycle', requestedQuantity: 2, observedUnitPriceMinor: 10000 }],
    fulfillment: { method: 'coordinated_pickup', fullName: 'Cliente lifecycle', phone: '5491100000000',
      address: '', locality: '', province: '', postalCode: '' },
    totalMinor: null, shippingMinor: 0, quantityStatus: 'requires_confirmation',
  });
  database.database.prepare(`INSERT INTO checkout_intents (
    checkout_idempotency_key, fulfillment_fingerprint, cart_fingerprint, created_at, intent_kind,
    web_request_id, web_request_token_hash, web_request_owner_hash, web_request_fingerprint,
    web_request_json, web_request_status, web_request_updated_at)
    VALUES (?, 'fulfillment', 'cart', ?, 'web_request', ?, ?, ?, ?, ?, 'submitted', ?)`)
    .run(crypto.randomUUID(), timestamp, requestId, 'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), requestSnapshot, timestamp);
  database.database.prepare(`UPDATE checkout_intents SET web_request_status = 'accepted', web_request_resolved_by = 'admin',
    web_request_resolved_at = ?, web_request_updated_at = ? WHERE web_request_id = ?`)
    .run(timestamp, timestamp, requestId);
  return (await prepareAssistedCheckout(database, env, requestId,
    parseAssistedCheckoutInput({ duxOrderNumber: 'PED-LIFE-1', duxOrderId: null, shippingMinor: 0, confirmedExactReservation: true }),
    'admin:test', new Date(timestamp))).orderId;
}

function setPreference(database: SqliteD1, orderId: string, attemptedAt: string): void {
  database.database.prepare(`UPDATE orders SET mp_preference_attempted_at = ?, mp_preference_attempt_token = 'attempt'
    WHERE id = ?`).run(attemptedAt, orderId);
  database.database.prepare(`UPDATE orders SET status = 'pending', mp_preference_id = 'pref-life',
    mp_checkout_url = 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-life',
    mp_preference_attempt_token = NULL WHERE id = ?`).run(orderId);
}

function addPayment(database: SqliteD1, orderId: string, status: 'pending' | 'approved' | 'refunded', timestamp: string): void {
  database.database.prepare(`INSERT INTO payments (
    provider_payment_id, order_id, mapped_status, provider_status, amount_minor, currency,
    external_reference, last_event_key, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 20000, 'ARS', ?, ?, ?, ?)`)
    .run(`${status}-${crypto.randomUUID()}`, orderId, status, status, orderId, crypto.randomUUID(), timestamp, timestamp);
  database.database.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, timestamp, orderId);
}

describe('lifecycle Dux asistido', () => {
  it('falla cerrado si 0023 todavía no está aplicada', async () => {
    const database = new SqliteD1(migrationsBeforeFinancialGuard);
    try {
      await expect(inspectAssistedDuxLifecycle(
        database,
        `ord_${'m'.repeat(24)}`,
        'release',
      )).rejects.toMatchObject({
        status: 503,
        code: 'ASSISTED_DUX_LIFECYCLE_MIGRATION_REQUIRED',
      });
      expect((await database.prepare('SELECT COUNT(*) AS count FROM dux_order_operations').first())?.count).toBe(0);
    } finally { database.close(); }
  });

  it('libera sin consultar pagos cuando nunca existió un intento Mercado Pago y el replay es idempotente', async () => {
    const database = new SqliteD1(migrations);
    const now = new Date();
    try {
      const orderId = await seedPrepared(database, now.toISOString());
      expect(await inspectAssistedDuxLifecycle(database, orderId, 'release', now.getTime())).toMatchObject({
        completed: false, requiresPaymentReconciliation: false,
      });
      const first = await confirmAssistedDuxLifecycle(database, orderId, 'release', 'admin:test', null, now);
      const second = await confirmAssistedDuxLifecycle(database, orderId, 'release', 'admin:test', null, now);
      expect(first).toMatchObject({ changed: true, reservationStatus: 'released', paymentStatus: 'none' });
      expect(second).toMatchObject({ changed: false, reservationStatus: 'released' });
      expect((await database.prepare(`SELECT COUNT(*) AS count FROM dux_order_operations
        WHERE order_id = ? AND action = 'release'`).bind(orderId).first())?.count).toBe(1);
    } finally { database.close(); }
  });

  it('bloquea release durante la ventana de pago aunque no haya payment local', async () => {
    const database = new SqliteD1(migrations);
    const now = new Date();
    try {
      const orderId = await seedPrepared(database, now.toISOString());
      setPreference(database, orderId, now.toISOString());
      await expect(inspectAssistedDuxLifecycle(database, orderId, 'release', now.getTime() + 29 * 60 * 1000))
        .rejects.toMatchObject({ code: 'ASSISTED_RELEASE_PAYMENT_WINDOW_ACTIVE' });
    } finally { database.close(); }
  });

  it.each(['pending', 'approved'] as const)('bloquea release con pago %s aun después de la ventana', async (status) => {
    const database = new SqliteD1(migrations);
    const now = new Date();
    const attemptedAt = new Date(now.getTime() - 31 * 60 * 1000);
    try {
      const orderId = await seedPrepared(database, now.toISOString());
      setPreference(database, orderId, attemptedAt.toISOString());
      addPayment(database, orderId, status, now.toISOString());
      await expect(confirmAssistedDuxLifecycle(database, orderId, 'release', 'admin:test', now, now))
        .rejects.toMatchObject({ code: 'ASSISTED_RELEASE_PAYMENT_BLOCKED' });
    } finally { database.close(); }
  });

  it('finaliza sólo con preferencia y un pago aprobado limpio conciliado recientemente', async () => {
    const database = new SqliteD1(migrations);
    const now = new Date();
    try {
      const orderId = await seedPrepared(database, now.toISOString());
      await expect(confirmAssistedDuxLifecycle(database, orderId, 'finalize', 'admin:test', null, now))
        .rejects.toMatchObject({ code: 'ASSISTED_FINALIZE_PAYMENT_REQUIRED' });
      setPreference(database, orderId, new Date(now.getTime() - 5_000).toISOString());
      addPayment(database, orderId, 'approved', now.toISOString());
      const result = await confirmAssistedDuxLifecycle(database, orderId, 'finalize', 'admin:test', now, now);
      expect(result).toMatchObject({ changed: true, reservationStatus: 'finalized', paymentStatus: 'approved' });
      expect((await database.prepare('SELECT reservation_state FROM dux_order_links WHERE order_id = ?')
        .bind(orderId).first())?.reservation_state).toBe('finalized');
    } finally { database.close(); }
  });

  it('el guard SQL rechaza una carrera que introduce un pago pendiente antes del release', async () => {
    const database = new SqliteD1(migrations);
    const now = new Date();
    const attemptedAt = new Date(now.getTime() - 31 * 60 * 1000);
    try {
      const orderId = await seedPrepared(database, now.toISOString());
      setPreference(database, orderId, attemptedAt.toISOString());
      addPayment(database, orderId, 'pending', now.toISOString());
      const requestJson = JSON.stringify({ method: 'assisted_admin', orderId, action: 'release', paymentReconciledAt: now.toISOString() });
      expect(() => database.database.prepare(`INSERT INTO dux_order_operations (
        id, idempotency_key, order_id, action, status, request_json, response_json,
        provider_operation_id, error_code, attempted_at, confirmed_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'release', 'confirmed', ?, '{}', 'PED-LIFE-1', NULL, ?, ?, ?, ?)`)
        .run(`duxop_${'r'.repeat(24)}`, `assisted-release:${orderId}`, orderId, requestJson,
          now.toISOString(), now.toISOString(), now.toISOString(), now.toISOString())).toThrow(/DUX_ASSISTED_RELEASE_FINANCIAL_GUARD/u);
      expect((await database.prepare('SELECT reservation_state FROM dux_order_links WHERE order_id = ?')
        .bind(orderId).first())?.reservation_state).toBe('confirmed');
    } finally { database.close(); }
  });
});
