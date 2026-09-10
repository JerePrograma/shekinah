import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseAssistedCheckoutInput, prepareAssistedCheckout } from './assisted-checkout';
import type { Env } from './platform';
import { SqliteD1 } from './test/sqlite-d1';
import {
  createWebOrderRequest,
  getWebRequestByToken,
  parseWebRequestInput,
  recoverWebOrderRequest,
  resolveWebOrderRequest,
} from './web-order-requests';

const completeMigrations = readdirSync(resolve(process.cwd(), 'migrations'))
  .filter((name) => /^\d{4}_.*\.sql$/u.test(name) && name <= '0022_assisted_dux_order_number_unique.sql')
  .sort()
  .map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8'))
  .join('\n');
const legacyMigrations = [
  '0001_commerce.sql',
  '0002_fulfillment_and_retention.sql',
  '0003_checkout_intent_cart_fingerprint.sql',
  '0012_dux_authoritative_inventory.sql',
  '0020_web_order_requests.sql',
].map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8')).join('\n');
const secret = 'public-status-secret-'.repeat(3);
const ownerSecret = 'b'.repeat(64);
const timestamp = '2026-09-10T15:00:00.000Z';
const env: Env = {
  DUX_COMPANY_ID: '12862',
  DUX_BRANCH_ID: '1',
  DUX_DEPOSIT_ID: '25566',
  DUX_SNAPSHOT_MAX_AGE_SECONDS: '900',
};

function seedAuthority(database: SqliteD1): string {
  const payload = JSON.stringify({
    schemaVersion: 2,
    priceListName: 'PRECIOS DEL NEGOCIO',
    items: [{
      slug: 'dux-estado-publico-0000000000000001',
      code: 'PUBLIC-1',
      name: 'Producto público',
      priceAmount: 100,
      priceStatus: 'usable',
      categories: [],
      unitsPerPackage: null,
      imageUrl: null,
      description: null,
    }],
  });
  const version = createHash('sha256').update(payload).digest('hex');
  const db = database.database;
  db.prepare(`INSERT INTO dux_tenant_context (
    id, api_version, company_id, company_name, branch_id, branch_name,
    deposit_id, deposit_name, verified_at, updated_at
  ) VALUES (1, 'v2', '12862', 'Empresa', '1', 'Sucursal', '25566', 'Depósito', ?, ?)`)
    .run(timestamp, timestamp);
  db.prepare(`UPDATE dux_catalog_control SET snapshot_collection_enabled = 1,
    updated_by = 'test', updated_at = ? WHERE company_id = '12862'`).run(timestamp);
  db.prepare(`INSERT INTO dux_sync_runs (
    id, kind, status, trigger_actor, processed_count, mapped_count, unmapped_count,
    ambiguous_count, absent_count, failed_count, started_at, completed_at, created_at, updated_at
  ) VALUES ('dux_sync_public_status', 'manual', 'succeeded', 'test', 1, 0, 1, 0, 0, 0, ?, ?, ?, ?)`)
    .run(timestamp, timestamp, timestamp, timestamp);
  db.prepare(`INSERT INTO dux_catalog_snapshots_v2 (
    id, inventory_run_id, catalog_version, price_list_name, item_count,
    payload_json, synced_at, created_at, updated_at
  ) VALUES (1, 'dux_sync_public_status', ?, 'PRECIOS DEL NEGOCIO', 1, ?, ?, ?, ?)`)
    .run(version, payload, timestamp, timestamp, timestamp);
  db.prepare(`UPDATE dux_catalog_control SET public_catalog_enabled = 1,
    updated_by = 'test', updated_at = ? WHERE company_id = '12862'`).run(timestamp);
  return version;
}

async function seedRequest(database: SqliteD1, version: string) {
  const input = parseWebRequestInput({
    mode: 'create',
    idempotencyKey: crypto.randomUUID(),
    ownerSecret,
    items: [{ productId: 'dux-estado-publico-0000000000000001', quantity: 2, catalogVersion: version }],
    fulfillment: { method: 'coordinated_pickup', fullName: 'Cliente Público', phone: '5491100000000' },
  });
  const created = await createWebOrderRequest(database, input, secret, () => Promise.resolve({
    catalogVersion: version,
    syncedAt: timestamp,
    items: [{
      slug: 'dux-estado-publico-0000000000000001', code: 'PUBLIC-1', name: 'Producto público',
      priceAmount: 100, priceStatus: 'usable', categories: [], unitsPerPackage: null,
      imageUrl: null, description: null,
    }],
  }), [], new Date(timestamp));
  const row = await database.prepare(`SELECT web_request_id AS id FROM checkout_intents
    WHERE checkout_idempotency_key = ?`).bind(input.idempotencyKey).first<{ id: string }>();
  if (row === null) throw new Error('No se creó la solicitud sintética.');
  return { input, receipt: created.receipt, requestId: row.id };
}

