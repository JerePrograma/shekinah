import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readCommerceReadiness } from './commerce-readiness';
import type { Env } from './platform';
import { SqliteD1 } from './test/sqlite-d1';

const migrationsThrough = (last: number) => Array.from({ length: last }, (_, index) => {
  const number = String(index + 1).padStart(4, '0');
  const names: Record<string, string> = {
    '0001': '0001_commerce.sql',
    '0002': '0002_fulfillment_and_retention.sql',
    '0003': '0003_checkout_intent_cart_fingerprint.sql',
    '0004': '0004_catalog_admin.sql',
    '0005': '0005_admin_auth.sql',
    '0006': '0006_analytics_manual_payment_click.sql',
    '0007': '0007_whatsapp_order_reservations.sql',
    '0008': '0008_checkout_pro_stock_and_whatsapp_identity.sql',
    '0009': '0009_mercadolibre_catalog_and_inventory.sql',
    '0010': '0010_checkout_terminal_reservation_release.sql',
    '0011': '0011_local_order_stock_required.sql',
    '0012': '0012_dux_authoritative_inventory.sql',
    '0013': '0013_remove_local_catalog_stock.sql',
    '0014': '0014_dux_atomic_inventory_snapshots.sql',
    '0015': '0015_dux_catalog_snapshot.sql',
    '0016': '0016_dux_editorial_links_and_cutover.sql',
    '0017': '0017_dux_complete_public_catalog.sql',
    '0018': '0018_retire_manual_catalog.sql',
    '0019': '0019_mercadolibre_editorial.sql',
    '0020': '0020_web_order_requests.sql',
  };
  const name = names[number];
  if (name === undefined) throw new Error(`Migración de prueba ausente: ${number}`);
  return readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8');
}).join('\n');

const baseEnv = Object.freeze({
  WEB_ORDERS_ENABLED: 'false',
  COMMERCE_ENABLED: 'false',
  DUX_API_ENABLED: 'false',
  DUX_API_TOKEN: 'dux-token-test-only',
  DUX_COMPANY_ID: '12862',
  DUX_BRANCH_ID: '1',
  DUX_DEPOSIT_ID: '25566',
  DUX_SNAPSHOT_MAX_AGE_SECONDS: '900',
  ORDER_TOKEN_SECRET: 'o'.repeat(40),
  MERCADO_PAGO_CHECKOUT_MODE: 'sandbox',
  MERCADO_PAGO_ACCESS_TOKEN: 'test-access-token-long-enough',
  MERCADO_PAGO_WEBHOOK_SECRET: 'w'.repeat(40),
  PUBLIC_SITE_URL: 'https://shekinah.ar',
} satisfies Env);

function database(last = 20): SqliteD1 {
  return new SqliteD1(migrationsThrough(last));
}

