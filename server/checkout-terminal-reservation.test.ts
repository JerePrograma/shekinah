import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { RecalculatedCart } from './catalog';
import { createCatalogProduct, getCatalogProductDetail } from './catalog-store';
import {
  getOrderById,
  prepareOrder,
  updateOrderFromPayment,
} from './orders';
import { SqliteD1 } from './test/sqlite-d1';

const baseMigrationNames = [
  '0001_commerce.sql',
  '0002_fulfillment_and_retention.sql',
  '0003_checkout_intent_cart_fingerprint.sql',
  '0004_catalog_admin.sql',
  '0005_admin_auth.sql',
  '0006_analytics_manual_payment_click.sql',
  '0007_whatsapp_order_reservations.sql',
  '0008_checkout_pro_stock_and_whatsapp_identity.sql',
  '0009_mercadolibre_catalog_and_inventory.sql',
] as const;
const baseMigrations = baseMigrationNames
  .map((name) => readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8'))
  .join('\n');
const terminalReservationMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0010_checkout_terminal_reservation_release.sql'),
  'utf8',
);

describe('liberación de reservas terminales de Checkout Pro', () => {
  for (const terminalStatus of ['rejected', 'cancelled'] as const) {
    it(`libera inmediatamente al pasar a ${terminalStatus} y tolera reintentos`, async () => {
      const database = new SqliteD1(`${baseMigrations}\n${terminalReservationMigration}`);
      try {
        await createControlledProduct(database);
        const first = await prepareOrder({
          cart: controlledCart(),
          database,
          idempotencyKey: crypto.randomUUID(),
          tokenSecret: 'o'.repeat(40),
        });
        expect(await getCatalogProductDetail(database, 'producto-terminal')).toMatchObject({
          stockQuantity: 1,
          reservedQuantity: 1,
          availableQuantity: 0,
        });

        const payment = {
          id: `payment-${terminalStatus}`,
          status: terminalStatus,
          statusDetail: terminalStatus,
          amountMinor: first.order.total_minor,
          currency: 'ARS',
          externalReference: first.order.id,
          approvedAt: null,
          updatedAt: '2026-08-26T12:00:00.000Z',
        } as const;
        await updateOrderFromPayment(
          database,
          first.order,
          payment,
          terminalStatus,
          `event-${terminalStatus}`,
        );

        const terminalOrder = await getOrderById(database, first.order.id);
        expect(terminalOrder).toMatchObject({ status: terminalStatus });
        expect(terminalOrder?.stock_reservation_expires_at).toBe(
          terminalOrder?.updated_at,
        );
        expect(await getCatalogProductDetail(database, 'producto-terminal')).toMatchObject({
          stockQuantity: 1,
          reservedQuantity: 0,
          availableQuantity: 1,
        });

        const second = await prepareOrder({
          cart: controlledCart(),
          database,
          idempotencyKey: crypto.randomUUID(),
          tokenSecret: 'o'.repeat(40),
        });
        expect(second.created).toBe(true);
        expect(await getCatalogProductDetail(database, 'producto-terminal')).toMatchObject({
          stockQuantity: 1,
          reservedQuantity: 1,
          availableQuantity: 0,
        });

        if (terminalOrder === null) throw new Error('Pedido terminal ausente.');
        await updateOrderFromPayment(
          database,
          terminalOrder,
          payment,
          terminalStatus,
          `event-${terminalStatus}-repeated`,
        );
        expect(await getCatalogProductDetail(database, 'producto-terminal')).toMatchObject({
          stockQuantity: 1,
          reservedQuantity: 1,
          availableQuantity: 0,
        });
      } finally {
        database.close();
      }
    });
  }

  it('libera reservas terminales anteriores al despliegue de la migración', async () => {
    const historicalOrderId = 'ord_terminal_historical_release';
    const historicalSetup = `
      INSERT INTO catalog_product_mutations (
        product_id, payload_json, deleted, updated_by, created_at, updated_at
      ) VALUES (
        'producto-historico',
        '{"availability":"available","stockQuantity":1}',
        0,
        'migration@test.invalid',
        '2000-01-01T00:00:00.000Z',
        '2000-01-01T00:00:00.000Z'
      );

      INSERT INTO orders (
        id, public_token_hash, checkout_idempotency_key, cart_fingerprint,
        status, currency, total_minor, item_count, created_at, updated_at,
        channel, stock_reserved_at, stock_reservation_expires_at
      ) VALUES (
        '${historicalOrderId}',
        'historical-public-token-hash',
        '00000000-0000-4000-8000-000000000010',
        'historical-cart-fingerprint',
        'preference_pending',
        'ARS',
        100000,
        1,
        '2000-01-01T00:00:00.000Z',
        '2000-01-01T00:00:00.000Z',
        'checkout_pro',
        '2000-01-01T00:00:00.000Z',
        '2099-01-01T00:30:00.000Z'
      );

      INSERT INTO order_items (
        order_id, product_id, name, presentation, quantity,
        unit_price_minor, subtotal_minor, stock_controlled
      ) VALUES (
        '${historicalOrderId}',
        'producto-historico',
        'Producto histórico',
        '100 g',
        1,
        100000,
        100000,
        1
      );

      UPDATE orders
      SET status = 'rejected',
          updated_at = '2000-01-01T00:05:00.000Z'
      WHERE id = '${historicalOrderId}';
    `;
    const database = new SqliteD1(
      `${baseMigrations}\n${historicalSetup}\n${terminalReservationMigration}`,
    );
    try {
      await expect(database.prepare(
        `SELECT stock_reservation_expires_at
         FROM orders
         WHERE id = ?`,
      ).bind(historicalOrderId).first<string>('stock_reservation_expires_at'))
        .resolves.toBe('2000-01-01T00:05:00.000Z');

      await database.prepare(`INSERT INTO orders (
        id, public_token_hash, checkout_idempotency_key, cart_fingerprint,
        status, currency, total_minor, item_count, created_at, updated_at,
        channel, stock_reserved_at, stock_reservation_expires_at
      ) VALUES (
        'ord_terminal_historical_replacement',
        'replacement-public-token-hash',
        '00000000-0000-4000-8000-000000000011',
        'replacement-cart-fingerprint',
        'preference_pending',
        'ARS',
        100000,
        1,
        '2000-01-01T00:06:00.000Z',
        '2000-01-01T00:06:00.000Z',
        'checkout_pro',
        '2000-01-01T00:06:00.000Z',
        '2099-01-01T00:36:00.000Z'
      )`).run();
      await expect(database.prepare(`INSERT INTO order_items (
        order_id, product_id, name, presentation, quantity,
        unit_price_minor, subtotal_minor, stock_controlled
      ) VALUES (
        'ord_terminal_historical_replacement',
        'producto-historico',
        'Producto histórico',
        '100 g',
        1,
        100000,
        100000,
        1
      )`).run()).resolves.toBeDefined();
    } finally {
      database.close();
    }
  });
});

