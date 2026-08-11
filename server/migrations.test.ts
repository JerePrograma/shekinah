import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const commerceMigration = readFileSync(resolve(process.cwd(), 'migrations', '0001_commerce.sql'), 'utf8');
const fulfillmentMigration = readFileSync(resolve(process.cwd(), 'migrations', '0002_fulfillment_and_retention.sql'), 'utf8');
const checkoutIntentMigration = readFileSync(resolve(process.cwd(), 'migrations', '0003_checkout_intent_cart_fingerprint.sql'), 'utf8');
const catalogMigration = readFileSync(resolve(process.cwd(), 'migrations', '0004_catalog_admin.sql'), 'utf8');
const adminAuthMigration = readFileSync(resolve(process.cwd(), 'migrations', '0005_admin_auth.sql'), 'utf8');
const analyticsManualPaymentMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0006_analytics_manual_payment_click.sql'),
  'utf8',
);

describe('migraciones D1', () => {
  it('preserva pedidos históricos y aplica constraints, idempotencia y cascade', () => {
    const database = new DatabaseSync(':memory:');
    try {
      expect(database.prepare('SELECT name, type FROM sqlite_schema ORDER BY type, name').all()).toEqual([]);
      database.exec(commerceMigration);
      insertOrder(database, 'historical-order', 'historical-key');
      database.exec(fulfillmentMigration);
      database.prepare("INSERT INTO checkout_intents VALUES ('historical-key', 'fulfillment-fingerprint', ?)")
        .run('2026-08-04T00:00:00.000Z');
      database.exec(checkoutIntentMigration);
      database.exec(catalogMigration);
      database.exec(adminAuthMigration);
      const legacyAnalytics = insertLegacyAnalytics(database);
      database.exec(analyticsManualPaymentMigration);
      expect(() => database.exec(`${commerceMigration}\n${fulfillmentMigration}\n${catalogMigration}\n${adminAuthMigration}`)).not.toThrow();

      const schema = database.prepare('SELECT name, type FROM sqlite_schema ORDER BY type, name').all();
      expect(schema).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'orders', type: 'table' }),
        expect.objectContaining({ name: 'order_fulfillment', type: 'table' }),
        expect.objectContaining({ name: 'checkout_intents', type: 'table' }),
        expect.objectContaining({ name: 'analytics_maintenance', type: 'table' }),
        expect.objectContaining({ name: 'catalog_product_mutations', type: 'table' }),
        expect.objectContaining({ name: 'idx_catalog_product_mutations_updated', type: 'index' }),
        expect.objectContaining({ name: 'admin_login_rate_limits', type: 'table' }),
        expect.objectContaining({ name: 'idx_admin_login_rate_limits_updated', type: 'index' }),
        expect.objectContaining({ name: 'idx_analytics_events_created', type: 'index' }),
        expect.objectContaining({ name: 'idx_analytics_events_name_created', type: 'index' }),
        expect.objectContaining({ name: 'idx_analytics_events_product', type: 'index' }),
      ]));
      expect(schema).not.toContainEqual(expect.objectContaining({ name: 'analytics_events_v2' }));
      expect(database.prepare(
        'SELECT id, event_name, path, product_id FROM analytics_events ORDER BY id',
      ).all()).toEqual(legacyAnalytics);
      expect(() => database.prepare(`INSERT INTO analytics_events (
        id, session_hash, event_name, path, product_id, source, device_class, created_at
      ) VALUES ('manual-click', 'legacy-session-hash', 'manual_payment_click', '/carrito',
        NULL, 'direct', 'desktop', '2026-08-10T00:00:00.000Z')`).run()).not.toThrow();
      expect(() => database.prepare(`INSERT INTO analytics_events (
        id, session_hash, event_name, path, product_id, source, device_class, created_at
      ) VALUES ('unknown-event', 'legacy-session-hash', 'payment_approved', '/carrito',
        NULL, 'direct', 'desktop', '2026-08-10T00:00:00.000Z')`).run()).toThrow();
      expect(database.prepare("SELECT cart_fingerprint FROM checkout_intents WHERE checkout_idempotency_key = 'historical-key'").get())
        .toEqual({ cart_fingerprint: 'historical-order-cart-fingerprint' });
      expect(database.prepare(`SELECT order_fulfillment.order_id
        FROM orders LEFT JOIN order_fulfillment ON order_fulfillment.order_id = orders.id
        WHERE orders.id = 'historical-order'`).get()).toEqual({ order_id: null });

      insertOrder(database, 'new-order', 'new-key');
      database.prepare(`INSERT INTO order_fulfillment (
        order_id, delivery_method, full_name, phone, address, locality, province,
        postal_code, total_weight_grams, shipping_tier, products_total_minor,
        shipping_minor, created_at, updated_at
      ) VALUES (?, 'correo_argentino', 'Ana Pérez', '5491155554444', 'Calle 123',
        'CABA', 'Buenos Aires', 'C1234ABC', 1000, 'correo_up_to_1kg', 750000,
        1900000, ?, ?)`)
        .run('new-order', '2026-08-04T00:00:00.000Z', '2026-08-04T00:00:00.000Z');
      database.prepare("INSERT INTO checkout_intents (checkout_idempotency_key, fulfillment_fingerprint, cart_fingerprint, created_at) VALUES ('intent-key', 'fingerprint-1', ?, ?)")
        .run('cart-fingerprint-1', '2026-08-04T00:00:00.000Z');
      expect(() => database.prepare("INSERT INTO checkout_intents (checkout_idempotency_key, fulfillment_fingerprint, cart_fingerprint, created_at) VALUES ('intent-key', 'fingerprint-2', ?, ?)")
        .run('cart-fingerprint-2', '2026-08-04T00:00:00.000Z')).toThrow();

      database.prepare("DELETE FROM orders WHERE id = 'new-order'").run();
      expect(database.prepare("SELECT COUNT(*) AS count FROM order_fulfillment WHERE order_id = 'new-order'").get()).toEqual({ count: 0 });

      insertOrder(database, 'invalid-order', 'invalid-key');
      expect(() => database.prepare(`INSERT INTO order_fulfillment (
        order_id, delivery_method, full_name, phone, address, locality, province,
        postal_code, total_weight_grams, shipping_tier, products_total_minor,
        shipping_minor, created_at, updated_at
      ) VALUES ('invalid-order', 'coordinated_pickup', 'Ana Pérez', '5491155554444',
        'Calle 123', 'CABA', 'Buenos Aires', 'C1234ABC', NULL,
        'coordinated_pickup', 750000, 1, ?, ?)`)
        .run('2026-08-04T00:00:00.000Z', '2026-08-04T00:00:00.000Z')).toThrow();

      database.prepare(`INSERT INTO catalog_product_mutations (
        product_id, payload_json, deleted, updated_by, created_at, updated_at
      ) VALUES ('producto-prueba', '{}', 0, 'admin@example.test', ?, ?)`)
        .run('2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z');
      expect(() => database.prepare(`INSERT INTO catalog_product_mutations (
        product_id, payload_json, deleted, updated_by, created_at, updated_at
      ) VALUES ('json-invalido', '{', 0, 'admin@example.test', ?, ?)`)
        .run('2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z')).toThrow();

      database.prepare(`INSERT INTO admin_login_rate_limits (
        scope_key, window_started_at, attempt_count, blocked_until, updated_at
      ) VALUES ('opaque-scope', 1, 1, 0, 1)`).run();
      expect(() => database.prepare(`INSERT INTO admin_login_rate_limits (
        scope_key, window_started_at, attempt_count, blocked_until, updated_at
      ) VALUES ('invalid-attempt-count', 1, -1, 0, 1)`).run()).toThrow();
      expect(() => database.prepare(`INSERT INTO admin_login_rate_limits (
        scope_key, window_started_at, attempt_count, blocked_until, updated_at
      ) VALUES ('invalid-block', 1, 1, -1, 1)`).run()).toThrow();
      expect(() => database.prepare(`INSERT INTO catalog_product_mutations (
        product_id, payload_json, deleted, updated_by, created_at, updated_at
      ) VALUES ('tombstone-invalido', '{}', 1, 'admin@example.test', ?, ?)`)
        .run('2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z')).toThrow();
    } finally {
      database.close();
    }
  });
});