async function seedSnapshot(db: SqliteD1, syncedAt: string): Promise<void> {
  await db.prepare(`INSERT INTO dux_tenant_context (
    id, api_version, company_id, company_name, branch_id, branch_name,
    deposit_id, deposit_name, verified_at, updated_at
  ) VALUES (1, 'v2', '12862', 'Empresa de prueba', '1', 'Sucursal de prueba',
    '25566', 'Depósito de prueba', ?, ?)
  ON CONFLICT(id) DO UPDATE SET verified_at = excluded.verified_at, updated_at = excluded.updated_at`)
    .bind(syncedAt, syncedAt)
    .run();
  await db.prepare(`UPDATE dux_catalog_control
    SET snapshot_collection_enabled = 1, updated_at = ?, updated_by = 'test'
    WHERE company_id = '12862'`).bind(syncedAt).run();
  await db.prepare(`INSERT INTO dux_sync_runs (
    id, kind, status, processed_count, mapped_count, unmapped_count,
    ambiguous_count, absent_count, failed_count, started_at, completed_at,
    created_at, updated_at, trigger_actor
  ) VALUES (
    'dux_sync_readiness', 'manual', 'succeeded', 1, 0, 1, 0, 0, 0,
    ?, ?, ?, ?, 'test'
  )`).bind(syncedAt, syncedAt, syncedAt, syncedAt).run();
  const payload = JSON.stringify({
    schemaVersion: 2,
    priceListName: 'PRECIOS DEL NEGOCIO',
    items: [{
      slug: 'producto-prueba',
      code: 'TEST-1',
      name: 'Producto de prueba',
      priceAmount: 100,
      priceStatus: 'usable',
      categories: [],
      unitsPerPackage: null,
      imageUrl: null,
      description: null,
    }],
  });
  await db.prepare(`INSERT INTO dux_catalog_snapshots_v2 (
    id, inventory_run_id, catalog_version, price_list_name, item_count,
    payload_json, synced_at, created_at, updated_at
  ) VALUES (1, 'dux_sync_readiness', ?, 'PRECIOS DEL NEGOCIO', 1, ?, ?, ?, ?)`)
    .bind('a'.repeat(64), payload, syncedAt, syncedAt, syncedAt).run();
  await db.prepare(`UPDATE dux_catalog_control
    SET public_catalog_enabled = 1, updated_at = ?, updated_by = 'test'
    WHERE company_id = '12862'`).bind(syncedAt).run();
}

