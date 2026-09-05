import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CatalogProductDetail } from '../src/catalog/model';
import { createTestD1 } from '../src/test/d1';
import { listCatalogProductDetails } from './catalog-store';
import {
  parseDuxCatalogSourceItems,
  persistDuxCatalogSnapshot,
} from './dux-catalog';
import {
  readDuxCatalogControl,
  updateDuxCatalogControl,
} from './dux-catalog-control';
import {
  applyDuxEditorialLinks,
  DUX_EDITORIAL_SOURCE_MANIFEST_SHA256,
  getApprovedDuxEditorialManifest,
  importApprovedDuxEditorialLinks,
} from './dux-editorial-links';
import { readPublicCatalog } from './dux-public-catalog';

const commerceMigration = migration('0001_commerce.sql');
const catalogMigration = migration('0004_catalog_admin.sql');
const inventoryMigration = migration('0012_dux_authoritative_inventory.sql');
const duxCatalogMigration = migration('0015_dux_catalog_snapshot.sql');
const editorialMigration = migration('0016_dux_editorial_links_and_cutover.sql');
const companyEnv = Object.freeze({
  DUX_COMPANY_ID: '12862',
  DUX_SNAPSHOT_MAX_AGE_SECONDS: '1800',
});
const syncedAt = '2026-09-03T14:19:34.514Z';