function insertLegacyAnalytics(database: DatabaseSync) {
  const eventNames = [
    'page_view',
    'product_view',
    'cart_add',
    'cart_remove',
    'checkout_start',
    'checkout_redirect',
    'whatsapp_open',
    'consent_granted',
  ] as const;
  database.prepare(`INSERT INTO analytics_sessions (
    session_hash, consent_version, created_at, updated_at
  ) VALUES ('legacy-session-hash', '1', ?, ?)`).run(
    '2026-08-10T00:00:00.000Z',
    '2026-08-10T00:00:00.000Z',
  );
  for (const [index, eventName] of eventNames.entries()) {
    database.prepare(`INSERT INTO analytics_events (
      id, session_hash, event_name, path, product_id, source, device_class, created_at
    ) VALUES (?, 'legacy-session-hash', ?, ?, ?, 'direct', 'desktop', ?)`)
      .run(
        `legacy-${String(index).padStart(2, '0')}`,
        eventName,
        eventName === 'page_view' ? '/' : '/carrito',
        eventName === 'product_view' || eventName === 'cart_add' || eventName === 'cart_remove'
          ? 'producto-prueba'
          : null,
        `2026-08-10T00:00:${String(index).padStart(2, '0')}.000Z`,
      );
  }
  return database.prepare(
    'SELECT id, event_name, path, product_id FROM analytics_events ORDER BY id',
  ).all();
}

function insertOrder(database: DatabaseSync, id: string, idempotencyKey: string): void {
  database.prepare(`INSERT INTO orders (
    id, public_token_hash, checkout_idempotency_key, cart_fingerprint, status,
    currency, total_minor, item_count, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'pending', 'ARS', 2650000, 1, ?, ?)`)
    .run(
      id,
      `${id}-public-token-hash`,
      idempotencyKey,
      `${id}-cart-fingerprint`,
      '2026-08-04T00:00:00.000Z',
      '2026-08-04T00:00:00.000Z',
    );
}