describe('preparación comercial administrativa', () => {
  it('detecta 0020 ausente sin inventar que las solicitudes web están listas', async () => {
    const db = database(19);
    try {
      const result = await readCommerceReadiness(db, baseEnv, Date.parse('2026-09-10T12:00:00.000Z'));
      expect(result.webRequests.schemaReady).toBe(false);
      expect(result.webRequests.totalCount).toBeNull();
      expect(result.webRequests.blockers).toContain('WEB_REQUEST_MIGRATION_REQUIRED');
      expect(result.checkout.automaticDuxMutationAllowed).toBe(false);
      expect(result.checkout.blockers).toContain('DUX_ORDER_PRODUCT_SCHEMA_UNVERIFIED');
    } finally {
      db.close();
    }
  });

  it('distingue código desplegado, esquema aplicado y flags todavía cerrados', async () => {
    const db = database();
    try {
      await seedSnapshot(db, '2026-09-10T11:55:00.000Z');
      const result = await readCommerceReadiness(db, baseEnv, Date.parse('2026-09-10T12:00:00.000Z'));
      expect(result.webRequests).toMatchObject({
        schemaReady: true,
        serverEnabled: false,
        tokenSecretConfigured: true,
        catalogSnapshotAvailable: true,
        catalogSnapshotFresh: true,
        totalCount: 0,
        submittedCount: 0,
      });
      expect(result.webRequests.blockers).toEqual(['WEB_ORDERS_DISABLED']);
      expect(result.dux).toMatchObject({
        schemaReady: true,
        publicCatalogEnabled: true,
        publicCutoverEnabled: false,
        snapshotAvailable: true,
        snapshotItemCount: 1,
        snapshotFresh: true,
        lastSyncStatus: 'succeeded',
      });
      expect(result.checkout.guardCode).toBe('DUX_API_DISABLED');
      expect(result.checkout.blockers).toContain('COMMERCE_DISABLED');
      expect(result.checkout.blockers).toContain('DUX_ORDER_REFERENCE_RECOVERY_UNVERIFIED');
    } finally {
      db.close();
    }
  });

  it('marca snapshot obsoleto sin borrar la evidencia disponible', async () => {
    const db = database();
    try {
      await seedSnapshot(db, '2026-09-10T10:00:00.000Z');
      const result = await readCommerceReadiness(db, baseEnv, Date.parse('2026-09-10T12:00:00.000Z'));
      expect(result.dux.snapshotAvailable).toBe(true);
      expect(result.dux.snapshotFresh).toBe(false);
      expect(result.webRequests.warnings).toContain('DUX_CATALOG_SNAPSHOT_STALE');
      expect(result.checkout.blockers).toContain('DUX_CATALOG_SNAPSHOT_STALE');
    } finally {
      db.close();
    }
  });

  it('cuenta solicitudes e incidencias financieras sin exponer secretos ni PII', async () => {
    const db = database();
    try {
      await seedSnapshot(db, '2026-09-10T11:55:00.000Z');
      await db.prepare(`INSERT INTO checkout_intents (
        checkout_idempotency_key, fulfillment_fingerprint, cart_fingerprint,
        created_at, intent_kind, web_request_id, web_request_token_hash,
        web_request_owner_hash, web_request_fingerprint, web_request_json,
        web_request_status, web_request_updated_at
      ) VALUES (?, 'f', 'c', ?, 'web_request', ?, ?, ?, ?, ?, 'submitted', ?)`)
        .bind(
          crypto.randomUUID(),
          '2026-09-10T11:58:00.000Z',
          'req_abcdefghijklmnopqrstuvwx',
          'b'.repeat(64),
          'c'.repeat(64),
          'd'.repeat(64),
          JSON.stringify({ schemaVersion: 1 }),
          '2026-09-10T11:58:00.000Z',
        )
        .run();
      await db.prepare(`INSERT INTO orders (
        id, public_token_hash, checkout_idempotency_key, cart_fingerprint,
        status, currency, total_minor, item_count, created_at, updated_at
      ) VALUES ('ord_readiness_test_1234567890', 'token-hash', ?, 'cart',
        'pending', 'ARS', 10000, 1, ?, ?)`)
        .bind(crypto.randomUUID(), '2026-09-10T11:50:00.000Z', '2026-09-10T11:50:00.000Z')
        .run();
      await db.prepare(`INSERT INTO payments (
        provider_payment_id, order_id, mapped_status, provider_status,
        amount_minor, currency, external_reference, last_event_key,
        created_at, updated_at
      ) VALUES ('payment-readiness', 'ord_readiness_test_1234567890', 'approved',
        'approved', 10000, 'ARS', 'ord_readiness_test_1234567890', 'event', ?, ?)`)
        .bind('2026-09-10T11:51:00.000Z', '2026-09-10T11:51:00.000Z')
        .run();
      const result = await readCommerceReadiness(db, baseEnv, Date.parse('2026-09-10T12:00:00.000Z'));
      expect(result.webRequests.totalCount).toBe(1);
      expect(result.webRequests.submittedCount).toBe(1);
      expect(result.attention.paymentIncidentCount).toBe(1);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(baseEnv.DUX_API_TOKEN);
      expect(serialized).not.toContain(baseEnv.ORDER_TOKEN_SECRET);
      expect(serialized).not.toContain('Cliente privado');
    } finally {
      db.close();
    }
  });

  it('valida configuración sin devolver credenciales y conserva el guard de lifecycle', async () => {
    const db = database();
    try {
      const enabledEnv: Env = Object.freeze({
        ...baseEnv,
        WEB_ORDERS_ENABLED: 'true',
        COMMERCE_ENABLED: 'true',
        DUX_API_ENABLED: 'true',
      });
      await seedSnapshot(db, '2026-09-10T11:55:00.000Z');
      const result = await readCommerceReadiness(db, enabledEnv, Date.parse('2026-09-10T12:00:00.000Z'));
      expect(result.webRequests.blockers).toEqual([]);
      expect(result.checkout.guardCode).toBe('DUX_ORDER_LIFECYCLE_UNAVAILABLE');
      expect(result.checkout.blockers).toContain('DUX_ORDER_LIFECYCLE_UNAVAILABLE');
      expect(result.checkout.blockers).toContain('DUX_ORDER_RELEASE_FINALIZE_UNVERIFIED');
      expect(JSON.stringify(result)).not.toContain(enabledEnv.MERCADO_PAGO_ACCESS_TOKEN);
    } finally {
      db.close();
    }
  });
});