async function seedPrepared(database: SqliteD1) {
  const version = seedAuthority(database);
  const request = await seedRequest(database, version);
  await resolveWebOrderRequest(database, request.requestId, 'accepted', 'test:admin');
  const prepared = await prepareAssistedCheckout(
    database,
    env,
    request.requestId,
    parseAssistedCheckoutInput({
      duxOrderNumber: 'PED-PUBLIC-1',
      duxOrderId: null,
      shippingMinor: 0,
      confirmedExactReservation: true,
    }),
    'test:admin',
    new Date(timestamp),
  );
  return { ...request, orderId: prepared.orderId };
}

describe('estado público enriquecido de solicitudes web', () => {
  it('mantiene compatibilidad cuando 0021 todavía no está aplicada', async () => {
    const database = new SqliteD1(legacyMigrations);
    try {
      const version = 'a'.repeat(64);
      const request = await seedRequest(database, version);
      expect(await getWebRequestByToken(database, request.receipt.publicToken, true, Date.parse(timestamp)))
        .toEqual({
          reference: request.receipt.reference,
          status: 'submitted',
          createdAt: timestamp,
          updatedAt: timestamp,
          paymentStatus: 'not_requested',
          paymentRequiresReview: false,
          reservationStatus: 'not_reserved',
          checkoutAvailable: false,
          totalMinor: null,
        });
    } finally { database.close(); }
  });

  it('habilita pago sólo para una reserva asistida confirmada y recovery devuelve el mismo estado', async () => {
    const database = new SqliteD1(completeMigrations);
    try {
      const prepared = await seedPrepared(database);
      const byToken = await getWebRequestByToken(database, prepared.receipt.publicToken, true, Date.parse(timestamp));
      expect(byToken).toMatchObject({
        status: 'accepted',
        paymentStatus: 'not_requested',
        paymentRequiresReview: false,
        reservationStatus: 'confirmed',
        checkoutAvailable: true,
        totalMinor: 20_000,
      });
      const byOwner = await recoverWebOrderRequest(database, prepared.input, secret, true, Date.parse(timestamp));
      expect(byOwner).toEqual({ ...byToken, publicToken: prepared.receipt.publicToken });
      expect((await getWebRequestByToken(database, prepared.receipt.publicToken, false, Date.parse(timestamp))).checkoutAvailable)
        .toBe(false);
    } finally { database.close(); }
  });

  it('mantiene visible el pago aprobado aunque la proyección financiera todavía requiera revisión', async () => {
    const database = new SqliteD1(completeMigrations);
    try {
      const prepared = await seedPrepared(database);
      database.database.prepare(`INSERT INTO payments (
        provider_payment_id, order_id, mapped_status, provider_status, amount_minor,
        currency, external_reference, last_event_key, created_at, updated_at
      ) VALUES ('10001', ?, 'approved', 'approved', 20000, 'ARS', ?, 'event', ?, ?)`)
        .run(prepared.orderId, prepared.orderId, timestamp, timestamp);
      expect(await getWebRequestByToken(database, prepared.receipt.publicToken, true, Date.parse(timestamp)))
        .toMatchObject({
          paymentStatus: 'approved',
          paymentRequiresReview: true,
          reservationStatus: 'confirmed',
          checkoutAvailable: false,
          totalMinor: 20_000,
        });
    } finally { database.close(); }
  });

  it('cierra checkout durante un pago pendiente y cuando el intento ya venció', async () => {
    const database = new SqliteD1(completeMigrations);
    try {
      const prepared = await seedPrepared(database);
      database.database.prepare(`INSERT INTO payments (
        provider_payment_id, order_id, mapped_status, provider_status, amount_minor,
        currency, external_reference, last_event_key, created_at, updated_at
      ) VALUES ('10002', ?, 'pending', 'pending', 20000, 'ARS', ?, 'event-pending', ?, ?)`)
        .run(prepared.orderId, prepared.orderId, timestamp, timestamp);
      expect((await getWebRequestByToken(database, prepared.receipt.publicToken, true, Date.parse(timestamp))).checkoutAvailable)
        .toBe(false);
      database.database.prepare('DELETE FROM payments WHERE order_id = ?').run(prepared.orderId);
      database.database.prepare(`UPDATE orders SET mp_preference_attempted_at = ?,
        mp_preference_attempt_token = 'attempt' WHERE id = ?`).run(timestamp, prepared.orderId);
      const thirtyOneMinutesLater = Date.parse(timestamp) + 31 * 60 * 1000;
      expect((await getWebRequestByToken(database, prepared.receipt.publicToken, true, thirtyOneMinutesLater)).checkoutAvailable)
        .toBe(false);
    } finally { database.close(); }
  });
});
