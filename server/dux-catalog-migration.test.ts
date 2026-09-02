import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const commerceMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0001_commerce.sql'),
  'utf8',
);
const inventoryMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0012_dux_authoritative_inventory.sql'),
  'utf8',
);
const catalogMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0015_dux_catalog_snapshot.sql'),
  'utf8',
);

describe('migración del catálogo Dux', () => {
  it('exige un run completo y una cardinalidad coherente', () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec(commerceMigration);
      database.exec(inventoryMigration);
      database.exec(catalogMigration);
      const now = '2026-09-02T20:00:00.000Z';
      database.prepare(`INSERT INTO dux_sync_runs (
        id, kind, status, trigger_actor, started_at, created_at, updated_at
      ) VALUES ('dux_sync_catalog_migration', 'manual', 'running', 'test', ?, ?, ?)`).run(
        now,
        now,
        now,
      );
      const payload = JSON.stringify({
        schemaVersion: 1,
        priceListName: 'PRECIOS DEL NEGOCIO',
        items: [],
      });

      expect(() => insertSnapshot(database, payload, 0, now))
        .toThrow('DUX_CATALOG_REQUIRES_COMPLETED_SYNC');
      database.prepare(`UPDATE dux_sync_runs
        SET status = 'succeeded', completed_at = ?, updated_at = ?
        WHERE id = 'dux_sync_catalog_migration'`).run(now, now);
      expect(() => insertSnapshot(database, payload, 1, now)).toThrow();
      expect(() => insertSnapshot(database, payload, 0, now)).not.toThrow();
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});

function insertSnapshot(
  database: DatabaseSync,
  payload: string,
  count: number,
  now: string,
): void {
  database.prepare(`INSERT INTO dux_catalog_snapshot (
    id, inventory_run_id, catalog_version, price_list_name, item_count,
    payload_json, synced_at, created_at, updated_at
  ) VALUES (1, 'dux_sync_catalog_migration', ?, 'PRECIOS DEL NEGOCIO', ?, ?, ?, ?, ?)`).run(
    'a'.repeat(64),
    count,
    payload,
    now,
    now,
    now,
  );
}
