import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

it('aplica 0020 sobre todas las migraciones previas y conserva intención y pedido históricos', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const directory = resolve(process.cwd(), 'migrations');
    const names = readdirSync(directory).filter((name) => /^\d{4}_.*\.sql$/u.test(name)).sort();
    const target = '0020_web_order_requests.sql';
    expect(names).toContain('0019_mercadolibre_editorial.sql');
    for (const name of names.filter((name) => name < target)) db.exec(readFileSync(resolve(directory, name), 'utf8'));
    db.prepare(`INSERT INTO checkout_intents (checkout_idempotency_key, fulfillment_fingerprint, cart_fingerprint, created_at)
      VALUES ('historical-key', 'fulfillment', 'cart', '2026-09-01T12:00:00.000Z')`).run();
    db.prepare(`INSERT INTO orders (id, public_token_hash, checkout_idempotency_key, cart_fingerprint,
      status, currency, total_minor, item_count, created_at, updated_at)
      VALUES ('historical-order', 'historical-token', 'historical-key', 'cart', 'pending', 'ARS', 100, 1,
      '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z')`).run();
    const before = db.prepare('SELECT * FROM orders').all();
    db.exec(readFileSync(resolve(directory, target), 'utf8'));
    expect(db.prepare('SELECT * FROM orders').all()).toEqual(before);
    expect(db.prepare('SELECT intent_kind, fulfillment_fingerprint, cart_fingerprint FROM checkout_intents').get())
      .toEqual({ intent_kind: 'legacy', fulfillment_fingerprint: 'fulfillment', cart_fingerprint: 'cart' });
    expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    const triggers = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger'").all();
    expect(triggers).toContainEqual({ name: 'dux_order_status_lifecycle_blocked' });
    expect(triggers).toContainEqual({ name: 'order_items_require_dux_inventory_snapshot' });
  } finally { db.close(); }
});
