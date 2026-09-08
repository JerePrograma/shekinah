import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseProductDetail, parseProduct, type CatalogProductDetail } from '../src/catalog/model';
import { createTestD1 } from '../src/test/d1';
import {
  DUX_PUBLIC_PRICE_LIST_NAME,
  parseDuxCatalogSourceItems,
  persistDuxCatalogSnapshot,
  projectDuxRuntimeCatalog,
  projectDuxRuntimeProduct,
  readDuxCatalogSnapshot,
} from './dux-catalog';
import type { DuxInventoryUnit } from './dux-inventory';
import { updateDuxCatalogControl } from './dux-catalog-control';
import { readPublicCatalog } from './dux-public-catalog';

const commerceMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0001_commerce.sql'),
  'utf8',
);
const catalogMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0004_catalog_admin.sql'),
  'utf8',
);
const inventoryMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0012_dux_authoritative_inventory.sql'),
  'utf8',
);
const duxCatalogMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0015_dux_catalog_snapshot.sql'),
  'utf8',
);
const duxEditorialMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0016_dux_editorial_links_and_cutover.sql'),
  'utf8',
);
const duxCompleteMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0017_dux_complete_public_catalog.sql'),
  'utf8',
);

const runId = 'dux_sync_catalog_test';
const syncedAt = '2026-09-02T20:00:00.000Z';

