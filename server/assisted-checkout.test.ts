import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseAssistedCheckoutInput, prepareAssistedCheckout, previewAssistedCheckout } from './assisted-checkout';
import type { Env } from './platform';
import { SqliteD1 } from './test/sqlite-d1';

const migrations = readdirSync(resolve(process.cwd(), 'migrations'))
  .filter((name) => /^\d{4}_.*\.sql$/u.test(name) && name <= '0022_assisted_dux_order_number_unique.sql')
  .sort()
  .map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8'))
  .join('\n');

const now = '2026-09-10T14:00:00.000Z';
const version = 'a'.repeat(64);
const env: Env = {
  DUX_COMPANY_ID: '12862',
  DUX_BRANCH_ID: '1',
  DUX_DEPOSIT_ID: '25566',
  DUX_SNAPSHOT_MAX_AGE_SECONDS: '900',
};

function seedAuthority(database: SqliteD1): void {
  const db = database.database;
  db.prepare(`INSERT INTO dux_tenant_context (
    id, api_version, company_id, company_name, branch_id, branch_name,
    deposit_id, deposit_name, verified_at, updated_at
  ) VALUES (1, 'v2', '12862', 'Empresa prueba', '1', 'Sucursal prueba',
    '25566', 'Depósito prueba', ?, ?)`).run(now, now);
  db.prepare(`UPDATE dux_catalog_control SET snapshot_collection_enabled = 1,
    updated_by = 'test', updated_at = ? WHERE company_id = '12862'`).run(now);
  db.prepare(`INSERT INTO dux_sync_runs (
    id, kind, status, trigger_actor, processed_count, mapped_count, unmapped_count,
    ambiguous_count, absent_count, failed_count, started_at, completed_at, created_at, updated_at
  ) VALUES ('dux_sync_assisted_runtime', 'manual', 'succeeded', 'test', 1, 0, 1, 0, 0, 0,
    ?, ?, ?, ?)`).run(now, now, now, now);
  const payload = JSON.stringify({
    schemaVersion: 2,
    priceListName: 'PRECIOS DEL NEGOCIO',
    items: [{
      slug: 'dux-producto-a-0000000000000001', code: 'A-001', name: 'Producto A',
      priceAmount: 12.5, priceStatus: 'usable', categories: [], unitsPerPackage: null,
      imageUrl: null, description: null,
    }],
  });
  db.prepare(`INSERT INTO dux_catalog_snapshots_v2 (
    id, inventory_run_id, catalog_version, price_list_name, item_count,
    payload_json, synced_at, created_at, updated_at
  ) VALUES (1, 'dux_sync_assisted_runtime', ?, 'PRECIOS DEL NEGOCIO', 1, ?, ?, ?, ?)`)
    .run(version, payload, now, now, now);
  db.prepare(`UPDATE dux_catalog_control SET public_catalog_enabled = 1,
    updated_by = 'test', updated_at = ? WHERE company_id = '12862'`).run(now);
}

function seedRequest(database: SqliteD1, suffix: string, method: 'coordinated_pickup' | 'correo_argentino', accepted = true): string {
  const id = `req_${suffix.repeat(24)}`;
  const snapshot = JSON.stringify({
    schemaVersion: 1,
    catalogVersion: 'f'.repeat(64),
    observedAt: '2026-09-10T13:00:00.000Z',
    lines: [{
      productId: 'dux-producto-a-0000000000000001', duxCode: 'A-001',
      name: 'Producto A anterior', requestedQuantity: 2, observedUnitPriceMinor: 1000,
    }],
    fulfillment: method === 'coordinated_pickup'
      ? { method, fullName: 'Cliente Prueba', phone: '5491100000000', address: '', locality: '', province: '', postalCode: '' }
      : { method, fullName: 'Cliente Prueba', phone: '5491100000000', address: 'Calle 100', locality: 'CABA', province: 'Buenos Aires', postalCode: 'C1000AAA' },
    totalMinor: null,
    shippingMinor: method === 'coordinated_pickup' ? 0 : null,
    quantityStatus: 'requires_confirmation',
  });
  database.database.prepare(`INSERT INTO checkout_intents (
    checkout_idempotency_key, fulfillment_fingerprint, cart_fingerprint, created_at,
    intent_kind, web_request_id, web_request_token_hash, web_request_owner_hash,
    web_request_fingerprint, web_request_json, web_request_status, web_request_updated_at
  ) VALUES (?, 'fulfillment', 'request-cart', ?, 'web_request', ?, ?, ?, ?, ?, 'submitted', ?)`)
    .run(crypto.randomUUID(), now, id, suffix.repeat(64), '2'.repeat(64), '3'.repeat(64), snapshot, now);
  if (accepted) {
    database.database.prepare(`UPDATE checkout_intents SET web_request_status = 'accepted',
      web_request_resolved_by = 'admin-test', web_request_resolved_at = ?, web_request_updated_at = ?
      WHERE web_request_id = ?`).run(now, now, id);
  }
  return id;
}

