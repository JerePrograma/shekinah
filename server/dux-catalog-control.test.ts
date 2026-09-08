import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTestD1 } from '../src/test/d1';
import { parseDuxCatalogSourceItems, persistDuxCatalogSnapshot } from './dux-catalog';
import { persistDuxCatalogSnapshotWhenEnabled, readDuxCatalogControl, updateDuxCatalogControl } from './dux-catalog-control';
import { readPublicCatalog } from './dux-public-catalog';
import { onRequest } from '../functions/api/admin/dux/catalog-control';
import type { AdminContextData, PagesFunctionContext } from './platform';

const now = '2026-09-06T12:00:00.000Z';
const env = { DUX_COMPANY_ID: '12862', PUBLIC_SITE_URL: 'https://example.test', ALLOWED_SITE_ORIGINS: 'https://example.test' };
const migrations = readdirSync(resolve('migrations')).filter((path) => path.endsWith('.sql')).sort()
  .map((path) => readFileSync(resolve('migrations', path), 'utf8'));
const actor: AdminContextData = { adminIdentity: { sub: 'test', actor: 'operator', authMethod: 'password' } };

function database() {
  const db = createTestD1(...migrations);
  db.sqlite.prepare(`INSERT INTO dux_tenant_context VALUES (1,'v2','12862','Test','1','Branch','25566','Deposit',?,?)`).run(now, now);
  db.sqlite.prepare(`INSERT INTO dux_sync_runs (id,kind,status,trigger_actor,started_at,completed_at,created_at,updated_at)
    VALUES ('dux_sync_controls','manual','succeeded','test',?,?,?,?)`).run(now, now, now, now);
  return db;
}
function items(price: number | null = null) {
  return parseDuxCatalogSourceItems({ datos: [{ cod_item: 'TEST', item: 'DUX TEST', habilitado: true,
    precios: price === null ? [] : [{ id: 1, nombre: 'PRECIOS DEL NEGOCIO', precio: price }],
    ctd_unidades_por_bulto: null, rubro: null, sub_rubro: null, imagen_url: null, descripcion: null }] });
}
async function snapshot(db: ReturnType<typeof database>, price: number | null = null) {
  await updateDuxCatalogControl(db.database, 'operator', { snapshotCollectionEnabled: true });
  await persistDuxCatalogSnapshot(db.database, 'dux_sync_controls', items(price), now);
}
function request(db: ReturnType<typeof database>, body?: unknown, data = actor, origin = 'https://example.test') {
  const context: PagesFunctionContext<typeof env & { DB: typeof db.database }, string, AdminContextData> = {
    request: new Request('https://example.test/api/admin/dux/catalog-control', { method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
    env: { ...env, DB: db.database }, data, params: {}, next: () => Promise.resolve(new Response()), waitUntil: () => {},
  };
  return onRequest(context);
}

describe('catálogo completo y controles separados 0017', () => {
  it.each([14, 16])('una restauración con migraciones hasta %i no publica productos manuales', async (count) => {
    const db = createTestD1(...migrations.slice(0, count));
    try {
      await expect(readDuxCatalogControl(db.database)).resolves.toEqual({
        migrationApplied: false, companyId: '12862', snapshotCollectionEnabled: false,
        publicCatalogEnabled: false, publicCutoverEnabled: false,
      });
      const catalog = await readPublicCatalog(db.database, env);
      expect(catalog.source).toBe('dux');
      expect(catalog.products).toEqual([]);
      await expect(updateDuxCatalogControl(db.database, 'operator', { publicCatalogEnabled: true }))
        .rejects.toMatchObject({ code: 'DUX_CATALOG_CONTROL_MIGRATION_REQUIRED' });
    } finally { db.close(); }
  });

  it('migra de forma aditiva, conserva v1, nace cerrado y la colección requiere permiso', async () => {
    const db = database();
    try {
      expect(db.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(db.sqlite.prepare("SELECT name FROM sqlite_schema WHERE name = 'dux_catalog_snapshot'").get()).toBeDefined();
      await expect(readDuxCatalogControl(db.database)).resolves.toMatchObject({
        migrationApplied: true, snapshotCollectionEnabled: false, publicCatalogEnabled: false, publicCutoverEnabled: false,
      });
      await expect(persistDuxCatalogSnapshotWhenEnabled(db.database, env, 'dux_sync_controls', items(), now)).resolves.toEqual({ status: 'disabled' });
      await snapshot(db);
      await expect(readDuxCatalogControl(db.database)).resolves.toMatchObject({ snapshotCollectionEnabled: true, publicCatalogEnabled: false, publicCutoverEnabled: false });
      expect(db.sqlite.prepare('SELECT COUNT(*) AS count FROM dux_catalog_snapshots_v2').get()?.count).toBe(1);
    } finally { db.close(); }
  });

  it('rechaza activación sin snapshot, vacío, tenant incorrecto y payload adulterado', async () => {
    const db = database();
    try {
      await expect(updateDuxCatalogControl(db.database, 'operator', { publicCatalogEnabled: true })).rejects.toMatchObject({ code: 'DUX_CATALOG_PUBLIC_REQUIRES_SNAPSHOT' });
      await updateDuxCatalogControl(db.database, 'operator', { snapshotCollectionEnabled: true });
      await persistDuxCatalogSnapshot(db.database, 'dux_sync_controls', [], now);
      await expect(updateDuxCatalogControl(db.database, 'operator', { publicCatalogEnabled: true })).rejects.toMatchObject({ code: 'DUX_CATALOG_PUBLIC_REQUIRES_SNAPSHOT' });
      await snapshot(db);
      db.sqlite.exec("UPDATE dux_tenant_context SET company_id = 'wrong'");
      await expect(updateDuxCatalogControl(db.database, 'operator', { publicCatalogEnabled: true })).rejects.toMatchObject({ code: 'DUX_CATALOG_TENANT_MISMATCH' });
      db.sqlite.exec("UPDATE dux_tenant_context SET company_id = '12862'");
      db.sqlite.exec("UPDATE dux_catalog_snapshots_v2 SET catalog_version = '" + '0'.repeat(64) + "'");
      await expect(updateDuxCatalogControl(db.database, 'operator', { publicCatalogEnabled: true })).rejects.toMatchObject({ status: 503 });
    } finally { db.close(); }
  });

  it('publica sin precio, deja comercio cerrado y rollback oculta sin borrar datos', async () => {
    const db = database();
    try {
      const local = await readPublicCatalog(db.database, env);
      await snapshot(db, 1);
      await updateDuxCatalogControl(db.database, 'operator', { publicCatalogEnabled: true });
      const dux = await readPublicCatalog(db.database, env);
      expect(dux.products).toHaveLength(1);
      expect(dux.products[0]).toMatchObject({ sku: 'TEST', price: null, priceStatus: 'placeholder', commerce: { checkoutEligible: false } });
      await expect(updateDuxCatalogControl(db.database, 'operator', { publicCutoverEnabled: true })).rejects.toMatchObject({ code: 'DUX_CATALOG_CUTOVER_PRICE_INVALID' });
      await updateDuxCatalogControl(db.database, 'operator', { snapshotCollectionEnabled: false });
      await expect(readDuxCatalogControl(db.database)).resolves.toMatchObject({ snapshotCollectionEnabled: false, publicCatalogEnabled: true, publicCutoverEnabled: false });
      await updateDuxCatalogControl(db.database, 'operator', { publicCatalogEnabled: false });
      expect((await readPublicCatalog(db.database, env)).products).toEqual(local.products);
      expect(db.sqlite.prepare('SELECT COUNT(*) AS count FROM dux_catalog_snapshots_v2').get()?.count).toBe(1);
      await snapshot(db, 100);
      await expect(updateDuxCatalogControl(db.database, 'operator', { publicCutoverEnabled: true })).rejects.toMatchObject({ code: 'DUX_ORDER_LIFECYCLE_UNAVAILABLE' });
      expect(() => db.sqlite.exec('UPDATE dux_catalog_control SET public_cutover_enabled=1')).toThrow('DUX_ORDER_LIFECYCLE_UNAVAILABLE');
      expect(db.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { db.close(); }
  });

  it('API exige sesión, origen, body exacto y confirmación; audita errores y éxito', async () => {
    const db = database();
    try {
      expect((await request(db, {}, {})).status).toBe(401);
      expect((await request(db, { snapshotCollectionEnabled: true }, actor, 'https://foreign.test')).status).toBe(403);
      expect((await request(db, { prices: [] })).status).toBe(400);
      expect((await request(db, { publicCatalogEnabled: true })).status).toBe(400);
      await snapshot(db);
      const response = await request(db, { publicCatalogEnabled: true, confirmation: 'ENABLE_DUX_PUBLIC_CATALOG' });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ control: { publicCatalogEnabled: true, publicCutoverEnabled: false } });
      await expect((await request(db)).json()).resolves.toMatchObject({ snapshot: { itemCount: 1, priceCounts: { usable: 0, missing_or_zero: 1 }, checkoutEligibleCount: 0 } });
      expect((await request(db, { publicCatalogEnabled: false })).status).toBe(200);
      const audits = db.sqlite.prepare("SELECT outcome_status FROM admin_audit WHERE action = 'admin.dux.catalog-control'").all();
      expect(audits).toContainEqual(expect.objectContaining({ outcome_status: 400 }));
      expect(audits).toContainEqual(expect.objectContaining({ outcome_status: 200 }));
    } finally { db.close(); }
  });

  it('con snapshot corrupto conserva el control administrativo y permite rollback', async () => {
    const db = database();
    try {
      await snapshot(db);
      await updateDuxCatalogControl(db.database, 'operator', { publicCatalogEnabled: true });
      db.sqlite.exec("UPDATE dux_catalog_snapshots_v2 SET catalog_version = '" + '0'.repeat(64) + "'");
      const status = await request(db);
      expect(status.status).toBe(200);
      await expect(status.json()).resolves.toMatchObject({ control: { publicCatalogEnabled: true }, snapshot: null, snapshotError: 'DUX_CATALOG_SNAPSHOT_INVALID' });
      expect((await request(db, { snapshotCollectionEnabled: false })).status).toBe(200);
      await expect(readDuxCatalogControl(db.database)).resolves.toMatchObject({ snapshotCollectionEnabled: false, publicCatalogEnabled: true });
      expect((await request(db, { publicCatalogEnabled: false })).status).toBe(200);
      expect(await readPublicCatalog(db.database, env)).toMatchObject({source:'dux',products:[]});
    } finally { db.close(); }
  });
});
