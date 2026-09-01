import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { RecalculatedCart } from './catalog';
import {
  claimPreferenceAttempt,
  getOrderById,
  markPreferenceCreated,
  prepareOrder,
  updateOrderFromPayment,
} from './orders';
import { SqliteD1 } from './test/sqlite-d1';

const migration = [
  '0001_commerce.sql',
  '0002_fulfillment_and_retention.sql',
  '0003_checkout_intent_cart_fingerprint.sql',
  '0004_catalog_admin.sql',
  '0005_admin_auth.sql',
  '0006_analytics_manual_payment_click.sql',
  '0007_whatsapp_order_reservations.sql',
  '0008_checkout_pro_stock_and_whatsapp_identity.sql',
  '0012_dux_authoritative_inventory.sql',
].map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8')).join('\n');

function cart(quantity = 1): RecalculatedCart {
  const unitPriceMinor = 75_000;
  const productsTotalMinor = unitPriceMinor * quantity;
  return Object.freeze({
    currency: 'ARS',
    lines: Object.freeze([
      Object.freeze({
        product: Object.freeze({
          id: 'producto-prueba',
          name: 'Producto de prueba',
          presentation: '50 g',
          sku: 'PRUEBA-50',
          available: true,
          unitPriceMinor,
        }),
        quantity,
        subtotalMinor: productsTotalMinor,
      }),
    ]),
    itemCount: quantity,
    productsTotalMinor,
    shippingMinor: 0,
    shippingTier: 'coordinated_pickup',
    totalWeightGrams: 50 * quantity,
    fulfillment: Object.freeze({
      method: 'coordinated_pickup',
      fullName: 'Ana Pérez',
      phone: '5491155554444',
      address: 'Calle 123',
      locality: 'CABA',
      province: 'Buenos Aires',
      postalCode: 'C1234ABC',
    }),
    totalMinor: productsTotalMinor,
  });
}

