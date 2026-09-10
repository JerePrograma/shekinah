import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { getOrderById, updateOrderFromPayment } from './orders';
import { SqliteD1 } from './test/sqlite-d1';

const migrations = readdirSync(resolve(process.cwd(), 'migrations'))
  .filter((name) => /^\d{4}_.*\.sql$/u.test(name) && name <= '0021_assisted_dux_checkout.sql')
  .sort()
  .map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8'))
  .join('\n');

const now = '2026-09-10T12:00:00.000Z';
const version = 'a'.repeat(64);
const requestId = `req_${'r'.repeat(24)}`;
const orderId = `ord_${'o'.repeat(24)}`;
const fingerprint = 'b'.repeat(64);

function seedAssisted(database: SqliteD1): void {
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
  ) VALUES ('dux_sync_payment_test', 'manual', 'succeeded', 'test', 1, 0, 1, 0, 0, 0,
    ?, ?, ?, ?)`).run(now, now, now, now);
  const payload = JSON.stringify({
    schemaVersion: 2,
    priceListName: 'PRECIOS DEL NEGOCIO',
    items: [{
      slug: 'dux-producto-prueba-0000000000000001',
      code: 'TEST-A',
      name: 'Producto Dux',
      priceAmount: 12,
      priceStatus: 'usable',
      categories: [],
      unitsPerPackage: null,
      imageUrl: null,
      description: null,
    }],
  });
  db.prepare(`INSERT INTO dux_catalog_snapshots_v2 (
    id, inventory_run_id, catalog_version, price_list_name, item_count,
    payload_json, synced_at, created_at, updated_at
  ) VALUES (1, 'dux_sync_payment_test', ?, 'PRECIOS DEL NEGOCIO', 1, ?, ?, ?, ?)`)
    .run(version, payload, now, now, now);
  db.prepare(`UPDATE dux_catalog_control SET public_catalog_enabled = 1,
    updated_by = 'test', updated_at = ? WHERE company_id = '12862'`).run(now);
  const requestSnapshot = JSON.stringify({
    schemaVersion: 1,
    catalogVersion: version,
    observedAt: now,
    lines: [{
      productId: 'dux-producto-prueba-0000000000000001',
      duxCode: 'TEST-A',
      name: 'Producto Dux',
      requestedQuantity: 2,
      observedUnitPriceMinor: 1200,
    }],
    fulfillment: {
      method: 'coordinated_pickup',
      fullName: 'Cliente prueba',
      phone: '5491100000000',
      address: '', locality: '', province: '', postalCode: '',
    },
    totalMinor: null,
    shippingMinor: 0,
    quantityStatus: 'requires_confirmation',
  });
  db.prepare(`INSERT INTO checkout_intents (
    checkout_idempotency_key, fulfillment_fingerprint, cart_fingerprint, created_at,
    intent_kind, web_request_id, web_request_token_hash, web_request_owner_hash,
    web_request_fingerprint, web_request_json, web_request_status, web_request_updated_at
  ) VALUES ('web-payment-key', 'fulfillment', 'request-cart', ?, 'web_request', ?, ?, ?, ?, ?, 'submitted', ?)`)
    .run(now, requestId, '1'.repeat(64), '2'.repeat(64), '3'.repeat(64), requestSnapshot, now);
  db.prepare(`UPDATE checkout_intents SET web_request_status = 'accepted',
    web_request_resolved_by = 'admin-test', web_request_resolved_at = ?, web_request_updated_at = ?
    WHERE web_request_id = ?`).run(now, now, requestId);
  db.prepare(`INSERT INTO orders (
    id, public_token_hash, checkout_idempotency_key, cart_fingerprint, status,
    currency, total_minor, item_count, created_at, updated_at, channel,
    web_request_id, assisted_checkout_fingerprint
  ) VALUES (?, ?, 'web-payment-key', ?, 'preference_pending', 'ARS', 2400, 2,
    ?, ?, 'checkout_pro', ?, ?)`)
    .run(orderId, '4'.repeat(64), fingerprint, now, now, requestId, fingerprint);
  db.prepare(`INSERT INTO order_items (
    order_id, product_id, name, presentation, sku, quantity, unit_price_minor,
    subtotal_minor, stock_controlled, provider_inventory_key, provider_catalog_version
  ) VALUES (?, 'dux-producto-prueba-0000000000000001', 'Producto Dux', NULL,
    'TEST-A', 2, 1200, 2400, 0, NULL, ?)`)
    .run(orderId, version);
  db.prepare(`INSERT INTO order_fulfillment (
    order_id, delivery_method, full_name, phone, address, locality, province,
    postal_code, total_weight_grams, shipping_tier, products_total_minor,
    shipping_minor, created_at, updated_at
  ) VALUES (?, 'coordinated_pickup', 'Cliente prueba', '5491100000000', '', '', '', '',
    NULL, 'coordinated_pickup', 2400, 0, ?, ?)`).run(orderId, now, now);
  db.prepare(`INSERT INTO dux_order_links (
    order_id, dux_reference, dux_order_id, dux_order_number, company_id, branch_id,
    deposit_id, reservation_state, request_fingerprint, attempted_at, confirmed_at,
    created_at, updated_at, verification_method, verification_actor, verification_note
  ) VALUES (?, ?, NULL, 'PED-PAY-1', '12862', '1', '25566', 'confirmed', ?, ?, ?, ?, ?,
    'assisted_admin', 'admin-test', 'Pedido y reserva verificados manualmente en Dux.')`)
    .run(orderId, `shekinah:web:${requestId}`, fingerprint, now, now, now, now);
  db.prepare(`INSERT INTO dux_order_operations (
    id, idempotency_key, order_id, action, status, request_json, response_json,
    provider_operation_id, attempted_at, confirmed_at, created_at, updated_at
  ) VALUES ('op-assisted-payment-reserve', ?, ?, 'reserve', 'confirmed', ?, ?, 'PED-PAY-1', ?, ?, ?, ?)`)
    .run(`assisted-reserve:${orderId}`, orderId,
      JSON.stringify({ method: 'assisted_admin', orderId, action: 'reserve' }),
      JSON.stringify({ verification: 'manual' }), now, now, now, now);
}

describe('proyección financiera con Dux asistido', () => {
  it('proyecta un pago aprobado sin modificar el estado de reserva Dux', async () => {
    const database = new SqliteD1(migrations);
    try {
      seedAssisted(database);
      const order = await getOrderById(database, orderId);
      if (order === null) throw new Error('Falta el pedido asistido de prueba.');
      await updateOrderFromPayment(database, order, {
        id: '9000001', status: 'approved', statusDetail: 'accredited',
        amountMinor: 2400, currency: 'ARS', externalReference: orderId,
        approvedAt: now, updatedAt: now,
      }, 'approved', 'assisted-payment-event');
      expect((await getOrderById(database, orderId))?.status).toBe('approved');
      expect(await database.prepare(`SELECT reservation_state FROM dux_order_links
        WHERE order_id = ?`).bind(orderId).first()).toEqual({ reservation_state: 'confirmed' });
      expect(await database.prepare(`SELECT mapped_status FROM payments
        WHERE provider_payment_id = '9000001'`).first()).toEqual({ mapped_status: 'approved' });
    } finally { database.close(); }
  });

  it('mantiene un vínculo Dux legacy bloqueado aunque conserve el pago verificado', async () => {
    const database = new SqliteD1(migrations);
    try {
      const legacyId = `ord_${'l'.repeat(24)}`;
      await database.prepare(`INSERT INTO orders (
        id, public_token_hash, checkout_idempotency_key, cart_fingerprint, status,
        currency, total_minor, item_count, created_at, updated_at, channel
      ) VALUES (?, 'legacy-token', 'legacy-key', 'legacy-cart', 'preference_pending',
        'ARS', 1200, 1, ?, ?, 'checkout_pro')`).bind(legacyId, now, now).run();
      await database.prepare(`INSERT INTO dux_order_links (
        order_id, dux_reference, company_id, branch_id, deposit_id, reservation_state,
        request_fingerprint, created_at, updated_at, verification_method
      ) VALUES (?, 'legacy:payment', '12862', '1', '25566', 'blocked', ?, ?, ?, 'legacy_blocked')`)
        .bind(legacyId, fingerprint, now, now).run();
      const order = await getOrderById(database, legacyId);
      if (order === null) throw new Error('Falta el pedido legacy de prueba.');
      await expect(updateOrderFromPayment(database, order, {
        id: '9000002', status: 'approved', statusDetail: 'accredited',
        amountMinor: 1200, currency: 'ARS', externalReference: legacyId,
        approvedAt: now, updatedAt: now,
      }, 'approved', 'legacy-payment-event')).rejects.toMatchObject({
        code: 'DUX_ORDER_LIFECYCLE_UNAVAILABLE', status: 503,
      });
      expect((await getOrderById(database, legacyId))?.status).toBe('preference_pending');
      expect(await database.prepare(`SELECT mapped_status FROM payments
        WHERE provider_payment_id = '9000002'`).first()).toEqual({ mapped_status: 'approved' });
    } finally { database.close(); }
  });
});