async function createControlledProduct(database: SqliteD1): Promise<void> {
  await createCatalogProduct(database, {
    id: 'producto-terminal',
    slug: 'producto-terminal',
    path: '/producto-terminal/',
    name: 'Producto terminal',
    categorySlugs: ['agroecologicos'],
    categoryNames: ['Agroecologicos'],
    presentation: '100 g',
    price: { amount: 1_000, currency: 'ARS' },
    availability: 'available',
    stockQuantity: 1,
    images: [],
    variants: [],
  }, 'admin@example.test');
}

function controlledCart(): RecalculatedCart {
  return Object.freeze({
    lines: Object.freeze([
      Object.freeze({
        product: Object.freeze({
          id: 'producto-terminal',
          name: 'Producto terminal',
          presentation: '100 g',
          unitPriceMinor: 100_000,
          available: true,
          stockControlled: true,
        }),
        quantity: 1,
        subtotalMinor: 100_000,
      }),
    ]),
    currency: 'ARS',
    itemCount: 1,
    productsTotalMinor: 100_000,
    shippingMinor: 0,
    shippingTier: 'coordinated_pickup',
    totalWeightGrams: 100,
    fulfillment: Object.freeze({
      method: 'coordinated_pickup',
      fullName: 'Ana Pérez',
      phone: '5491155554444',
      address: 'Calle 123',
      locality: 'CABA',
      province: 'Buenos Aires',
      postalCode: 'C1234ABC',
    }),
    totalMinor: 100_000,
  });
}