describe('pedidos e idempotencia D1', () => {
  it.each([
    ['dux', 'DUX_ORDER_LIFECYCLE_UNAVAILABLE'],
    ['mercadolibre', 'MERCADO_LIBRE_DIRECT_INTEGRATION_RETIRED'],
  ] as const)('no materializa pedidos del proveedor %s por fuera del coordinador autorizado', async (
    inventoryProvider,
    code,
  ) => {
    const database = new SqliteD1(migration);
    try {
      const base = cart();
      const line = base.lines[0];
      if (line === undefined) throw new Error('Falta la línea de prueba.');
      const providerCart = Object.freeze({
        ...base,
        lines: Object.freeze([Object.freeze({
          ...line,
          product: Object.freeze({
            ...line.product,
            inventoryProvider,
            providerCatalogVersion: 'a'.repeat(64),
          }),
        })]),
      });
      await expect(prepareOrder({
        cart: providerCart,
        database,
        idempotencyKey: crypto.randomUUID(),
        tokenSecret: 'o'.repeat(40),
      })).rejects.toMatchObject({ code });
      await expect(database.prepare('SELECT COUNT(*) AS count FROM orders').first())
        .resolves.toEqual({ count: 0 });
    } finally {
      database.close();
    }
  });

  it('recupera el mismo pedido y rechaza reutilizar la clave con otro carrito', async () => {
    const database = new SqliteD1(migration);
    try {
      const idempotencyKey = crypto.randomUUID();
      const tokenSecret = 'o'.repeat(40);
      const first = await prepareOrder({ cart: cart(), database, idempotencyKey, tokenSecret });
      const repeated = await prepareOrder({ cart: cart(), database, idempotencyKey, tokenSecret });
      expect(first.created).toBe(true);
      expect(repeated.created).toBe(false);
      expect(repeated.order.id).toBe(first.order.id);
      expect(repeated.publicToken).toBe(first.publicToken);
      await expect(prepareOrder({
        cart: cart(2),
        database,
        idempotencyKey,
        tokenSecret,
      })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', status: 409 });
    } finally {
      database.close();
    }
  });

  it('permite un único reclamo concurrente de preferencia', async () => {
    const database = new SqliteD1(migration);
    try {
      const prepared = await prepareOrder({
        cart: cart(),
        database,
        idempotencyKey: crypto.randomUUID(),
        tokenSecret: 'o'.repeat(40),
      });
      const claims = await Promise.all([
        claimPreferenceAttempt(database, prepared.order.id),
        claimPreferenceAttempt(database, prepared.order.id),
      ]);
      expect(claims.filter((value) => value !== null)).toHaveLength(1);
      const owner = claims.find((value): value is string => value !== null);
      if (owner === undefined) throw new Error('No se obtuvo el reclamo de preferencia.');
      await markPreferenceCreated(
        database,
        prepared.order.id,
        'pref_123',
        'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref_123',
        owner,
      );
      expect((await getOrderById(database, prepared.order.id))?.status).toBe('pending');
    } finally {
      database.close();
    }
  });

  it('no degrada approved y permite avanzar a refunded', async () => {
    const database = new SqliteD1(migration);
    try {
      const prepared = await prepareOrder({
        cart: cart(),
        database,
        idempotencyKey: crypto.randomUUID(),
        tokenSecret: 'o'.repeat(40),
      });
      const payment = {
        id: '1001',
        status: 'approved',
        statusDetail: 'accredited',
        amountMinor: prepared.order.total_minor,
        currency: 'ARS',
        externalReference: prepared.order.id,
        approvedAt: '2026-07-31T10:00:00.000Z',
        updatedAt: '2026-07-31T10:00:00.000Z',
      } as const;
      await updateOrderFromPayment(database, prepared.order, payment, 'approved', 'approved-event');
      const approved = await getOrderById(database, prepared.order.id);
      expect(approved?.status).toBe('approved');
      if (approved === null) throw new Error('Pedido aprobado ausente.');
      await updateOrderFromPayment(
        database,
        approved,
        { ...payment, status: 'in_process', updatedAt: '2026-07-31T09:00:00.000Z' },
        'pending',
        'stale-event',
      );
      const stillApproved = await getOrderById(database, prepared.order.id);
      expect(stillApproved?.status).toBe('approved');
      if (stillApproved === null) throw new Error('Pedido ausente.');
      await updateOrderFromPayment(
        database,
        stillApproved,
        { ...payment, status: 'refunded', updatedAt: '2026-07-31T11:00:00.000Z' },
        'refunded',
        'refund-event',
      );
      expect((await getOrderById(database, prepared.order.id))?.status).toBe('refunded');
    } finally {
      database.close();
    }
  });

  it('agrega pagos exactos sin duplicar filas y conserva approved mientras otro pago lo cubre', async () => {
    const database = new SqliteD1(migration);
    try {
      const prepared = await prepareOrder({
        cart: cart(),
        database,
        idempotencyKey: crypto.randomUUID(),
        tokenSecret: 'o'.repeat(40),
      });
      const firstPayment = {
        id: 'multi-1001',
        status: 'approved',
        statusDetail: 'accredited',
        amountMinor: prepared.order.total_minor,
        currency: 'ARS',
        externalReference: prepared.order.id,
        approvedAt: '2026-08-13T10:00:00.000Z',
        updatedAt: '2026-08-13T10:00:00.000Z',
      } as const;
      const secondPayment = {
        ...firstPayment,
        id: 'multi-1002',
        approvedAt: '2026-08-13T10:05:00.000Z',
        updatedAt: '2026-08-13T10:05:00.000Z',
      } as const;

      await updateOrderFromPayment(database, prepared.order, firstPayment, 'approved', 'multi-event-1');
      await updateOrderFromPayment(database, prepared.order, secondPayment, 'approved', 'multi-event-2');
      await updateOrderFromPayment(database, prepared.order, secondPayment, 'approved', 'multi-event-2-repeated');

      expect((await getOrderById(database, prepared.order.id))?.status).toBe('approved');
      await expect(database.prepare(
        'SELECT COUNT(*) AS count FROM payments WHERE order_id = ?',
      ).bind(prepared.order.id).first<number>('count')).resolves.toBe(2);

      await updateOrderFromPayment(
        database,
        prepared.order,
        {
          ...firstPayment,
          status: 'refunded',
          statusDetail: 'refunded',
          updatedAt: '2026-08-13T11:00:00.000Z',
        },
        'refunded',
        'multi-refund-1',
      );
      expect((await getOrderById(database, prepared.order.id))?.status).toBe('approved');

      await updateOrderFromPayment(
        database,
        prepared.order,
        {
          ...secondPayment,
          status: 'charged_back',
          statusDetail: 'charged_back',
          updatedAt: '2026-08-13T11:05:00.000Z',
        },
        'refunded',
        'multi-refund-2',
      );
      expect((await getOrderById(database, prepared.order.id))?.status).toBe('refunded');
    } finally {
      database.close();
    }
  });

  it('no aprueba una orden sumando pagos parciales rechazados individualmente', async () => {
    const database = new SqliteD1(migration);
    try {
      const prepared = await prepareOrder({
        cart: cart(2),
        database,
        idempotencyKey: crypto.randomUUID(),
        tokenSecret: 'o'.repeat(40),
      });
      const partialAmount = prepared.order.total_minor / 2;
      for (const paymentId of ['partial-1001', 'partial-1002']) {
        await expect(updateOrderFromPayment(
          database,
          prepared.order,
          {
            id: paymentId,
            status: 'approved',
            statusDetail: 'accredited',
            amountMinor: partialAmount,
            currency: 'ARS',
            externalReference: prepared.order.id,
            approvedAt: '2026-08-13T12:00:00.000Z',
            updatedAt: '2026-08-13T12:00:00.000Z',
          },
          'approved',
          `event-${paymentId}`,
        )).rejects.toMatchObject({ code: 'PAYMENT_ORDER_MISMATCH' });
      }

      expect((await getOrderById(database, prepared.order.id))?.status).toBe('preference_pending');
      await expect(database.prepare(
        'SELECT COUNT(*) AS count FROM payments WHERE order_id = ?',
      ).bind(prepared.order.id).first<number>('count')).resolves.toBe(0);
    } finally {
      database.close();
    }
  });

  it('mantiene pending ante otro pago rechazado y deriva el estado sin depender del orden de eventos', async () => {
    const database = new SqliteD1(migration);
    try {
      const prepared = await prepareOrder({
        cart: cart(),
        database,
        idempotencyKey: crypto.randomUUID(),
        tokenSecret: 'o'.repeat(40),
      });
      const basePayment = {
        statusDetail: null,
        amountMinor: prepared.order.total_minor,
        currency: 'ARS',
        externalReference: prepared.order.id,
        approvedAt: null,
        updatedAt: '2026-08-13T12:00:00.000Z',
      } as const;

      await updateOrderFromPayment(
        database,
        prepared.order,
        { ...basePayment, id: 'multi-pending', status: 'pending' },
        'pending',
        'multi-pending-event',
      );
      await updateOrderFromPayment(
        database,
        prepared.order,
        { ...basePayment, id: 'multi-rejected', status: 'rejected' },
        'rejected',
        'multi-rejected-event',
      );

      expect((await getOrderById(database, prepared.order.id))?.status).toBe('pending');

      await updateOrderFromPayment(
        database,
        prepared.order,
        { ...basePayment, id: 'multi-pending', status: 'cancelled' },
        'cancelled',
        'multi-cancelled-event',
      );
      expect((await getOrderById(database, prepared.order.id))?.status).toBe('rejected');
    } finally {
      database.close();
    }
  });

  it('mantiene refunded ante otro pago pendiente y sus redeliveries', async () => {
    const database = new SqliteD1(migration);
    try {
      const prepared = await prepareOrder({
        cart: cart(),
        database,
        idempotencyKey: crypto.randomUUID(),
        tokenSecret: 'o'.repeat(40),
      });
      const basePayment = {
        statusDetail: null,
        amountMinor: prepared.order.total_minor,
        currency: 'ARS',
        externalReference: prepared.order.id,
        approvedAt: null,
        updatedAt: '2026-08-13T12:00:00.000Z',
      } as const;

      await updateOrderFromPayment(
        database,
        prepared.order,
        { ...basePayment, id: 'refunded-payment', status: 'refunded' },
        'refunded',
        'refunded-event',
      );
      await updateOrderFromPayment(
        database,
        prepared.order,
        { ...basePayment, id: 'pending-after-refund', status: 'pending' },
        'pending',
        'pending-after-refund-event',
      );
      expect((await getOrderById(database, prepared.order.id))?.status).toBe('refunded');

      await updateOrderFromPayment(
        database,
        prepared.order,
        { ...basePayment, id: 'pending-after-refund', status: 'pending' },
        'pending',
        'pending-after-refund-redelivery',
      );
      expect((await getOrderById(database, prepared.order.id))?.status).toBe('refunded');
    } finally {
      database.close();
    }
  });

  it('rechaza monto, moneda, referencia o identidad de pago incompatibles', async () => {
    const database = new SqliteD1(migration);
    try {
      const first = await prepareOrder({
        cart: cart(), database, idempotencyKey: crypto.randomUUID(), tokenSecret: 'o'.repeat(40),
      });
      const payment = {
        id: '2001', status: 'approved', statusDetail: 'accredited',
        amountMinor: first.order.total_minor, currency: 'ARS', externalReference: first.order.id,
        approvedAt: '2026-08-04T10:00:00.000Z', updatedAt: '2026-08-04T10:00:00.000Z',
      } as const;
      for (const incompatible of [
        { ...payment, amountMinor: payment.amountMinor + 1 },
        { ...payment, currency: 'USD' },
        { ...payment, externalReference: 'otro-pedido' },
      ]) {
        await expect(updateOrderFromPayment(database, first.order, incompatible, 'approved', crypto.randomUUID()))
          .rejects.toMatchObject({ code: 'PAYMENT_ORDER_MISMATCH' });
      }

      await updateOrderFromPayment(database, first.order, payment, 'approved', 'first-payment-event');
      const second = await prepareOrder({
        cart: cart(), database, idempotencyKey: crypto.randomUUID(), tokenSecret: 'o'.repeat(40),
      });
      await expect(updateOrderFromPayment(
        database,
        second.order,
        { ...payment, externalReference: second.order.id },
        'approved',
        'conflicting-payment-event',
      )).rejects.toMatchObject({ code: 'PAYMENT_IDENTITY_CONFLICT' });
    } finally {
      database.close();
    }
  });

  it.each(['approved', 'rejected', 'refunded'] as const)(
    'bloquea la transición de pago %s para un pedido vinculado a Dux',
    async (mappedStatus) => {
      const database = new SqliteD1(migration);
      try {
        const orderId = `ord_dux_payment_${mappedStatus}_1234567890`;
        const now = '2026-08-26T12:00:00.000Z';
        await database.prepare(`INSERT INTO orders (
          id, public_token_hash, checkout_idempotency_key, cart_fingerprint,
          status, currency, total_minor, item_count, created_at, updated_at,
          channel, stock_reserved_at, stock_reservation_expires_at
        ) VALUES (?, ?, ?, ?, 'pending', 'ARS', 75000, 1, ?, ?,
          'checkout_pro', ?, ?)`)
          .bind(
            orderId,
            `${orderId}-token`,
            crypto.randomUUID(),
            `${orderId}-fingerprint`,
            now,
            now,
            now,
            '2026-08-26T12:30:00.000Z',
          )
          .run();
        await database.prepare(`INSERT INTO dux_order_links (
          order_id, dux_reference, company_id, branch_id, deposit_id,
          reservation_state, request_fingerprint, created_at, updated_at
        ) VALUES (?, ?, '1', '2', '3', 'blocked', ?, ?, ?)`)
          .bind(orderId, `shekinah:${orderId}`, 'f'.repeat(64), now, now)
          .run();
        const order = await getOrderById(database, orderId);
        if (order === null) throw new Error('Falta el pedido Dux de prueba.');

        await expect(updateOrderFromPayment(
          database,
          order,
          {
            id: `payment-${mappedStatus}`,
            status: mappedStatus,
            statusDetail: null,
            amountMinor: 75_000,
            currency: 'ARS',
            externalReference: orderId,
            approvedAt: mappedStatus === 'approved' ? now : null,
            updatedAt: now,
          },
          mappedStatus,
          `event-${mappedStatus}`,
        )).rejects.toMatchObject({
          status: 503,
          code: 'DUX_ORDER_LIFECYCLE_UNAVAILABLE',
        });
        await expect(database.prepare(
          'SELECT COUNT(*) AS count FROM payments WHERE order_id = ?',
        ).bind(orderId).first()).resolves.toEqual({ count: 0 });
        expect((await getOrderById(database, orderId))?.status).toBe('pending');
      } finally {
        database.close();
      }
    },
  );

  it('pone en cuarentena una preferencia histórica si su producto ahora pertenece a Dux', async () => {
    const database = new SqliteD1(migration);
    try {
      const orderId = 'ord_historic_dux_payment_1234567890';
      const now = '2026-08-26T12:00:00.000Z';
      await database.prepare(`INSERT INTO orders (
        id, public_token_hash, checkout_idempotency_key, cart_fingerprint,
        status, currency, total_minor, item_count, created_at, updated_at,
        channel, stock_reserved_at, stock_reservation_expires_at
      ) VALUES (?, ?, ?, ?, 'preference_pending', 'ARS', 75000, 1, ?, ?,
        'checkout_pro', ?, ?)`)
        .bind(
          orderId,
          `${orderId}-token`,
          crypto.randomUUID(),
          `${orderId}-fingerprint`,
          now,
          now,
          now,
          '2026-08-26T12:30:00.000Z',
        )
        .run();
      await database.prepare(`INSERT INTO order_items (
        order_id, product_id, name, quantity, unit_price_minor, subtotal_minor,
        stock_controlled
      ) VALUES (?, 'producto-prueba', 'Producto de prueba', 1, 75000, 75000, 0)`)
        .bind(orderId)
        .run();
      await database.prepare(`INSERT INTO dux_inventory_items (
        inventory_key, cod_item, item_name, local_product_id, mapping_status,
        mapping_source, mapping_candidates_json, deposit_id, deposit_name,
        stock_real, stock_reservado, stock_disponible, quantity_semantics_status,
        checkout_eligible, catalog_version, raw_snapshot_json, last_sync_status,
        last_synced_at, created_at, updated_at
      ) VALUES (
        'dux:v2:1:3:HISTORICO:base', 'HISTORICO', 'Producto histórico',
        'producto-prueba', 'mapped', 'persisted', '["producto-prueba"]',
        '3', 'Principal', 10, 0, 10, 'unavailable_from_v2_items', 0,
        ?, '{}', 'ok', ?, ?, ?
      )`)
        .bind('e'.repeat(64), now, now, now)
        .run();
      const order = await getOrderById(database, orderId);
      if (order === null) throw new Error('Falta el pedido histórico de prueba.');

      await expect(updateOrderFromPayment(
        database,
        order,
        {
          id: 'payment-historic-dux',
          status: 'approved',
          statusDetail: 'accredited',
          amountMinor: 75_000,
          currency: 'ARS',
          externalReference: orderId,
          approvedAt: now,
          updatedAt: now,
        },
        'approved',
        'event-historic-dux',
      )).rejects.toMatchObject({
        status: 503,
        code: 'DUX_ORDER_RECONCILIATION_REQUIRED',
      });
      await expect(database.prepare(
        'SELECT COUNT(*) AS count FROM payments WHERE order_id = ?',
      ).bind(orderId).first()).resolves.toEqual({ count: 0 });
      expect((await getOrderById(database, orderId))?.status).toBe('preference_pending');
    } finally {
      database.close();
    }
  });
});