describe('catálogo público autoritativo de Dux', () => {
  it('usa el depósito del snapshot completo y su fecha sin mezclar otra generación de inventario', async () => {
    const testD1 = completeTestDatabase();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(syncedAt) + 900_000);
    try {
      insertCompletedRun(testD1, runId);
      await updateDuxCatalogControl(testD1.database, 'test', { snapshotCollectionEnabled: true });
      const stocks = [{depositId:25566,depositName:'Depósito Dux',variantId:null,barcode:null,color:null,size:null,real:1.25,reserved:2,available:-0.75}];
      await persistDuxCatalogSnapshot(testD1.database, runId, sourceCatalog().map(item => ({...item,warehouseStocks:stocks})), syncedAt);
      await updateDuxCatalogControl(testD1.database, 'test', { publicCatalogEnabled: true });
      const prepare = vi.spyOn(testD1.database, 'prepare');
      const catalog = await readPublicCatalog(testD1.database, {DUX_COMPANY_ID:'12862',DUX_SNAPSHOT_MAX_AGE_SECONDS:'900'});
      expect(prepare.mock.calls.some(([query]) => query.includes('FROM dux_inventory_items'))).toBe(false);
      const product = catalog.productDetails[0]!;
      expect(product.commerce).toMatchObject({stockSyncedAt:syncedAt,observedStock:{real:1.25,reserved:2,available:-0.75},availabilityState:'out_of_stock',checkoutEligible:false});
      clock.mockReturnValue(Date.parse(syncedAt) + 900_001);
      const stale = await readPublicCatalog(testD1.database, {DUX_COMPANY_ID:'12862',DUX_SNAPSHOT_MAX_AGE_SECONDS:'900'});
      expect(stale.productDetails[0]!.commerce).toMatchObject({stockSyncedAt:syncedAt,availabilityState:'updating',observedStock:{real:1.25,reserved:2,available:-0.75}});
    } finally { clock.mockRestore(); testD1.close(); }
  });

  it('reutiliza sólo el payload idéntico y lee nuevamente publicación, frescura y estado del run', async () => {
    const testD1 = completeTestDatabase();
    try {
      insertCompletedRun(testD1, runId);
      await updateDuxCatalogControl(testD1.database, 'test', { snapshotCollectionEnabled: true });
      await persistDuxCatalogSnapshot(testD1.database, runId, sourceCatalog(), syncedAt);
      const first = await readDuxCatalogSnapshot(testD1.database);
      const nextRun = 'dux_sync_catalog_next';
      const nextTime = '2026-09-02T20:10:00.000Z';
      insertCompletedRun(testD1, nextRun);
      await persistDuxCatalogSnapshot(testD1.database, nextRun, sourceCatalog(), nextTime);
      const unchanged = await readDuxCatalogSnapshot(testD1.database);
      expect(unchanged.items).toBe(first.items);
      expect(unchanged).toMatchObject({ inventoryRunId: nextRun, syncedAt: nextTime });
      expect(Object.isFrozen(unchanged.items)).toBe(true);
      expect(Object.isFrozen(unchanged.items[0]?.categories)).toBe(true);
      const changed = sourceCatalog().map((item) => ({ ...item, name: `${item.name} ACTUALIZADO` }));
      await persistDuxCatalogSnapshot(testD1.database, nextRun, changed, nextTime);
      const updated = await readDuxCatalogSnapshot(testD1.database);
      expect(updated.catalogVersion).not.toBe(first.catalogVersion);
      expect(updated.items[0]?.name).toBe('HIERBA DESDE DUX ACTUALIZADO');
      expect(updated.items[0]?.slug).toBe(first.items[0]?.slug);
      testD1.sqlite.prepare("UPDATE dux_sync_runs SET status = 'failed' WHERE id = ?").run(nextRun);
      await expect(readDuxCatalogSnapshot(testD1.database)).rejects.toMatchObject({ code: 'DUX_CATALOG_SNAPSHOT_INVALID' });
      testD1.sqlite.prepare('DELETE FROM dux_catalog_snapshots_v2').run();
      await expect(readDuxCatalogSnapshot(testD1.database)).rejects.toMatchObject({ code: 'DUX_CATALOG_SNAPSHOT_UNAVAILABLE' });
    } finally { testD1.close(); }
  });

  it('rechaza un digest alterado aunque el JSON coincida con el payload previamente validado', async () => {
    const testD1 = completeTestDatabase();
    try {
      insertCompletedRun(testD1, runId);
      await updateDuxCatalogControl(testD1.database, 'test', { snapshotCollectionEnabled: true });
      await persistDuxCatalogSnapshot(testD1.database, runId, sourceCatalog(), syncedAt);
      const first = await readDuxCatalogSnapshot(testD1.database);
      testD1.sqlite.prepare('UPDATE dux_catalog_snapshots_v2 SET catalog_version = ? WHERE id = 1')
        .run('f'.repeat(64));
      await expect(readDuxCatalogSnapshot(testD1.database)).rejects.toMatchObject({ code: 'DUX_CATALOG_SNAPSHOT_INVALID' });
      testD1.sqlite.prepare('UPDATE dux_catalog_snapshots_v2 SET catalog_version = ? WHERE id = 1')
        .run(first.catalogVersion);
      expect(await readDuxCatalogSnapshot(testD1.database)).toEqual(first);
    } finally { testD1.close(); }
  });

  it('conserva el orden español y los empates de nombres y categorías al reutilizar la colación', async () => {
    const testD1 = completeTestDatabase();
    try {
      insertCompletedRun(testD1, runId);
      await updateDuxCatalogControl(testD1.database, 'test', { snapshotCollectionEnabled: true });
      const names = ['Zanahoria', 'Ñandú', 'naranja', 'Árbol', 'arbol', 'Ajo'];
      const source = parseDuxCatalogSourceItems({ datos: names.map((name, index) => ({
        cod_item: String(index), item: name, habilitado: true, precios: businessPrices(3500),
        rubro: { id: index + 1, nombre: name },
      })) });
      await persistDuxCatalogSnapshot(testD1.database, runId, source, syncedAt);
      const snapshot = await readDuxCatalogSnapshot(testD1.database);
      const runtime = projectDuxRuntimeCatalog(snapshot, [], []);
      const expected = ['Ajo', 'Árbol', 'arbol', 'naranja', 'Ñandú', 'Zanahoria'];
      expect(runtime.products.map((product) => product.name)).toEqual(expected);
      expect(runtime.categories.map((category) => category.name)).toEqual(expected);
      expect(snapshot.items.map((item) => item.name)).toEqual(names);
      expect(runtime.products.every((product) => product.commerce?.checkoutEligible === false)).toBe(true);
    } finally { testD1.close(); }
  });

  it('distingue el mismo ID de subrubro dentro de rubros distintos sin cambiar nombres Dux', async () => {
    const testD1 = completeTestDatabase();
    try {
      insertCompletedRun(testD1, runId);
      await updateDuxCatalogControl(testD1.database, 'test', { snapshotCollectionEnabled: true });
      const sources = sourceCatalog().map((item, index) => ({
        ...item,
        category: { id: index === 0 ? 10 : 20, name: index === 0 ? 'Frutos secos' : 'Envasados' },
        subcategory: { id: 4, name: index === 0 ? 'Elaboración propia' : 'Agroecológico' },
      }));
      const first = await persistDuxCatalogSnapshot(testD1.database, runId, sources, syncedAt);
      const snapshot = await readDuxCatalogSnapshot(testD1.database);
      expect(snapshot.items.map((item) => item.categories)).toEqual([
        [{ slug: 'dux-rubro-10', name: 'Frutos secos' }, { slug: 'dux-rubro-10-subrubro-4', name: 'Elaboración propia' }],
        [{ slug: 'dux-rubro-20', name: 'Envasados' }, { slug: 'dux-rubro-20-subrubro-4', name: 'Agroecológico' }],
      ]);
      const runtime = projectDuxRuntimeCatalog(snapshot, [], []);
      expect(runtime.categories).toHaveLength(4);
      expect(runtime.products.every((product) => product.commerce?.checkoutEligible === false)).toBe(true);
      runtime.products.forEach((product) => parseProductDetail(parseProduct(product), product));
      const reordered = await persistDuxCatalogSnapshot(testD1.database, runId, [...sources].reverse(), syncedAt);
      expect(reordered.catalogVersion).toBe(first.catalogVersion);
    } finally { testD1.close(); }
  });

  it.each(['category', 'subcategory'] as const)('rechaza nombres contradictorios de %s en el mismo ámbito y conserva el snapshot', async (field) => {
    const testD1 = completeTestDatabase();
    try {
      insertCompletedRun(testD1, runId);
      await updateDuxCatalogControl(testD1.database, 'test', { snapshotCollectionEnabled: true });
      const first = await persistDuxCatalogSnapshot(testD1.database, runId, sourceCatalog(), syncedAt);
      const conflicting = sourceCatalog().map((item, index) => ({
        ...item, [field]: { id: 10, name: index === 0 ? 'Nombre uno' : 'Nombre incompatible' },
      }));
      await expect(persistDuxCatalogSnapshot(testD1.database, runId, conflicting, syncedAt))
        .rejects.toMatchObject({ code: 'DUX_CATALOG_CATEGORY_CONFLICT' });
      expect((await readDuxCatalogSnapshot(testD1.database)).catalogVersion).toBe(first.catalogVersion);
      expect(testD1.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally { testD1.close(); }
  });

  it('publica todos los ítems Dux sin enriquecer por mapping de inventario', async () => {
    const testD1 = createTestD1(
      commerceMigration,
      catalogMigration,
      inventoryMigration,
      duxCatalogMigration,
      duxEditorialMigration,
      duxCompleteMigration,
    );
    try {
      insertCompletedRun(testD1, runId);
      await updateDuxCatalogControl(testD1.database, 'test', { snapshotCollectionEnabled: true });
      const sourceItems = sourceCatalog();
      const summary = await persistDuxCatalogSnapshot(
        testD1.database,
        runId,
        sourceItems,
        syncedAt,
      );
      expect(summary).toMatchObject({
        inventoryRunId: runId,
        priceListName: DUX_PUBLIC_PRICE_LIST_NAME,
        itemCount: 2,
        syncedAt,
      });

      const snapshot = await readDuxCatalogSnapshot(testD1.database);
      const local = [localProduct('hierba-local'), localProduct('solo-local')];
      const projected = projectDuxRuntimeCatalog(
        snapshot,
        local,
        [inventoryUnit('A', 'hierba-local')],
      );

      expect(projected.products).toHaveLength(2);
      expect(projected.products.some(({ id }) => id === 'solo-local')).toBe(false);
      expect(projected.categories).toEqual([
        {
          slug: 'dux-rubro-10',
          path: '/tienda/categoria/dux-rubro-10/',
          name: 'Hierbas',
          productCount: 2,
        },
      ]);

      const mapped = projected.products.find(({ sku }) => sku === 'A');
      for (const product of projected.products) {
        expect(projectDuxRuntimeProduct(snapshot, product.id, [inventoryUnit('A', 'hierba-local')]))
          .toEqual(product);
      }
      expect(projectDuxRuntimeProduct(snapshot, 'solo-local', [])).toBeNull();
      expect(mapped).toMatchObject({
        name: 'HIERBA DESDE DUX',
        price: { amount: 1_250, currency: 'ARS' },
        sku: 'A',
        categorySlugs: ['dux-rubro-10'],
        availability: 'unavailable',
        commerce: {
          source: 'dux',
          mappingStatus: 'mapped',
          checkoutEligible: false,
          observedStock: { real: 5, reserved: 1, available: 4 },
          availabilityState: 'verified',
          stockSyncedAt: syncedAt,
        },
      });
      expect(mapped?.variants).toEqual([]);
      expect(mapped?.id).toMatch(/^dux-hierba-desde-dux-/u);
      expect(mapped?.images).toEqual([]);
      expect(mapped).not.toHaveProperty('description');
      expect(mapped).not.toHaveProperty('presentation');
      expect(mapped).not.toHaveProperty('shortDescription');

      const unquantified = projected.products.find(({ sku }) => sku === 'B');
      expect(unquantified?.id).toMatch(/^dux-segundo-producto-/u);
      expect(unquantified).toMatchObject({
        name: 'SEGUNDO PRODUCTO',
        price: { amount: 2_500, currency: 'ARS' },
        availability: 'unavailable',
        commerce: {
          source: 'dux',
          mappingStatus: 'unmapped',
          availabilityState: 'unavailable',
          checkoutEligible: false,
        },
      });
      expect(unquantified?.commerce).not.toHaveProperty('observedStock');
    } finally {
      testD1.close();
    }
  });

  it('mantiene vacío el catálogo oculto y publica únicamente Dux al habilitarlo', async () => {
    const testD1 = createTestD1(
      commerceMigration,
      catalogMigration,
      inventoryMigration,
      duxCatalogMigration,
      duxEditorialMigration,
      duxCompleteMigration,
    );
    try {
      insertCompletedRun(testD1, runId);
      await updateDuxCatalogControl(testD1.database, 'test', {
        snapshotCollectionEnabled: true,
      });
      await persistDuxCatalogSnapshot(
        testD1.database,
        runId,
        sourceCatalog(),
        syncedAt,
      );

      const beforeCutover = await readPublicCatalog(testD1.database, {
        DUX_COMPANY_ID: '12862',
        DUX_SNAPSHOT_MAX_AGE_SECONDS: '1800',
      });
      expect(beforeCutover.source).toBe('dux');
      expect(beforeCutover.products).toEqual([]);

      await updateDuxCatalogControl(testD1.database, 'test', {
        publicCatalogEnabled: true,
      });
      const publicCatalog = await readPublicCatalog(testD1.database, {
        DUX_COMPANY_ID: '12862',
        DUX_SNAPSHOT_MAX_AGE_SECONDS: '1800',
      });

      expect(publicCatalog.source).toBe('dux');
      expect(publicCatalog.products).toHaveLength(2);
      expect(publicCatalog.products.some(({ id }) => id === 'guayaba')).toBe(false);
      expect(publicCatalog.products.map(({ name }) => name)).toEqual([
        'HIERBA DESDE DUX',
        'SEGUNDO PRODUCTO',
      ]);
    } finally {
      testD1.close();
    }
  });

  it('una lista pública ausente publica el producto sin precio inventado', async () => {
    const testD1 = createTestD1(
      commerceMigration,
      inventoryMigration,
      duxCatalogMigration,
      duxEditorialMigration,
      duxCompleteMigration,
    );
    try {
      insertCompletedRun(testD1, runId);
      await updateDuxCatalogControl(testD1.database, 'test', { snapshotCollectionEnabled: true });
      await persistDuxCatalogSnapshot(
        testD1.database,
        runId,
        sourceCatalog(),
        syncedAt,
      );
      const invalid = parseDuxCatalogSourceItems({
        datos: [{
          cod_item: 'INVALIDO',
          item: 'SIN PRECIO PÚBLICO',
          habilitado: true,
          precios: [{ id: 2, nombre: 'MERCADO LIBRE', precio: 9_999 }],
          rubro: { id: 10, nombre: 'Hierbas' },
          sub_rubro: null,
          imagen_url: null,
        }],
      });

      await expect(persistDuxCatalogSnapshot(
        testD1.database,
        runId,
        invalid,
        syncedAt,
      )).resolves.toMatchObject({ itemCount: 1 });
      await expect(readDuxCatalogSnapshot(testD1.database)).resolves.toMatchObject({
        itemCount: 1,
        items: [{ code: 'INVALIDO', priceAmount: null, priceStatus: 'missing_or_zero' }],
      });
    } finally {
      testD1.close();
    }
  });

  it('clasifica cada precio actual, conserva cada identidad y verifica su contrato público', async () => {
    const cases: readonly Readonly<{ code: string; prices: unknown; status: string; amount: number | null }>[] = [
      { code: 'usable', prices: businessPrices(1234.56), status: 'usable', amount: 1234.56 },
      { code: 'usable-minimum', prices: businessPrices(2.01), status: 'usable', amount: 2.01 },
      { code: 'almost-placeholder', prices: businessPrices(2.000000001), status: 'invalid', amount: null },
      { code: 'almost-integer', prices: businessPrices(100.000000001), status: 'invalid', amount: null },
      { code: 'one', prices: businessPrices(1), status: 'placeholder', amount: null },
      { code: 'two', prices: businessPrices(2), status: 'placeholder', amount: null },
      { code: 'zero', prices: businessPrices(0), status: 'missing_or_zero', amount: null },
      { code: 'absent-list', prices: undefined, status: 'missing_or_zero', amount: null },
      { code: 'empty-list', prices: [], status: 'missing_or_zero', amount: null },
      { code: 'absent-value', prices: businessPrices(undefined), status: 'missing_or_zero', amount: null },
      { code: 'ml-only', prices: [{ id: 2, nombre: 'MERCADO LIBRE', precio: 9876 }], status: 'missing_or_zero', amount: null },
      { code: 'negative', prices: businessPrices(-5), status: 'invalid', amount: null },
      { code: 'string', prices: businessPrices('4500'), status: 'invalid', amount: null },
      { code: 'nan', prices: businessPrices(Number.NaN), status: 'invalid', amount: null },
      { code: 'infinity', prices: businessPrices(Number.POSITIVE_INFINITY), status: 'invalid', amount: null },
      { code: 'decimal', prices: businessPrices(300.123), status: 'invalid', amount: null },
      { code: 'tiny', prices: businessPrices(0.5), status: 'invalid', amount: null },
      { code: 'duplicate', prices: [...businessPrices(4000), ...businessPrices(5000)], status: 'invalid', amount: null },
      { code: 'malformed-list', prices: 'bad', status: 'invalid', amount: null },
      { code: 'malformed-entry', prices: [null], status: 'invalid', amount: null },
    ];
    const testD1 = completeTestDatabase();
    try {
      insertCompletedRun(testD1, runId);
      await updateDuxCatalogControl(testD1.database, 'test', { snapshotCollectionEnabled: true });
      await persistDuxCatalogSnapshot(testD1.database, runId, parseDuxCatalogSourceItems({
        datos: cases.map(({ code, prices }) => ({ cod_item: code, item: code, habilitado: true, precios: prices })),
      }), syncedAt);
      const snapshot = await readDuxCatalogSnapshot(testD1.database);
      expect(snapshot.itemCount).toBe(cases.length);
      expect(snapshot.priceCounts).toEqual({ usable: 2, placeholder: 2, missing_or_zero: 5, invalid: 11 });
      const projected = projectDuxRuntimeCatalog(snapshot, [localProduct('fallback-prohibido')], []);
      for (const expected of cases) {
        const item = snapshot.items.find(({ code }) => code === expected.code);
        expect(item).toMatchObject({ priceAmount: expected.amount, priceStatus: expected.status });
        const detail = projected.products.find(({ sku }) => sku === expected.code);
        if (detail === undefined) throw new Error('Falta la identidad Dux publicada.');
        expect(detail.price).toEqual(expected.amount === null ? null : { amount: expected.amount, currency: 'ARS' });
        expect(detail.priceStatus).toBe(expected.status);
        expect(detail.commerce?.checkoutEligible).toBe(false);
        expect(detail).not.toHaveProperty('salePrice');
        expect(parseProductDetail(parseProduct(detail), detail)).toEqual(detail);
      }
    } finally {
      testD1.close();
    }
  });

  it('rechaza identidad duplicada o vacía y conserva íntegra la publicación anterior', async () => {
    const testD1 = completeTestDatabase();
    try {
      insertCompletedRun(testD1, runId);
      await updateDuxCatalogControl(testD1.database, 'test', { snapshotCollectionEnabled: true });
      await persistDuxCatalogSnapshot(testD1.database, runId, sourceCatalog(), syncedAt);
      const previous = await readDuxCatalogSnapshot(testD1.database);
      await expect(persistDuxCatalogSnapshot(testD1.database, runId, [
        ...sourceCatalog(), ...sourceCatalog(),
      ], syncedAt)).rejects.toMatchObject({ code: 'DUX_CATALOG_DUPLICATE_ITEM' });
      expect(() => parseDuxCatalogSourceItems({ datos: [{ cod_item: '', item: 'Sin identidad', habilitado: true }] }))
        .toThrow(/respuesta no válida/u);
      expect(await readDuxCatalogSnapshot(testD1.database)).toEqual(previous);
      testD1.sqlite.prepare(`UPDATE dux_catalog_snapshots_v2
        SET payload_json = json_set(payload_json, '$.items[0].name', 'ALTERADO') WHERE id = 1`).run();
      await expect(readDuxCatalogSnapshot(testD1.database)).rejects.toMatchObject({ code: 'DUX_CATALOG_SNAPSHOT_INVALID' });
    } finally {
      testD1.close();
    }
  });

  it('publica nuevos Dux-only, retira ausentes/deshabilitados y oculta sin reconstruir productos locales', async () => {
    const testD1 = completeTestDatabase();
    const env = { DUX_COMPANY_ID: '12862' };
    try {
      insertCompletedRun(testD1, runId);
      const localBefore = await readPublicCatalog(testD1.database, env);
      await updateDuxCatalogControl(testD1.database, 'test', { snapshotCollectionEnabled: true });
      await persistDuxCatalogSnapshot(testD1.database, runId, sourceCatalog(), syncedAt);
      await updateDuxCatalogControl(testD1.database, 'test', { publicCatalogEnabled: true });
      await persistDuxCatalogSnapshot(testD1.database, runId, parseDuxCatalogSourceItems({ datos: [
        { cod_item: 'NUEVO', item: 'PRODUCTO NUEVO DUX', habilitado: true, precios: businessPrices(0) },
        { cod_item: 'B', item: 'DESHABILITADO', habilitado: false, precios: businessPrices(5000) },
      ] }), syncedAt);
      const dux = await readPublicCatalog(testD1.database, env);
      expect(dux.products).toHaveLength(1);
      expect(dux.products[0]).toMatchObject({ sku: 'NUEVO', price: null, priceStatus: 'missing_or_zero' });
      expect(dux.productDetails[0]?.images).toEqual([]);
      expect(dux.products[0]?.commerce?.checkoutEligible).toBe(false);
      await updateDuxCatalogControl(testD1.database, 'test', { publicCatalogEnabled: false });
      expect(await readPublicCatalog(testD1.database, env)).toEqual(localBefore);
      expect((await readDuxCatalogSnapshot(testD1.database)).itemCount).toBe(1);
      expect(testD1.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      testD1.close();
    }
  });
});

function businessPrices(amount: unknown) {
  return [{ id: 1, nombre: DUX_PUBLIC_PRICE_LIST_NAME, precio: amount }];
}

function completeTestDatabase() {
  return createTestD1(commerceMigration, catalogMigration, inventoryMigration, duxCatalogMigration, duxEditorialMigration, duxCompleteMigration);
}

function sourceCatalog() {
  return parseDuxCatalogSourceItems({
    datos: [
      {
        cod_item: 'A',
        item: 'HIERBA DESDE DUX',
        habilitado: true,
        ctd_unidades_por_bulto: 1,
        precios: [
          { id: 1, nombre: 'PRECIOS DEL NEGOCIO', precio: 1_250 },
          { id: 2, nombre: 'MERCADO LIBRE', precio: 1_999 },
        ],
        rubro: { id: 10, nombre: 'Hierbas' },
        sub_rubro: null,
        imagen_url: null,
      },
      {
        cod_item: 'B',
        item: 'SEGUNDO PRODUCTO',
        habilitado: true,
        ctd_unidades_por_bulto: 1,
        precios: [
          { id: 1, nombre: 'PRECIOS DEL NEGOCIO', precio: 2_500 },
          { id: 2, nombre: 'MERCADO LIBRE', precio: 3_000 },
        ],
        rubro: { id: 10, nombre: 'Hierbas' },
        sub_rubro: null,
        imagen_url: null,
      },
    ],
  });
}

function insertCompletedRun(
  testD1: ReturnType<typeof createTestD1>,
  id: string,
): void {
  testD1.sqlite.prepare(`INSERT OR IGNORE INTO dux_tenant_context VALUES
    (1, 'v2', '12862', 'Empresa de prueba', '1', 'Sucursal', '25566', 'Depósito', ?, ?)`)
    .run(syncedAt, syncedAt);
  testD1.sqlite.prepare(`INSERT INTO dux_sync_runs (
    id, kind, status, trigger_actor, processed_count, mapped_count,
    unmapped_count, ambiguous_count, absent_count, failed_count,
    started_at, completed_at, created_at, updated_at
  ) VALUES (?, 'manual', 'succeeded', 'test', 2, 1, 1, 0, 0, 0, ?, ?, ?, ?)`)
    .run(id, syncedAt, syncedAt, syncedAt, syncedAt);
}

function localProduct(id: string): CatalogProductDetail {
  const image = Object.freeze({
    src: `/images/original/catalog/${'a'.repeat(64)}.webp`,
    alt: 'Imagen local autorizada',
  });
  return Object.freeze({
    id,
    slug: id,
    path: `/${id}/`,
    name: `Nombre local ${id}`,
    categorySlugs: Object.freeze(['categoria-local']),
    categoryNames: Object.freeze(['Categoría local']),
    presentation: '100 g',
    price: Object.freeze({ amount: 999, currency: 'ARS' as const }),
    priceStatus: 'usable',
    shortDescription: 'Texto local breve.',
    description: 'Descripción local de respaldo.',
    primaryImage: image,
    images: Object.freeze([image]),
    variants: Object.freeze([]),
  });
}

function inventoryUnit(
  itemCode: string,
  localProductId: string,
): DuxInventoryUnit {
  return Object.freeze({
    inventoryKey: `dux:v2:1:3:${itemCode}:base`,
    itemCode,
    variantDetailId: null,
    externalCode: null,
    barcode: null,
    itemName: `Item ${itemCode}`,
    localProductId,
    mappingStatus: 'mapped',
    mappingSource: 'persisted',
    mappingCandidates: Object.freeze([localProductId]),
    depositId: '3',
    depositName: 'Principal',
    observedStock: Object.freeze({ real: 5, reserved: 1, available: 4 }),
    unitsPerPackage: 1,
    unit: null,
    isWeighable: null,
    allowsDecimal: null,
    commercialQuantityStep: null,
    quantitySemanticsStatus: 'unavailable_from_v2_items',
    checkoutEligible: false,
    catalogVersion: 'b'.repeat(64),
    lastSyncStatus: 'ok',
    lastSyncErrorCode: null,
    lastSyncedAt: syncedAt,
    absentSince: null,
    fresh: true,
  });
}
