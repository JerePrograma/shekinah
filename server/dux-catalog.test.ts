import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CatalogProductDetail } from '../src/catalog/model';
import { createTestD1 } from '../src/test/d1';
import {
  DUX_PUBLIC_PRICE_LIST_NAME,
  parseDuxCatalogSourceItems,
  persistDuxCatalogSnapshot,
  projectDuxRuntimeCatalog,
  readDuxCatalogSnapshot,
} from './dux-catalog';
import type { DuxInventoryUnit } from './dux-inventory';
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

const runId = 'dux_sync_catalog_test';
const syncedAt = '2026-09-02T20:00:00.000Z';

describe('catálogo público autoritativo de Dux', () => {
  it('publica todos los ítems Dux y usa lo local sólo como enriquecimiento mapeado', async () => {
    const testD1 = createTestD1(
      commerceMigration,
      catalogMigration,
      inventoryMigration,
      duxCatalogMigration,
    );
    try {
      insertCompletedRun(testD1, runId);
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

      const mapped = projected.products.find(({ id }) => id === 'hierba-local');
      expect(mapped).toMatchObject({
        id: 'hierba-local',
        name: 'HIERBA DESDE DUX',
        price: { amount: 1_250, currency: 'ARS' },
        sku: 'A',
        categorySlugs: ['dux-rubro-10'],
        availability: 'unavailable',
        primaryImage: { alt: 'Imagen local autorizada' },
        description: 'Descripción local de respaldo.',
        commerce: {
          source: 'dux',
          mappingStatus: 'mapped',
          checkoutEligible: false,
          observedStock: { real: 5, reserved: 1, available: 4 },
        },
      });
      expect(mapped?.variants).toEqual([]);

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

  it('reemplaza el catálogo público local desde la primera fotografía Dux', async () => {
    const testD1 = createTestD1(
      commerceMigration,
      catalogMigration,
      inventoryMigration,
      duxCatalogMigration,
    );
    try {
      insertCompletedRun(testD1, runId);
      await persistDuxCatalogSnapshot(
        testD1.database,
        runId,
        sourceCatalog(),
        syncedAt,
      );

      const publicCatalog = await readPublicCatalog(testD1.database, {
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

  it('rechaza una lista pública ausente sin reemplazar la fotografía anterior', async () => {
    const testD1 = createTestD1(
      commerceMigration,
      inventoryMigration,
      duxCatalogMigration,
    );
    try {
      insertCompletedRun(testD1, runId);
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
      )).rejects.toMatchObject({
        code: 'DUX_CATALOG_PRICE_LIST_INVALID',
        status: 502,
      });
      await expect(readDuxCatalogSnapshot(testD1.database)).resolves.toMatchObject({
        itemCount: 2,
      });
    } finally {
      testD1.close();
    }
  });
});

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