describe('control y vínculos editoriales Dux', () => {
  it('versiona un manifiesto determinista de 135 vínculos 1:1', () => {
    const manifestPath = resolve(
      process.cwd(),
      'catalog',
      'internal',
      'dux-editorial-links-auto-import.json',
    );
    const source = readFileSync(manifestPath);
    expect(createHash('sha256').update(source).digest('hex'))
      .toBe(DUX_EDITORIAL_SOURCE_MANIFEST_SHA256);
    const manifest = getApprovedDuxEditorialManifest();
    expect(manifest.links).toHaveLength(135);
    expect(new Set(manifest.links.map(({ code }) => code)).size).toBe(135);
    expect(new Set(manifest.links.map(({ localProductId }) => localProductId)).size).toBe(135);
    expect(manifest.links.filter(({ reuseImages }) => reuseImages)).toHaveLength(134);
    expect(manifest.links.filter(({ reuseDescription }) => reuseDescription)).toHaveLength(127);
  });

  it('aplica 0016 con ambos flags cerrados', async () => {
    const testD1 = database();
    try {
      await expect(readDuxCatalogControl(testD1.database)).resolves.toEqual({
        migrationApplied: true,
        companyId: '12862',
        snapshotCollectionEnabled: false,
        publicCutoverEnabled: false,
      });
      expect(testD1.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      testD1.close();
    }
  });

  it('bloquea snapshot con collection=0 y lo permite con collection=1', async () => {
    const testD1 = database();
    try {
      insertCompletedRun(testD1, 'dux_sync_collection');
      await expect(persistDuxCatalogSnapshot(
        testD1.database,
        'dux_sync_collection',
        sourceCatalog(100),
        syncedAt,
      )).rejects.toThrow('DUX_CATALOG_SNAPSHOT_COLLECTION_DISABLED');
      expect(snapshotCount(testD1)).toBe(0);

      await updateDuxCatalogControl(testD1.database, 'test', {
        snapshotCollectionEnabled: true,
      });
      await expect(persistDuxCatalogSnapshot(
        testD1.database,
        'dux_sync_collection',
        sourceCatalog(100),
        syncedAt,
      )).resolves.toMatchObject({ itemCount: 1 });
      expect(snapshotCount(testD1)).toBe(1);
    } finally {
      testD1.close();
    }
  });

  it('bloquea cutover sin snapshot', async () => {
    const testD1 = database();
    try {
      await expect(updateDuxCatalogControl(testD1.database, 'test', {
        publicCutoverEnabled: true,
      })).rejects.toMatchObject({
        code: 'DUX_CATALOG_CUTOVER_REQUIRES_SNAPSHOT',
        status: 409,
      });
    } finally {
      testD1.close();
    }
  });

  it.each([0, 1, 2])('bloquea cutover con priceAmount=%s', async (priceAmount) => {
    const testD1 = database();
    try {
      insertCompletedRun(testD1, `dux_sync_price_${priceAmount}`);
      enableSnapshotCollection(testD1);
      insertRawSnapshot(testD1, `dux_sync_price_${priceAmount}`, priceAmount);
      await expect(updateDuxCatalogControl(testD1.database, 'test', {
        publicCutoverEnabled: true,
      })).rejects.toMatchObject({
        code: 'DUX_CATALOG_CUTOVER_PRICE_INVALID',
        status: 409,
      });
    } finally {
      testD1.close();
    }
  });

  it.each([
    ['ausente', {}],
    ['tipo inválido', { priceAmount: '4500' }],
  ])('bloquea cutover con precio %s', async (_label, priceFields) => {
    const testD1 = database();
    try {
      const runId = `dux_sync_price_shape_${String(_label).replace(/\s+/gu, '_')}`;
      insertCompletedRun(testD1, runId);
      enableSnapshotCollection(testD1);
      insertRawSnapshot(testD1, runId, 4_500, [{
        ...rawItem('A', 'PRODUCTO DUX A', 4_500),
        priceAmount: undefined,
        ...priceFields,
      }]);
      await expect(updateDuxCatalogControl(testD1.database, 'test', {
        publicCutoverEnabled: true,
      })).rejects.toMatchObject({
        code: 'DUX_CATALOG_CUTOVER_PRICE_INVALID',
        status: 409,
      });
    } finally {
      testD1.close();
    }
  });

  it('impone cardinalidad activa 1:1 y permite relink tras desactivar', () => {
    const testD1 = database();
    try {
      insertTestBatch(testD1);
      insertTestLink(testD1, 'A', 'local-a');
      expect(() => insertTestLink(testD1, 'A', 'local-b')).toThrow();
      expect(() => insertTestLink(testD1, 'B', 'local-a')).toThrow();
      testD1.sqlite.prepare(
        `UPDATE dux_editorial_links SET active = 0, updated_at = ?
         WHERE company_id = '12862' AND cod_item = 'A'`,
      ).run(syncedAt);
      expect(() => insertTestLink(testD1, 'B', 'local-a')).not.toThrow();
    } finally {
      testD1.close();
    }
  });

  it('importa exactamente los 135 vínculos y la segunda ejecución es idempotente', async () => {
    const testD1 = database();
    try {
      const localProducts = await listCatalogProductDetails(testD1.database);
      const first = await importApprovedDuxEditorialLinks(
        testD1.database,
        companyEnv,
        'test-admin',
        localProducts,
      );
      expect(first).toEqual({
        batchId: 'dux_editorial_auto_20260903_v1',
        expected: 135,
        created: 135,
        idempotent: false,
      });
      expect(editorialCounts(testD1)).toEqual({
        links: 135,
        codes: 135,
        locals: 135,
        images: 134,
        descriptions: 127,
      });
      expect(testD1.sqlite.prepare(
        `SELECT source_manifest_sha256, matching_source_sha256,
                base_matching_report_sha256, auto_confirmable_csv_sha256,
                analysis_commit, expected_link_count
         FROM dux_editorial_link_imports
         WHERE batch_id = 'dux_editorial_auto_20260903_v1'`,
      ).get()).toEqual({
        source_manifest_sha256: 'f4f62b5a2b976fd357c92eba3bb0ed13655028802c0f2a40b6b2901beadc8766',
        matching_source_sha256: 'bd418f6815ad4841967aaa667601ebe5380fc6af491968497a6a754931c169cb',
        base_matching_report_sha256: '788bd4d3506ea3d3c876f7966eb88ebdf6d90b88bfba9c77719b9091b5282f9a',
        auto_confirmable_csv_sha256: 'b68e4dc366546537a622c1834e3682bf9fe5186dfb2c5eab959536ccc145d3f0',
        analysis_commit: 'ce71f9d9a611b1038bd2e866b84645867db8c967',
        expected_link_count: 135,
      });

      const second = await importApprovedDuxEditorialLinks(
        testD1.database,
        companyEnv,
        'test-admin',
        localProducts,
      );
      expect(second).toEqual({
        batchId: 'dux_editorial_auto_20260903_v1',
        expected: 135,
        created: 0,
        idempotent: true,
      });
      expect(editorialCounts(testD1).links).toBe(135);
    } finally {
      testD1.close();
    }
  });

  it('falla cerrado si falta una ficha local requerida', async () => {
    const testD1 = database();
    try {
      const manifest = getApprovedDuxEditorialManifest();
      const localProducts = await listCatalogProductDetails(testD1.database);
      const missingId = manifest.links[0]?.localProductId;
      expect(missingId).toBeDefined();
      await expect(importApprovedDuxEditorialLinks(
        testD1.database,
        companyEnv,
        'test-admin',
        localProducts.filter(({ id }) => id !== missingId),
      )).rejects.toMatchObject({ code: 'DUX_EDITORIAL_LOCAL_PRODUCT_MISSING' });
    } finally {
      testD1.close();
    }
  });

  it('falla cerrado si reuseImages=true y la ficha no tiene imágenes', async () => {
    const testD1 = database();
    try {
      const manifest = getApprovedDuxEditorialManifest();
      const target = manifest.links.find(({ reuseImages }) => reuseImages);
      expect(target).toBeDefined();
      const localProducts = await listCatalogProductDetails(testD1.database);
      const mutated = localProducts.map((product) => product.id === target?.localProductId
        ? Object.freeze({ ...product, images: Object.freeze([]) })
        : product);
      await expect(importApprovedDuxEditorialLinks(
        testD1.database,
        companyEnv,
        'test-admin',
        mutated,
      )).rejects.toMatchObject({ code: 'DUX_EDITORIAL_IMAGE_MISSING' });
    } finally {
      testD1.close();
    }
  });

  it('falla cerrado si reuseDescription=true y falta descripción', async () => {
    const testD1 = database();
    try {
      const manifest = getApprovedDuxEditorialManifest();
      const target = manifest.links.find(({ reuseDescription }) => reuseDescription);
      expect(target).toBeDefined();
      const localProducts = await listCatalogProductDetails(testD1.database);
      const mutated = localProducts.map((product) => {
        if (product.id !== target?.localProductId) return product;
        return Object.freeze({ ...product, description: '' });
      });
      await expect(importApprovedDuxEditorialLinks(
        testD1.database,
        companyEnv,
        'test-admin',
        mutated,
      )).rejects.toMatchObject({ code: 'DUX_EDITORIAL_DESCRIPTION_MISSING' });
    } finally {
      testD1.close();
    }
  });

  it('sólo copia imagen y descripción; conserva identidad comercial Dux', () => {
    const local = localProduct('editorial-local');
    const dux = duxProduct('dux-producto-a', 'A');
    const [enriched] = applyDuxEditorialLinks(
      [dux],
      [local],
      [{
        code: 'A',
        localProductId: local.id,
        reuseImages: true,
        reuseDescription: true,
        decisionKind: 'confirmed_identity',
        decisionMethod: 'persisted_inventory_mapping',
        presentationRelation: 'same',
      }],
    );
    expect(enriched).toMatchObject({
      name: 'NOMBRE DUX',
      price: { amount: 4_500, currency: 'ARS' },
      sku: 'A',
      categorySlugs: ['dux-rubro-1'],
      categoryNames: ['Rubro Dux'],
      primaryImage: local.primaryImage,
      description: 'Descripción local autorizada.',
    });
    expect(enriched?.name).not.toBe(local.name);
    expect(enriched?.price).not.toEqual(local.price);
    expect(enriched?.sku).not.toBe(local.sku);
    expect(enriched?.categoryNames).not.toEqual(local.categoryNames);
  });

  it('cutover=0 conserva catálogo local aunque exista snapshot Dux', async () => {
    const testD1 = database();
    try {
      insertCompletedRun(testD1, 'dux_sync_local_runtime');
      enableSnapshotCollection(testD1);
      insertRawSnapshot(testD1, 'dux_sync_local_runtime', 4_500);
      const catalog = await readPublicCatalog(testD1.database, companyEnv);
      expect(catalog.source).toBe('legacy-bootstrap');
      expect(catalog.products.length).toBeGreaterThan(100);
      expect(catalog.products.some(({ id }) => id === 'adobo-pizza-gourmet')).toBe(true);
    } finally {
      testD1.close();
    }
  });

  it('cutover=1 publica sólo universo Dux y mantiene checkoutEligible=false', async () => {
    const testD1 = database();
    try {
      insertCompletedRun(testD1, 'dux_sync_dux_runtime');
      enableSnapshotCollection(testD1);
      insertRawSnapshot(testD1, 'dux_sync_dux_runtime', 4_500, [
        rawItem('A', 'PRODUCTO DUX A', 4_500),
        rawItem('B', 'PRODUCTO DUX B', 5_500),
      ]);
      await updateDuxCatalogControl(testD1.database, 'test', {
        publicCutoverEnabled: true,
      });
      const catalog = await readPublicCatalog(testD1.database, companyEnv);
      expect(catalog.source).toBe('dux');
      expect(catalog.products).toHaveLength(2);
      expect(catalog.products.map(({ sku }) => sku).sort()).toEqual(['A', 'B']);
      expect(catalog.products.some(({ id }) => id === 'adobo-pizza-gourmet')).toBe(false);
      expect(catalog.products.every(({ commerce }) =>
        commerce?.source === 'dux' && commerce.checkoutEligible === false,
      )).toBe(true);
    } finally {
      testD1.close();
    }
  });
});

function migration(name: string): string {
  return readFileSync(resolve(process.cwd(), 'migrations', name), 'utf8');
}

function database() {
  return createTestD1(
    commerceMigration,
    catalogMigration,
    inventoryMigration,
    duxCatalogMigration,
    editorialMigration,
  );
}

function sourceCatalog(price: number) {
  return parseDuxCatalogSourceItems({
    datos: [{
      cod_item: 'A',
      item: 'PRODUCTO DUX A',
      habilitado: true,
      ctd_unidades_por_bulto: 1,
      precios: [{ id: 1, nombre: 'PRECIOS DEL NEGOCIO', precio: price }],
      rubro: { id: 1, nombre: 'Rubro Dux' },
      sub_rubro: null,
      imagen_url: null,
      descripcion: null,
    }],
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
  ) VALUES (?, 'manual', 'succeeded', 'test', 2, 0, 2, 0, 0, 0, ?, ?, ?, ?)`)
    .run(id, syncedAt, syncedAt, syncedAt, syncedAt);
}

function enableSnapshotCollection(testD1: ReturnType<typeof createTestD1>): void {
  testD1.sqlite.prepare(
    `UPDATE dux_catalog_control
     SET snapshot_collection_enabled = 1, updated_at = ?
     WHERE company_id = '12862'`,
  ).run(syncedAt);
}

function insertRawSnapshot(
  testD1: ReturnType<typeof createTestD1>,
  runId: string,
  priceAmount: number,
  items: readonly Record<string, unknown>[] = [rawItem('A', 'PRODUCTO DUX A', priceAmount)],
): void {
  const payload = JSON.stringify({
    schemaVersion: 1,
    priceListName: 'PRECIOS DEL NEGOCIO',
    items,
  });
  testD1.sqlite.prepare(`INSERT INTO dux_catalog_snapshot (
    id, inventory_run_id, catalog_version, price_list_name, item_count,
    payload_json, synced_at, created_at, updated_at
  ) VALUES (1, ?, ?, 'PRECIOS DEL NEGOCIO', ?, ?, ?, ?, ?)`)
    .run(runId, 'a'.repeat(64), items.length, payload, syncedAt, syncedAt, syncedAt);
}

function rawItem(code: string, name: string, priceAmount: number) {
  return {
    slug: `dux-${code.toLowerCase()}-${code.toLowerCase()}`,
    code,
    name,
    priceAmount,
    categories: [{ slug: 'dux-rubro-1', name: 'Rubro Dux' }],
    unitsPerPackage: 1,
    imageUrl: null,
    description: null,
  };
}

function snapshotCount(testD1: ReturnType<typeof createTestD1>): number {
  return Number(testD1.sqlite.prepare('SELECT COUNT(*) AS count FROM dux_catalog_snapshot').get()?.count ?? 0);
}

function insertTestBatch(testD1: ReturnType<typeof createTestD1>): void {
  testD1.sqlite.prepare(`INSERT INTO dux_editorial_link_imports (
    batch_id, company_id, source_manifest_sha256, matching_source_sha256,
    base_matching_report_sha256, auto_confirmable_csv_sha256,
    analysis_commit, expected_link_count, actor, imported_at
  ) VALUES ('test-batch', '12862', ?, ?, ?, ?, ?, 1, 'test', ?)`)
    .run('a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64), 'e'.repeat(40), syncedAt);
}

function insertTestLink(
  testD1: ReturnType<typeof createTestD1>,
  code: string,
  localProductId: string,
): void {
  testD1.sqlite.prepare(`INSERT INTO dux_editorial_links (
    company_id, cod_item, local_product_id, reuse_images, reuse_description,
    decision_kind, decision_method, presentation_relation, batch_id,
    active, created_by, updated_by, created_at, updated_at
  ) VALUES ('12862', ?, ?, 1, 1, 'auto_full', 'exact_semantic_name',
            'same', 'test-batch', 1, 'test', 'test', ?, ?)`)
    .run(code, localProductId, syncedAt, syncedAt);
}

function editorialCounts(testD1: ReturnType<typeof createTestD1>) {
  const row = testD1.sqlite.prepare(`SELECT
      COUNT(*) AS links,
      COUNT(DISTINCT cod_item) AS codes,
      COUNT(DISTINCT local_product_id) AS locals,
      SUM(reuse_images) AS images,
      SUM(reuse_description) AS descriptions
    FROM dux_editorial_links
    WHERE company_id = '12862' AND active = 1`).get();
  return {
    links: Number(row?.links ?? 0),
    codes: Number(row?.codes ?? 0),
    locals: Number(row?.locals ?? 0),
    images: Number(row?.images ?? 0),
    descriptions: Number(row?.descriptions ?? 0),
  };
}

function localProduct(id: string): CatalogProductDetail {
  const image = Object.freeze({
    src: `/images/original/catalog/${'b'.repeat(64)}.webp`,
    alt: 'Imagen local autorizada',
  });
  return Object.freeze({
    id,
    slug: id,
    path: `/${id}/`,
    name: 'NOMBRE LOCAL',
    categorySlugs: Object.freeze(['local']),
    categoryNames: Object.freeze(['Categoría local']),
    price: Object.freeze({ amount: 999, currency: 'ARS' as const }),
    sku: 'LOCAL-SKU',
    description: 'Descripción local autorizada.',
    primaryImage: image,
    images: Object.freeze([image]),
    variants: Object.freeze([]),
  });
}

function duxProduct(id: string, sku: string): CatalogProductDetail {
  return Object.freeze({
    id,
    slug: id,
    path: `/${id}/`,
    name: 'NOMBRE DUX',
    categorySlugs: Object.freeze(['dux-rubro-1']),
    categoryNames: Object.freeze(['Rubro Dux']),
    price: Object.freeze({ amount: 4_500, currency: 'ARS' as const }),
    sku,
    images: Object.freeze([]),
    variants: Object.freeze([]),
    commerce: Object.freeze({
      source: 'dux' as const,
      catalogVersion: 'a'.repeat(64),
      syncedAt,
      availabilityState: 'unavailable' as const,
      checkoutEligible: false,
      mappingStatus: 'unmapped' as const,
      quantitySemanticsStatus: 'unavailable_from_v2_items' as const,
    }),
  });
}
