import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTestD1 } from '../src/test/d1';
import { createCatalogProduct, getCatalogProductDetail, getCatalogProductDetailsForIds, isCatalogImageReferenced, listCatalogProductDetails, updateCatalogProduct } from './catalog-store';
import { parseDuxCatalogSourceItems, persistDuxCatalogSnapshot } from './dux-catalog';
import { updateDuxCatalogControl } from './dux-catalog-control';
import { getApprovedDuxEditorialManifest, importApprovedDuxEditorialLinks } from './dux-editorial-links';
import { getPublicCatalogProductDetail, readDuxCatalog, readPublicCatalog } from './dux-public-catalog';
import { isManualCatalogRetired } from './manual-catalog-retirement';
import { onRequest } from '../functions/api/admin/products';

const migrations = readdirSync(resolve('migrations')).filter((path) => path.endsWith('.sql')).sort()
  .map((path) => readFileSync(resolve('migrations', path), 'utf8'));
const env = { DUX_COMPANY_ID: '12862', PUBLIC_SITE_URL: 'https://example.test' };
const now = '2026-09-07T19:00:00.000Z';

async function fixture() {
  const db = createTestD1(...migrations);
  db.sqlite.prepare(`INSERT INTO dux_tenant_context VALUES (1,'v2','12862','Test','1','Branch','25566','Deposit',?,?)`).run(now, now);
  db.sqlite.prepare(`INSERT INTO dux_sync_runs (id,kind,status,trigger_actor,started_at,completed_at,created_at,updated_at)
    VALUES ('dux_sync_retirement','manual','succeeded','test',?,?,?,?)`).run(now, now, now, now);
  const locals = await listCatalogProductDetails(db.database);
  const links = getApprovedDuxEditorialManifest().links;
  await updateDuxCatalogControl(db.database, 'test', { snapshotCollectionEnabled: true });
  const items = parseDuxCatalogSourceItems({ datos: links.map((link) => ({
    cod_item: link.code, item: `Dux ${link.code}`, habilitado: true,
    precios: [{ id: 1, nombre: 'PRECIOS DEL NEGOCIO', precio: 1250 }],
    ctd_unidades_por_bulto: null, rubro: null, sub_rubro: null, imagen_url: null, descripcion: null,
  })) });
  await persistDuxCatalogSnapshot(db.database, 'dux_sync_retirement', items, now);
  await importApprovedDuxEditorialLinks(db.database, env, 'test', locals);
  await updateDuxCatalogControl(db.database, 'test', { publicCatalogEnabled: true });
  for (const link of links) {
    const local = locals.find((product) => product.id === link.localProductId);
    if (local === undefined) throw new Error('Missing fixture source');
    db.sqlite.prepare(`INSERT INTO dux_editorial_content
      SELECT company_id,cod_item,id,?,?,? FROM dux_editorial_links WHERE cod_item = ?`).run(
      JSON.stringify(link.reuseImages ? local.images : []), link.reuseDescription ? local.description ?? null : null, now, link.code);
  }
  return { db, locals, links };
}

function retire(db: ReturnType<typeof createTestD1>, count = 0, latest: string | null = null) {
  db.sqlite.prepare('INSERT INTO manual_catalog_retirement VALUES (1,?,?,510,135,?,?)')
    .run(now, 'a'.repeat(64), count, latest);
}

