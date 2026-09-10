import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseAssistedCheckoutInput, prepareAssistedCheckout } from './assisted-checkout';
import { createOrRecoverAssistedPreference } from './assisted-payment';
import { HttpError } from './http';
import type { Env } from './platform';
import { SqliteD1 } from './test/sqlite-d1';

type Gateway = NonNullable<Parameters<typeof createOrRecoverAssistedPreference>[3]>;

const migrations = readdirSync(resolve(process.cwd(), 'migrations'))
  .filter((name) => /^\d{4}_.*\.sql$/u.test(name) && name <= '0022_assisted_dux_order_number_unique.sql')
  .sort()
  .map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8'))
  .join('\n');
const publicToken = 'e'.repeat(64);
const publicTokenHash = createHash('sha256').update(publicToken).digest('hex');
const mercadoPagoAccessToken = 'TEST-' + '1'.repeat(20);
const env: Env = {
  DUX_COMPANY_ID: '12862', DUX_BRANCH_ID: '1', DUX_DEPOSIT_ID: '25566', DUX_SNAPSHOT_MAX_AGE_SECONDS: '900',
};

function isoNow(): string { return new Date().toISOString(); }

function seedAuthority(database: SqliteD1, timestamp: string): string {
  const payload = JSON.stringify({
    schemaVersion: 2, priceListName: 'PRECIOS DEL NEGOCIO',
    items: [{ slug: 'dux-producto-pago-0000000000000001', code: 'PAGO-1', name: 'Producto Pago',
      priceAmount: 100, priceStatus: 'usable', categories: [], unitsPerPackage: null, imageUrl: null, description: null }],
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
    VALUES ('dux_sync_assisted_payment', 'manual', 'succeeded', 'test', 1, 0, 1, 0, 0, 0, ?, ?, ?, ?)`)
    .run(timestamp, timestamp, timestamp, timestamp);
  db.prepare(`INSERT INTO dux_catalog_snapshots_v2 (id, inventory_run_id, catalog_version, price_list_name, item_count,
    payload_json, synced_at, created_at, updated_at)
    VALUES (1, 'dux_sync_assisted_payment', ?, 'PRECIOS DEL NEGOCIO', 1, ?, ?, ?, ?)`)
    .run(version, payload, timestamp, timestamp, timestamp);
  db.prepare(`UPDATE dux_catalog_control SET public_catalog_enabled = 1, updated_by = 'test', updated_at = ?
    WHERE company_id = '12862'`).run(timestamp);
  return version;
}

async function seedPrepared(database: SqliteD1, shippingMinor = 0): Promise<string> {
  const timestamp = isoNow();
  const version = seedAuthority(database, timestamp);
  const requestId = `req_${'p'.repeat(24)}`;
  const method = shippingMinor === 0 ? 'coordinated_pickup' : 'correo_argentino';
  const requestSnapshot = JSON.stringify({
    schemaVersion: 1, catalogVersion: version, observedAt: timestamp,
    lines: [{ productId: 'dux-producto-pago-0000000000000001', duxCode: 'PAGO-1', name: 'Producto Pago',
      requestedQuantity: 2, observedUnitPriceMinor: 10000 }],
    fulfillment: method === 'coordinated_pickup'
      ? { method, fullName: 'Cliente Pago', phone: '5491100000000', address: '', locality: '', province: '', postalCode: '' }
      : { method, fullName: 'Cliente Pago', phone: '5491100000000', address: 'Calle 100', locality: 'CABA', province: 'Buenos Aires', postalCode: 'C1000AAA' },
    totalMinor: null, shippingMinor: method === 'coordinated_pickup' ? 0 : null,
    quantityStatus: 'requires_confirmation',
  });
  database.database.prepare(`INSERT INTO checkout_intents (
    checkout_idempotency_key, fulfillment_fingerprint, cart_fingerprint, created_at, intent_kind,
    web_request_id, web_request_token_hash, web_request_owner_hash, web_request_fingerprint,
    web_request_json, web_request_status, web_request_updated_at)
    VALUES (?, 'fulfillment', 'cart', ?, 'web_request', ?, ?, ?, ?, ?, 'submitted', ?)`)
    .run(crypto.randomUUID(), timestamp, requestId, publicTokenHash, '1'.repeat(64), '2'.repeat(64), requestSnapshot, timestamp);
  database.database.prepare(`UPDATE checkout_intents SET web_request_status = 'accepted', web_request_resolved_by = 'admin',
    web_request_resolved_at = ?, web_request_updated_at = ? WHERE web_request_id = ?`)
    .run(timestamp, timestamp, requestId);
  const prepared = await prepareAssistedCheckout(database, env, requestId,
    parseAssistedCheckoutInput({ duxOrderNumber: 'PED-PAGO-1', duxOrderId: null, shippingMinor, confirmedExactReservation: true }),
    'admin:test', new Date(timestamp));
  return prepared.orderId;
}

function dependencies() {
  return { accessToken: mercadoPagoAccessToken, mode: 'sandbox' as const, siteUrl: new URL('https://example.test') };
}

function gateway(): Gateway {
  return {
    create: vi.fn().mockResolvedValue({ id: 'pref-assisted-1', checkoutUrl: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-assisted-1' }),
    recover: vi.fn().mockResolvedValue(null),
  };
}

describe('preferencia Mercado Pago para checkout asistido', () => {
  it('crea una única preferencia desde D1 y la reutiliza sin volver al proveedor', async () => {
    const database = new SqliteD1(migrations);
    try {
      const orderId = await seedPrepared(database);
      const provider = gateway();
      const first = await createOrRecoverAssistedPreference(database, publicToken, dependencies(), provider);
      const repeated = await createOrRecoverAssistedPreference(database, publicToken, dependencies(), provider);
      expect(first).toMatchObject({ orderId, totalMinor: 20000, created: true });
      expect(repeated).toMatchObject({ orderId, totalMinor: 20000, created: false, checkoutUrl: first.checkoutUrl });
      expect(provider.create).toHaveBeenCalledTimes(1);
      expect(provider.recover).not.toHaveBeenCalled();
      expect(await database.prepare(`SELECT status, mp_preference_id FROM orders WHERE id = ?`).bind(orderId).first())
        .toEqual({ status: 'pending', mp_preference_id: 'pref-assisted-1' });
    } finally { database.close(); }
  });

  it('inicia los 30 minutos al primer intento de Mercado Pago y no al preparar la reserva', async () => {
    const database = new SqliteD1(migrations);
    try {
      const orderId = await seedPrepared(database);
      const oldCreatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      database.database.prepare('UPDATE orders SET created_at = ? WHERE id = ?').run(oldCreatedAt, orderId);
      const provider = gateway();
      const beforeAttempt = Date.now();
      await createOrRecoverAssistedPreference(database, publicToken, dependencies(), provider);
      const createdAt = vi.mocked(provider.create).mock.calls[0]?.[0].createdAt;
      const persisted = await database.prepare('SELECT mp_preference_attempted_at FROM orders WHERE id = ?')
        .bind(orderId).first<{ mp_preference_attempted_at: string }>();
      expect(createdAt).toBe(persisted?.mp_preference_attempted_at);
      expect(createdAt).not.toBe(oldCreatedAt);
      expect(Date.parse(createdAt ?? '')).toBeGreaterThanOrEqual(beforeAttempt);
      expect(Date.parse(createdAt ?? '')).toBeLessThanOrEqual(Date.now());
    } finally { database.close(); }
  });

  it('incluye la cotización manual de correo como ítem sin inferir peso', async () => {
    const database = new SqliteD1(migrations);
    try {
      await seedPrepared(database, 250000);
      const provider = gateway();
      await createOrRecoverAssistedPreference(database, publicToken, dependencies(), provider);
      const call = vi.mocked(provider.create).mock.calls[0]?.[0];
      expect(call?.cart.totalMinor).toBe(270000);
      expect(call?.cart.lines.map((line) => [line.product.id, line.subtotalMinor])).toEqual([
        ['dux-producto-pago-0000000000000001', 20000],
        ['shipping-correo-argentino', 250000],
      ]);
      expect(call?.cart.totalWeightGrams).toBeNull();
      expect(call?.cart.shippingTier).toBe('correo_manual_quote');
    } finally { database.close(); }
  });

  it('un resultado incierto no repite el POST y sólo continúa tras recuperar la misma preferencia', async () => {
    const database = new SqliteD1(migrations);
    try {
      const orderId = await seedPrepared(database);
      const firstGateway = gateway();
      vi.mocked(firstGateway.create).mockRejectedValueOnce(new HttpError(502, 'PAYMENT_PROVIDER_OUTCOME_UNKNOWN', 'Resultado incierto.'));
      await expect(createOrRecoverAssistedPreference(database, publicToken, dependencies(), firstGateway))
        .rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_OUTCOME_UNKNOWN' });
      const afterFailure = await database.prepare(`SELECT status, mp_preference_attempted_at, mp_preference_id
        FROM orders WHERE id = ?`).bind(orderId).first<Record<string, unknown>>();
      expect(afterFailure?.status).toBe('failed');
      expect(afterFailure?.mp_preference_attempted_at).toEqual(expect.any(String));
      expect(afterFailure?.mp_preference_id).toBeNull();

      const recoveryGateway = gateway();
      vi.mocked(recoveryGateway.recover).mockResolvedValueOnce({
        id: 'pref-recovered', checkoutUrl: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-recovered',
      });
      const recovered = await createOrRecoverAssistedPreference(database, publicToken, dependencies(), recoveryGateway);
      expect(recovered).toMatchObject({ orderId, created: false });
      expect(recoveryGateway.create).not.toHaveBeenCalled();
      expect(recoveryGateway.recover).toHaveBeenCalledTimes(1);
      expect(await database.prepare(`SELECT mp_preference_id FROM orders WHERE id = ?`).bind(orderId).first())
        .toEqual({ mp_preference_id: 'pref-recovered' });
    } finally { database.close(); }
  });

  it('dos solicitudes simultáneas no crean dos preferencias', async () => {
    const database = new SqliteD1(migrations);
    try {
      await seedPrepared(database);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const provider = gateway();
      vi.mocked(provider.create).mockImplementationOnce(async () => {
        await gate;
        return { id: 'pref-concurrent', checkoutUrl: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-concurrent' };
      });
      const first = createOrRecoverAssistedPreference(database, publicToken, dependencies(), provider);
      await vi.waitFor(() => expect(provider.create).toHaveBeenCalledTimes(1));
      await expect(createOrRecoverAssistedPreference(database, publicToken, dependencies(), provider))
        .rejects.toMatchObject({ code: 'PREFERENCE_RECOVERY_PENDING', status: 409 });
      release();
      await expect(first).resolves.toMatchObject({ created: true });
      expect(provider.create).toHaveBeenCalledTimes(1);
    } finally { database.close(); }
  });

  it('no encuentra un token ajeno y no toca al proveedor', async () => {
    const database = new SqliteD1(migrations);
    try {
      await seedPrepared(database);
      const provider = gateway();
      await expect(createOrRecoverAssistedPreference(database, 'f'.repeat(64), dependencies(), provider))
        .rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
      expect(provider.create).not.toHaveBeenCalled();
      expect(provider.recover).not.toHaveBeenCalled();
    } finally { database.close(); }
  });
});