function input(orderNumber: string, shippingMinor: number) {
  return parseAssistedCheckoutInput({
    duxOrderNumber: orderNumber,
    duxOrderId: null,
    shippingMinor,
    confirmedExactReservation: true,
  });
}

describe('checkout Dux asistido', () => {
  it('usa el precio Dux vigente y materializa orden, reserva y operación en D1 sin pago', async () => {
    const database = new SqliteD1(migrations);
    try {
      seedAuthority(database);
      const requestId = seedRequest(database, 'a', 'coordinated_pickup');
      const preview = await previewAssistedCheckout(database, env, requestId, Date.parse(now));
      expect(preview.lines[0]?.unitPriceMinor).toBe(1250);
      expect(preview.productsTotalMinor).toBe(2500);
      expect(preview.totalMinor).toBe(2500);

      const prepared = await prepareAssistedCheckout(database, env, requestId, input('PED-100', 0), 'admin:test', new Date(now));
      expect(prepared).toMatchObject({
        requestId, duxOrderNumber: 'PED-100', productsTotalMinor: 2500,
        shippingMinor: 0, totalMinor: 2500, reservationState: 'confirmed',
        paymentStatus: 'not_requested', created: true,
      });
      expect(await database.prepare(`SELECT status, mp_preference_id FROM orders WHERE id = ?`)
        .bind(prepared.orderId).first()).toEqual({ status: 'preference_pending', mp_preference_id: null });
      expect(await database.prepare(`SELECT verification_method, reservation_state FROM dux_order_links WHERE order_id = ?`)
        .bind(prepared.orderId).first()).toEqual({ verification_method: 'assisted_admin', reservation_state: 'confirmed' });
      expect(await database.prepare(`SELECT action, status, idempotency_key FROM dux_order_operations WHERE order_id = ?`)
        .bind(prepared.orderId).first()).toEqual({
          action: 'reserve', status: 'confirmed', idempotency_key: `assisted-reserve:${prepared.orderId}`,
        });
      expect(await database.prepare('SELECT COUNT(*) AS count FROM payments').first()).toEqual({ count: 0 });
    } finally { database.close(); }
  });

  it('recupera la misma preparación y no crea una segunda orden', async () => {
    const database = new SqliteD1(migrations);
    try {
      seedAuthority(database);
      const requestId = seedRequest(database, 'b', 'coordinated_pickup');
      const first = await prepareAssistedCheckout(database, env, requestId, input('PED-200', 0), 'admin:test', new Date(now));
      const repeated = await prepareAssistedCheckout(database, env, requestId, input('PED-200', 0), 'admin:test', new Date('2026-09-10T14:05:00.000Z'));
      expect(repeated.orderId).toBe(first.orderId);
      expect(repeated.created).toBe(false);
      expect(await database.prepare('SELECT COUNT(*) AS count FROM orders').first()).toEqual({ count: 1 });
      expect(await database.prepare('SELECT COUNT(*) AS count FROM dux_order_operations').first()).toEqual({ count: 1 });
    } finally { database.close(); }
  });

  it('para correo exige una cotización final y conserva peso desconocido', async () => {
    const database = new SqliteD1(migrations);
    try {
      seedAuthority(database);
      const requestId = seedRequest(database, 'c', 'correo_argentino');
      const preview = await previewAssistedCheckout(database, env, requestId, Date.parse(now));
      expect(preview.shippingMinor).toBeNull();
      expect(preview.totalMinor).toBeNull();
      await expect(prepareAssistedCheckout(database, env, requestId, input('PED-300', 0), 'admin:test', new Date(now)))
        .rejects.toMatchObject({ code: 'ASSISTED_SHIPPING_INVALID', status: 400 });
      const prepared = await prepareAssistedCheckout(database, env, requestId, input('PED-300', 250000), 'admin:test', new Date(now));
      expect(prepared.totalMinor).toBe(252500);
      expect(await database.prepare(`SELECT shipping_tier, total_weight_grams, shipping_minor
        FROM order_fulfillment WHERE order_id = ?`).bind(prepared.orderId).first()).toEqual({
        shipping_tier: 'correo_manual_quote', total_weight_grams: null, shipping_minor: 250000,
      });
    } finally { database.close(); }
  });

  it('no prepara una solicitud no aceptada y requiere 0022', async () => {
    const database = new SqliteD1(migrations);
    try {
      seedAuthority(database);
      const requestId = seedRequest(database, 'd', 'coordinated_pickup', false);
      await expect(previewAssistedCheckout(database, env, requestId, Date.parse(now)))
        .rejects.toMatchObject({ code: 'WEB_REQUEST_NOT_ACCEPTED', status: 409 });
      expect(await database.prepare(`SELECT name FROM sqlite_schema WHERE type = 'index'
        AND name = 'idx_dux_assisted_order_number_unique'`).first())
        .toEqual({ name: 'idx_dux_assisted_order_number_unique' });
    } finally { database.close(); }
  });
});
