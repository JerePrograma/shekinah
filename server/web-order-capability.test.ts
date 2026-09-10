import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { persistDuxCatalogSnapshot } from './dux-catalog';
import type { Env } from './platform';
import { SqliteD1 } from './test/sqlite-d1';
import { webOrderRegistrationEnabled } from './web-order-capability';

function migrations(): string {
  const root = resolve(process.cwd(), 'migrations');
  return readdirSync(root)
    .filter((name) => /^\d{4}_.*\.sql$/u.test(name))
    .sort()
    .map((name) => readFileSync(resolve(root, name), 'utf8'))
    .join('\n');
}

const now = '2026-09-10T12:00:00.000Z';
const env = Object.freeze({
  WEB_ORDERS_ENABLED: 'true',
  ORDER_TOKEN_SECRET: 'o'.repeat(40),
  DUX_SNAPSHOT_MAX_AGE_SECONDS: '900',
} satisfies Env);

async function seedPublicSnapshot(database: SqliteD1): Promise<void> {
  await database.prepare(`INSERT INTO dux_tenant_context (
    id, api_version, company_id, company_name, branch_id, branch_name,
    deposit_id, deposit_name, verified_at, updated_at
  ) VALUES (1, 'v2', '12862', 'Empresa de prueba', '1', 'Sucursal de prueba',
    '25566', 'Depósito de prueba', ?, ?)`)
    .bind(now, now)
    .run();
  await database.prepare(`UPDATE dux_catalog_control SET
    snapshot_collection_enabled = 1, updated_by = 'test', updated_at = ?
    WHERE company_id = '12862'`).bind(now).run();
  await database.prepare(`INSERT INTO dux_sync_runs (
    id, kind, status, trigger_actor, processed_count, mapped_count,
    unmapped_count, ambiguous_count, absent_count, failed_count,
    started_at, completed_at, created_at, updated_at
  ) VALUES ('dux_sync_capability', 'manual', 'succeeded', 'test', 1, 0, 1, 0, 0, 0, ?, ?, ?, ?)`)
    .bind(now, now, now, now).run();
  await persistDuxCatalogSnapshot(database, 'dux_sync_capability', [Object.freeze({
    code: 'CAP-1',
    name: 'Producto capacidad',
    enabled: true,
    unitsPerPackage: null,
    prices: Object.freeze([{ id: 1, name: 'PRECIOS DEL NEGOCIO', amount: 100, valid: true }]),
    category: null,
    subcategory: null,
    imageUrl: null,
    description: null,
  })], now);
  await database.prepare(`UPDATE dux_catalog_control SET
    public_catalog_enabled = 1, updated_by = 'test', updated_at = ?
    WHERE company_id = '12862'`).bind(now).run();
}

describe('capacidad runtime de solicitudes web', () => {
  it('habilita sólo con 0020, secreto, catálogo público y snapshot fresco', async () => {
    const database = new SqliteD1(migrations());
    try {
      await seedPublicSnapshot(database);
      await expect(webOrderRegistrationEnabled(database, env, Date.parse(now) + 60_000)).resolves.toBe(true);
    } finally {
      database.close();
    }
  });

  it('falla cerrado cuando el flag está apagado sin requerir lecturas operativas', async () => {
    const database = new SqliteD1(migrations());
    try {
      await expect(webOrderRegistrationEnabled(database, { ...env, WEB_ORDERS_ENABLED: 'false' }, Date.parse(now))).resolves.toBe(false);
    } finally {
      database.close();
    }
  });

  it('falla cerrado si el catálogo no está público o el snapshot está vencido', async () => {
    const database = new SqliteD1(migrations());
    try {
      await seedPublicSnapshot(database);
      await database.prepare(`UPDATE dux_catalog_control SET public_catalog_enabled = 0,
        updated_by = 'test', updated_at = ? WHERE company_id = '12862'`).bind(now).run();
      await expect(webOrderRegistrationEnabled(database, env, Date.parse(now))).resolves.toBe(false);
      await database.prepare(`UPDATE dux_catalog_control SET public_catalog_enabled = 1,
        updated_by = 'test', updated_at = ? WHERE company_id = '12862'`).bind(now).run();
      await expect(webOrderRegistrationEnabled(database, env, Date.parse(now) + 901_000)).resolves.toBe(false);
    } finally {
      database.close();
    }
  });

  it('falla cerrado si falta el secreto server-side', async () => {
    const database = new SqliteD1(migrations());
    try {
      await seedPublicSnapshot(database);
      await expect(webOrderRegistrationEnabled(database, { ...env, ORDER_TOKEN_SECRET: undefined }, Date.parse(now))).resolves.toBe(false);
    } finally {
      database.close();
    }
  });
});
