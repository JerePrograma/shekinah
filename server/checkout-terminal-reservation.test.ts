import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
describe('migración histórica de reservas terminales de Checkout Pro', () => {
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