it('borra los registros manuales, conserva sólo contenido editorial y evita su reaparición', async () => {
  const { db, locals } = await fixture();
  try {
    const local = locals[0]!;
    await updateCatalogProduct(db.database, local.id, { ...local, name: 'Cambio manual previo' }, 'test');
    const before = await readPublicCatalog(db.database, env);
    const latest = db.sqlite.prepare('SELECT MAX(updated_at) value FROM catalog_product_mutations').get()?.value as string;
    retire(db, 1, latest);
    expect(db.sqlite.prepare('SELECT COUNT(*) n FROM catalog_product_mutations').get()?.n).toBe(0);
    expect(await isManualCatalogRetired(db.database)).toBe(true);
    expect(await listCatalogProductDetails(db.database)).toEqual([]);
    expect(await getCatalogProductDetail(db.database, local.id)).toBeNull();
    expect(await getCatalogProductDetailsForIds(db.database, locals.map((product) => product.id))).toEqual([]);
    await expect(createCatalogProduct(db.database, local, 'test')).rejects.toMatchObject({ code: 'MANUAL_CATALOG_RETIRED' });
    await expect(updateCatalogProduct(db.database, local.id, local, 'test')).rejects.toMatchObject({ code: 'MANUAL_CATALOG_RETIRED' });
    expect(() => db.sqlite.prepare(`INSERT INTO catalog_product_mutations VALUES ('manual','{}',0,'test',?,?)`).run(now, now)).toThrow('MANUAL_CATALOG_RETIRED');
    expect(() => db.sqlite.exec('DELETE FROM manual_catalog_retirement')).toThrow('MANUAL_CATALOG_RETIRED');
    expect(() => db.sqlite.exec("UPDATE manual_catalog_retirement SET retired_at = 'later'")).toThrow('MANUAL_CATALOG_RETIRED');
    const after = await readPublicCatalog(db.database, env);
    expect(after).toEqual(before);
    expect(after.products).toHaveLength(135);
    const withImage = after.productDetails.find((product) => product.images.length > 0)!;
    expect(await isCatalogImageReferenced(db.database, withImage.images[0]!.src)).toBe(true);
    expect(await getPublicCatalogProductDetail(db.database, env, withImage.id)).toEqual(withImage);
    await updateDuxCatalogControl(db.database, 'test', { publicCatalogEnabled: false });
    expect(await readPublicCatalog(db.database, env)).toEqual({ source: 'dux', products: [], productDetails: [], categories: [] });
    expect(await getPublicCatalogProductDetail(db.database, env, local.id)).toBeNull();
    expect((await readDuxCatalog(db.database, env)).products).toHaveLength(135);
    expect(db.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally { db.close(); }
});

it('rechaza el retiro si faltan fotos/descripciones migradas o cambió el catálogo manual', async () => {
  const { db, locals } = await fixture();
  try {
    db.sqlite.exec('DELETE FROM dux_editorial_content WHERE rowid = (SELECT MIN(rowid) FROM dux_editorial_content)');
    expect(() => retire(db)).toThrow('RETIREMENT_REQUIRES_PRESERVED_EDITORIAL');
    expect(await listCatalogProductDetails(db.database)).toHaveLength(510);
    expect(await isManualCatalogRetired(db.database)).toBe(false);
    expect(await getCatalogProductDetail(db.database, locals[0]!.id)).not.toBeNull();
  } finally { db.close(); }
  const second = await fixture();
  try {
    expect(() => retire(second.db, 1)).toThrow('RETIREMENT_MANUAL_CATALOG_CHANGED');
    expect(await isManualCatalogRetired(second.db.database)).toBe(false);
  } finally { second.db.close(); }
});

it('el administrador lista productos Dux aunque el catálogo público esté oculto', async () => {
  const { db } = await fixture();
  try {
    retire(db);
    await updateDuxCatalogControl(db.database, 'test', { publicCatalogEnabled: false });
    const response = await onRequest({ request: new Request('https://example.test/api/admin/products'),
      env: { ...env, DB: db.database }, data: { adminIdentity: { sub: 'test', actor: 'operator', authMethod: 'password' } },
      params: {}, next: () => Promise.resolve(new Response()), waitUntil: () => {} });
    expect(response.status).toBe(200);
    const payload = await response.json() as { products: { commerce: { source: string; checkoutEligible: boolean } }[]; manualCatalogRetired: boolean };
    expect(payload.manualCatalogRetired).toBe(true);
    expect(payload.products).toHaveLength(135);
    expect(payload.products.every((product) => product.commerce.source === 'dux' && !product.commerce.checkoutEligible)).toBe(true);
  } finally { db.close(); }
});
