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
const whatsappOrderReservationsMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0007_whatsapp_order_reservations.sql'),
  'utf8',
);
const checkoutProStockMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0008_checkout_pro_stock_and_whatsapp_identity.sql'),
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
      database.exec(whatsappOrderReservationsMigration);
      database.exec(checkoutProStockMigration);
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
        expect.objectContaining({ name: 'idx_orders_channel_status_created', type: 'index' }),
        expect.objectContaining({ name: 'idx_order_items_product_order', type: 'index' }),
        expect.objectContaining({ name: 'commerce_order_items_reserve_stock', type: 'trigger' }),
        expect.objectContaining({ name: 'whatsapp_order_items_pending_only', type: 'trigger' }),
        expect.objectContaining({ name: 'whatsapp_order_items_update_immutable', type: 'trigger' }),
        expect.objectContaining({ name: 'whatsapp_order_items_delete_immutable', type: 'trigger' }),
        expect.objectContaining({ name: 'whatsapp_orders_consume_reservation', type: 'trigger' }),
        expect.objectContaining({ name: 'checkout_orders_consume_stock', type: 'trigger' }),
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
      expect(database.prepare(
        `SELECT status, currency, total_minor, item_count, channel, resolved_at, resolved_by
         FROM orders WHERE id = 'historical-order'`,
      ).get()).toEqual({
        status: 'pending',
        currency: 'ARS',
        total_minor: 2_650_000,
        item_count: 1,
        channel: 'checkout_pro',
        resolved_at: null,
        resolved_by: null,
      });
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
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });

  it('aplica el esquema completo y protege reservas y transiciones de WhatsApp', () => {
    const database = new DatabaseSync(':memory:');
    try {
      applyAllMigrations(database);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

      insertCatalogMutation(database, 'producto-controlado', 5);
      insertWhatsappOrder(database, 'whatsapp-approved', 'whatsapp-key-approved', 3);
      insertOrderItem(database, 'whatsapp-approved', 'producto-controlado', 3);

      expect(database.prepare(`SELECT
        json_extract(payload_json, '$.stockQuantity') AS physical_stock
        FROM catalog_product_mutations WHERE product_id = 'producto-controlado'`).get())
        .toEqual({ physical_stock: 5 });
      expect(reservedQuantity(database, 'producto-controlado')).toBe(3);
      expect(() => database.prepare(`UPDATE order_items SET quantity = 2
        WHERE order_id = 'whatsapp-approved' AND product_id = 'producto-controlado'`).run())
        .toThrow('WHATSAPP_ORDER_ITEMS_IMMUTABLE');
      expect(() => database.prepare(`DELETE FROM order_items
        WHERE order_id = 'whatsapp-approved' AND product_id = 'producto-controlado'`).run())
        .toThrow('WHATSAPP_ORDER_ITEMS_IMMUTABLE');

      expect(() => database.prepare(`INSERT INTO orders (
        id, public_token_hash, checkout_idempotency_key, cart_fingerprint, status,
        currency, total_minor, item_count, created_at, updated_at, channel
      ) VALUES ('invalid-initial-state', 'invalid-initial-token', 'invalid-initial-key',
        'invalid-initial-cart', 'approved', 'ARS', 1000, 1, ?, ?, 'whatsapp')`)
        .run('2026-08-12T10:00:00.000Z', '2026-08-12T10:00:00.000Z'))
        .toThrow('WHATSAPP_INITIAL_STATE_INVALID');
      expect(() => database.prepare(`INSERT INTO orders (
        id, public_token_hash, checkout_idempotency_key, cart_fingerprint, status,
        currency, total_minor, item_count, created_at, updated_at, channel
      ) VALUES ('invalid-channel', 'invalid-channel-token', 'invalid-channel-key',
        'invalid-channel-cart', 'pending', 'ARS', 1000, 1, ?, ?, 'telegram')`)
        .run('2026-08-12T10:00:00.000Z', '2026-08-12T10:00:00.000Z'))
        .toThrow();
      expect(() => database.prepare(
        "UPDATE orders SET channel = 'checkout_pro' WHERE id = 'whatsapp-approved'",
      ).run()).toThrow('WHATSAPP_CHANNEL_IMMUTABLE');

      insertWhatsappOrder(database, 'whatsapp-overstock', 'whatsapp-key-overstock', 3);
      expect(() => insertOrderItem(
        database,
        'whatsapp-overstock',
        'producto-controlado',
        3,
      )).toThrow('STOCK_RESERVATION_INSUFFICIENT');
      database.prepare("DELETE FROM orders WHERE id = 'whatsapp-overstock'").run();

      expect(() => database.prepare(
        "UPDATE orders SET status = 'approved' WHERE id = 'whatsapp-approved'",
      ).run()).toThrow('WHATSAPP_RESOLUTION_METADATA_REQUIRED');
      resolveWhatsappOrder(database, 'whatsapp-approved', 'approved');
      expect(database.prepare(`SELECT status, resolved_at, resolved_by
        FROM orders WHERE id = 'whatsapp-approved'`).get()).toEqual({
        status: 'approved',
        resolved_at: '2026-08-12T12:00:00.000Z',
        resolved_by: 'admin@example.test',
      });
      expect(database.prepare(`SELECT
        json_extract(payload_json, '$.stockQuantity') AS physical_stock,
        updated_by, updated_at
        FROM catalog_product_mutations WHERE product_id = 'producto-controlado'`).get())
        .toEqual({
          physical_stock: 2,
          updated_by: 'admin@example.test',
          updated_at: '2026-08-12T12:00:00.000Z',
        });
      expect(reservedQuantity(database, 'producto-controlado')).toBe(0);

      expect(() => insertOrderItem(
        database,
        'whatsapp-approved',
        'producto-post-terminal',
        1,
      )).toThrow('WHATSAPP_ORDER_ITEMS_NOT_PENDING');

      database.prepare(
        "UPDATE orders SET status = 'approved' WHERE id = 'whatsapp-approved'",
      ).run();
      expect(database.prepare(`SELECT json_extract(payload_json, '$.stockQuantity') AS stock
        FROM catalog_product_mutations WHERE product_id = 'producto-controlado'`).get())
        .toEqual({ stock: 2 });
      expect(() => database.prepare(`UPDATE orders
        SET status = 'rejected', resolved_at = ?, resolved_by = ?
        WHERE id = 'whatsapp-approved'`)
        .run('2026-08-12T13:00:00.000Z', 'admin@example.test'))
        .toThrow('WHATSAPP_STATE_TRANSITION_INVALID');

      insertWhatsappOrder(database, 'whatsapp-rejected', 'whatsapp-key-rejected', 2);
      insertOrderItem(database, 'whatsapp-rejected', 'producto-controlado', 2);
      expect(reservedQuantity(database, 'producto-controlado')).toBe(2);
      resolveWhatsappOrder(database, 'whatsapp-rejected', 'rejected');
      expect(reservedQuantity(database, 'producto-controlado')).toBe(0);
      expect(database.prepare(`SELECT json_extract(payload_json, '$.stockQuantity') AS stock
        FROM catalog_product_mutations WHERE product_id = 'producto-controlado'`).get())
        .toEqual({ stock: 2 });
      expect(() => database.prepare(`UPDATE orders
        SET status = 'approved', resolved_at = ?, resolved_by = ?
        WHERE id = 'whatsapp-rejected'`)
        .run('2026-08-12T13:00:00.000Z', 'admin@example.test'))
        .toThrow('WHATSAPP_STATE_TRANSITION_INVALID');

      insertWhatsappOrder(database, 'whatsapp-pending-stock', 'whatsapp-key-stock', 2);
      insertOrderItem(database, 'whatsapp-pending-stock', 'producto-controlado', 2);
      expect(() => database.prepare(`UPDATE catalog_product_mutations
        SET payload_json = json_set(payload_json, '$.stockQuantity', 1)
        WHERE product_id = 'producto-controlado'`).run())
        .toThrow('STOCK_BELOW_RESERVATIONS');
      expect(() => database.prepare(`UPDATE catalog_product_mutations
        SET payload_json = json_remove(payload_json, '$.stockQuantity')
        WHERE product_id = 'producto-controlado'`).run())
        .toThrow('STOCK_CONTROL_REQUIRED');
      expect(() => database.prepare(`UPDATE catalog_product_mutations
        SET payload_json = NULL, deleted = 1
        WHERE product_id = 'producto-controlado'`).run())
        .toThrow('STOCK_CONTROL_REQUIRED');
      resolveWhatsappOrder(database, 'whatsapp-pending-stock', 'rejected');

      insertWhatsappOrder(database, 'whatsapp-untracked', 'whatsapp-key-untracked', 1);
      insertOrderItem(database, 'whatsapp-untracked', 'producto-sin-control', 1);
      expect(() => insertCatalogMutation(database, 'producto-sin-control', 0))
        .toThrow('STOCK_BELOW_RESERVATIONS');
      insertCatalogMutation(database, 'producto-sin-control', 1);

      insertDeletedCatalogMutation(database, 'producto-eliminado');
      insertWhatsappOrder(database, 'whatsapp-deleted', 'whatsapp-key-deleted', 1);
      expect(() => insertOrderItem(
        database,
        'whatsapp-deleted',
        'producto-eliminado',
        1,
      )).toThrow('STOCK_PRODUCT_DELETED');

      insertCatalogMutation(database, 'producto-no-disponible', 3, 'unavailable');
      insertWhatsappOrder(database, 'whatsapp-unavailable', 'whatsapp-key-unavailable', 1);
      expect(() => insertOrderItem(
        database,
        'whatsapp-unavailable',
        'producto-no-disponible',
        1,
      )).toThrow('STOCK_PRODUCT_UNAVAILABLE');

      insertCatalogMutation(database, 'producto-inconsistente', 2);
      insertWhatsappOrder(database, 'whatsapp-inconsistent', 'whatsapp-key-inconsistent', 2);
      insertOrderItem(database, 'whatsapp-inconsistent', 'producto-inconsistente', 1);
      expect(() => resolveWhatsappOrder(database, 'whatsapp-inconsistent', 'approved'))
        .toThrow('WHATSAPP_RESERVATION_INCONSISTENT');

      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
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

function applyAllMigrations(database: DatabaseSync): void {
  for (const migration of [
    commerceMigration,
    fulfillmentMigration,
    checkoutIntentMigration,
    catalogMigration,
    adminAuthMigration,
    analyticsManualPaymentMigration,
    whatsappOrderReservationsMigration,
    checkoutProStockMigration,
  ]) {
    database.exec(migration);
  }
}

function insertWhatsappOrder(
  database: DatabaseSync,
  id: string,
  idempotencyKey: string,
  itemCount: number,
): void {
  database.prepare(`INSERT INTO orders (
    id, public_token_hash, checkout_idempotency_key, cart_fingerprint, status,
    currency, total_minor, item_count, created_at, updated_at, channel
  ) VALUES (?, ?, ?, ?, 'pending', 'ARS', ?, ?, ?, ?, 'whatsapp')`)
    .run(
      id,
      `${id}-public-token-hash`,
      idempotencyKey,
      `${id}-cart-fingerprint`,
      itemCount * 1_000,
      itemCount,
      '2026-08-12T10:00:00.000Z',
      '2026-08-12T10:00:00.000Z',
    );
}

function insertOrderItem(
  database: DatabaseSync,
  orderId: string,
  productId: string,
  quantity: number,
): void {
  const controlled = database.prepare(`SELECT COUNT(*) AS count
    FROM catalog_product_mutations
    WHERE product_id = ? AND deleted = 0
      AND json_type(payload_json, '$.stockQuantity') = 'integer'`)
    .get(productId) as Readonly<{ count: number }>;
  database.prepare(`INSERT INTO order_items (
    order_id, product_id, name, quantity, unit_price_minor, subtotal_minor,
    stock_controlled
  ) VALUES (?, ?, ?, ?, 1000, ?, ?)`)
    .run(
      orderId,
      productId,
      `Producto ${productId}`,
      quantity,
      quantity * 1_000,
      controlled.count === 1 ? 1 : 0,
    );
}

function insertCatalogMutation(
  database: DatabaseSync,
  productId: string,
  stockQuantity: number,
  availability: 'available' | 'unavailable' = 'available',
): void {
  database.prepare(`INSERT INTO catalog_product_mutations (
    product_id, payload_json, deleted, updated_by, created_at, updated_at
  ) VALUES (?, ?, 0, 'admin@example.test', ?, ?)`)
    .run(
      productId,
      JSON.stringify({ availability, stockQuantity }),
      '2026-08-12T10:00:00.000Z',
      '2026-08-12T10:00:00.000Z',
    );
}

function insertDeletedCatalogMutation(database: DatabaseSync, productId: string): void {
  database.prepare(`INSERT INTO catalog_product_mutations (
    product_id, payload_json, deleted, updated_by, created_at, updated_at
  ) VALUES (?, NULL, 1, 'admin@example.test', ?, ?)`)
    .run(
      productId,
      '2026-08-12T10:00:00.000Z',
      '2026-08-12T10:00:00.000Z',
    );
}

function resolveWhatsappOrder(
  database: DatabaseSync,
  orderId: string,
  status: 'approved' | 'rejected',
): void {
  database.prepare(`UPDATE orders
    SET status = ?, resolved_at = ?, resolved_by = ?, updated_at = ?
    WHERE id = ?`)
    .run(
      status,
      '2026-08-12T12:00:00.000Z',
      'admin@example.test',
      '2026-08-12T12:00:00.000Z',
      orderId,
    );
}

function reservedQuantity(database: DatabaseSync, productId: string): number {
  const row = database.prepare(`SELECT COALESCE(SUM(items.quantity), 0) AS quantity
    FROM order_items AS items
    INNER JOIN orders ON orders.id = items.order_id
    WHERE items.product_id = ?
      AND orders.channel = 'whatsapp'
      AND orders.status = 'pending'`).get(productId) as { quantity: number };
  return row.quantity;
}
