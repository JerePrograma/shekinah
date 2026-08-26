import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createTestD1 } from '../src/test/d1';
import {
  createCatalogProduct,
  deleteCatalogProduct,
  getBaseCatalogCategories,
  getBaseCatalogProductDetail,
  getCatalogProductDetail,
  listCatalogProductDetails,
  listCatalogProducts,
  listRuntimeCatalogProductDetails,
  patchCatalogProductInventory,
  replaceCatalogProductImages,
  updateCatalogProduct,
} from './catalog-store';
import type { CatalogProductDetail } from '../src/catalog/model';

const catalogMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0004_catalog_admin.sql'),
  'utf8',
);
const commerceMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0001_commerce.sql'),
  'utf8',
);
const duxMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0012_dux_authoritative_inventory.sql'),
  'utf8',
);
const actor = 'admin@example.test';

describe('catálogo efectivo persistido en D1', () => {
  it('lista los 510 productos base cuando no existen mutaciones', async () => {
    const testD1 = createTestD1(catalogMigration);
    try {
      await expect(listCatalogProductDetails(testD1.database)).resolves.toHaveLength(510);
    } finally {
      testD1.close();
    }
  });

  it('aplica override a un producto canónico sin cambiar su ID', async () => {
    const testD1 = createTestD1(catalogMigration);
    try {
      const base = requireBaseProduct('guayaba');
      const updated = await updateCatalogProduct(
        testD1.database,
        base.id,
        { ...base, name: 'Guayaba actualizada', price: { amount: 12_345.67, currency: 'ARS' } },
        actor,
      );
      expect(updated).toMatchObject({ id: base.id, name: 'Guayaba actualizada' });
      await expect(getCatalogProductDetail(testD1.database, base.id)).resolves.toMatchObject({
        name: 'Guayaba actualizada',
        price: { amount: 12_345.67 },
      });
    } finally {
      testD1.close();
    }
  });

  it('crea y lee un producto nuevo que no existe en el catálogo base', async () => {
    const testD1 = createTestD1(catalogMigration);
    try {
      const created = await createCatalogProduct(
        testD1.database,
        writableProduct('producto-dinamico'),
        actor,
      );
      expect(created.id).toBe('producto-dinamico');
      await expect(getCatalogProductDetail(testD1.database, created.id)).resolves.toEqual(created);
      await expect(listCatalogProductDetails(testD1.database)).resolves.toHaveLength(511);
    } finally {
      testD1.close();
    }
  });

  it('persiste un tombstone y retira el producto efectivo', async () => {
    const testD1 = createTestD1(catalogMigration);
    try {
      await deleteCatalogProduct(testD1.database, 'guayaba', actor);
      await expect(getCatalogProductDetail(testD1.database, 'guayaba')).resolves.toBeNull();
      expect(
        (await listCatalogProductDetails(testD1.database)).some(({ id }) => id === 'guayaba'),
      ).toBe(false);
      expect(testD1.sqlite.prepare(
        "SELECT deleted, payload_json FROM catalog_product_mutations WHERE product_id = 'guayaba'",
      ).get()).toEqual({ deleted: 1, payload_json: null });
    } finally {
      testD1.close();
    }
  });

  it('rechaza IDs duplicados e inmutables', async () => {
    const testD1 = createTestD1(catalogMigration);
    try {
      await expect(
        createCatalogProduct(testD1.database, requireBaseProduct('guayaba'), actor),
      ).rejects.toMatchObject({ code: 'PRODUCT_ALREADY_EXISTS', status: 409 });
      await expect(
        updateCatalogProduct(
          testD1.database,
          'guayaba',
          writableProduct('otro-id'),
          actor,
        ),
      ).rejects.toMatchObject({ code: 'PRODUCT_ID_IMMUTABLE', status: 400 });
    } finally {
      testD1.close();
    }
  });

  it('rechaza disponibilidad, variantes, categorías e imágenes inválidas', async () => {
    const testD1 = createTestD1(catalogMigration);
    try {
      await expect(createCatalogProduct(
        testD1.database,
        { ...writableProduct('estado-invalido'), availability: 'unknown' },
        actor,
      )).rejects.toMatchObject({ code: 'INVALID_PRODUCT' });
      await expect(createCatalogProduct(
        testD1.database,
        { ...writableProduct('variante-invalida'), variants: [{ available: true, options: [] }] },
        actor,
      )).rejects.toMatchObject({ code: 'INVALID_PRODUCT' });
      await expect(createCatalogProduct(
        testD1.database,
        {
          ...writableProduct('categoria-invalida'),
          categorySlugs: ['no-existe'],
          categoryNames: ['No existe'],
        },
        actor,
      )).rejects.toMatchObject({ code: 'INVALID_PRODUCT' });
      const imagePath = `/images/original/catalog/${'a'.repeat(64)}.webp`;
      await expect(createCatalogProduct(
        testD1.database,
        {
          ...writableProduct('imagen-invalida'),
          primaryImage: { src: imagePath, alt: 'No autorizada' },
          images: [{ src: imagePath, alt: 'No autorizada' }],
        },
        actor,
      )).rejects.toMatchObject({ code: 'INVALID_PRODUCT' });
    } finally {
      testD1.close();
    }
  });

  it('valida stock y permite desactivar el control con null en PATCH', async () => {
    const testD1 = createTestD1(catalogMigration);
    try {
      const tracked = await patchCatalogProductInventory(
        testD1.database,
        'guayaba',
        { availability: 'available', stockQuantity: 4 },
        actor,
      );
      expect(tracked.stockQuantity).toBe(4);
      expect((await getCatalogProductDetail(testD1.database, 'guayaba'))?.stockQuantity).toBe(4);
      expect((await listCatalogProducts(testD1.database)).find(({ id }) => id === 'guayaba'))
        .toMatchObject({ stockQuantity: 4 });

      const untracked = await patchCatalogProductInventory(
        testD1.database,
        'guayaba',
        { stockQuantity: null },
        actor,
      );
      expect(untracked.stockQuantity).toBeUndefined();
      await expect(patchCatalogProductInventory(
        testD1.database,
        'guayaba',
        { stockQuantity: -1 },
        actor,
      )).rejects.toMatchObject({ code: 'INVALID_PRODUCT' });
      await expect(patchCatalogProductInventory(
        testD1.database,
        'guayaba',
        { name: 'No permitido' },
        actor,
      )).rejects.toMatchObject({ code: 'INVALID_PRODUCT_PATCH' });
    } finally {
      testD1.close();
    }
  });

  it('preserva productos legacy sin categoría al editar, parchear o cambiar imágenes', async () => {
    const testD1 = createTestD1(catalogMigration);
    try {
      const id = 'miel-organica-cremosa-500gr-ecomaya';
      const base = requireBaseProduct(id);
      expect(base.categorySlugs).toEqual([]);

      const updated = await updateCatalogProduct(
        testD1.database,
        id,
        { ...base, name: `${base.name} actualizada` },
        actor,
      );
      expect(updated.categorySlugs).toEqual([]);
      const patched = await patchCatalogProductInventory(
        testD1.database,
        id,
        { stockQuantity: 2 },
        actor,
      );
      expect(patched.categorySlugs).toEqual([]);
      const replacement = await replaceCatalogProductImages(testD1.database, id, [], actor);
      expect(replacement.product.categorySlugs).toEqual([]);

      await expect(createCatalogProduct(
        testD1.database,
        { ...writableProduct('nuevo-sin-categoria'), categorySlugs: [], categoryNames: [] },
        actor,
      )).rejects.toMatchObject({ code: 'INVALID_PRODUCT' });
    } finally {
      testD1.close();
    }
  });

  it('reserva los cambios de imagen para la operación administrativa específica', async () => {
    const testD1 = createTestD1(catalogMigration);
    try {
      const image = {
        src: '/api/catalog-images/123e4567-e89b-42d3-a456-426614174000.png',
        alt: 'Imagen administrada',
      };
      await expect(createCatalogProduct(
        testD1.database,
        { ...writableProduct('imagen-administrada'), primaryImage: image, images: [image] },
        actor,
      )).rejects.toMatchObject({ code: 'PRODUCT_IMAGE_MUTATION_REQUIRES_UPLOAD' });

      await createCatalogProduct(testD1.database, writableProduct('imagen-administrada'), actor);
      const replaced = await replaceCatalogProductImages(
        testD1.database,
        'imagen-administrada',
        [image],
        actor,
      );
      expect(replaced.product.primaryImage).toEqual(image);

      const withoutImage: Record<string, unknown> = { ...replaced.product, images: [] };
      delete withoutImage.primaryImage;
      await expect(updateCatalogProduct(
        testD1.database,
        'imagen-administrada',
        withoutImage,
        actor,
      )).rejects.toMatchObject({ code: 'PRODUCT_IMAGE_MUTATION_REQUIRES_UPLOAD' });
    } finally {
      testD1.close();
    }
  });

  it('mantiene el fallback base y exige 0004 para cualquier escritura', async () => {
    const testD1 = createTestD1();
    try {
      await expect(listCatalogProductDetails(testD1.database)).resolves.toHaveLength(510);
      await expect(getCatalogProductDetail(testD1.database, 'guayaba')).resolves.toMatchObject({
        id: 'guayaba',
      });
      await expect(
        createCatalogProduct(testD1.database, writableProduct('sin-migracion'), actor),
      ).rejects.toMatchObject({ code: 'CATALOG_MIGRATION_REQUIRED', status: 503 });
      await expect(
        updateCatalogProduct(testD1.database, 'guayaba', requireBaseProduct('guayaba'), actor),
      ).rejects.toMatchObject({ code: 'CATALOG_MIGRATION_REQUIRED', status: 503 });
      await expect(
        deleteCatalogProduct(testD1.database, 'guayaba', actor),
      ).rejects.toMatchObject({ code: 'CATALOG_MIGRATION_REQUIRED', status: 503 });
    } finally {
      testD1.close();
    }
  });

  it('proyecta Dux sin redondear el stock y preserva los datos editoriales locales', async () => {
    const testD1 = createTestD1(commerceMigration, catalogMigration, duxMigration);
    try {
      const syncedAt = new Date().toISOString();
      await testD1.database.prepare(
        `INSERT INTO dux_inventory_items (
          inventory_key, cod_item, codigo_externo, item_name, local_product_id,
          mapping_status, mapping_source, mapping_candidates_json, deposit_id,
          deposit_name, stock_real, stock_reservado, stock_disponible,
          quantity_semantics_status, checkout_eligible, catalog_version,
          raw_snapshot_json, last_sync_status, last_synced_at, created_at, updated_at
        ) VALUES (
          ?1, 'DUX-GUAYABA', 'guayaba', 'Nombre editorial distinto', 'guayaba',
          'mapped', 'codigo_externo', '["guayaba"]', '3', 'Principal',
          738.5, 36.4, 702.1, 'unavailable_from_v2_items', 0, ?2,
          '{}', 'ok', ?3, ?3, ?3
        )`,
      ).bind('dux:v2:1:3:DUX-GUAYABA:base', 'a'.repeat(64), syncedAt).run();

      const projected = await listRuntimeCatalogProductDetails(testD1.database, {
        DUX_API_ENABLED: 'false',
        MERCADO_LIBRE_CATALOG_ENABLED: 'false',
        DUX_SNAPSHOT_MAX_AGE_SECONDS: '300',
      });
      const mapped = projected.find((product) => product.id === 'guayaba');
      expect(mapped).toMatchObject({
        name: requireBaseProduct('guayaba').name,
        availability: 'unavailable',
        commerce: {
          source: 'dux',
          mappingStatus: 'mapped',
          checkoutEligible: false,
          observedStock: { real: 738.5, reserved: 36.4, available: 702.1 },
          depositName: 'Principal',
        },
      });
      expect(mapped).not.toHaveProperty('stockQuantity');
      expect(projected.find((product) => product.id === 'aceite-de-chia-solazteca')).toMatchObject({
        commerce: { source: 'dux', mappingStatus: 'unmapped', checkoutEligible: false },
      });
    } finally {
      testD1.close();
    }
  });

  it('rechaza escritura manual de stock para un producto vinculado a Dux', async () => {
    const testD1 = createTestD1(commerceMigration, catalogMigration, duxMigration);
    try {
      const now = new Date().toISOString();
      await testD1.database.prepare(
        `INSERT INTO dux_inventory_items (
          inventory_key, cod_item, item_name, local_product_id, mapping_status,
          mapping_source, mapping_candidates_json, deposit_id, deposit_name,
          stock_real, stock_reservado, stock_disponible, quantity_semantics_status,
          checkout_eligible, catalog_version, raw_snapshot_json, last_sync_status,
          last_synced_at, created_at, updated_at
        ) VALUES (
          'dux:v2:1:3:DUX-GUAYABA:base', 'DUX-GUAYABA', 'Guayaba', 'guayaba',
          'mapped', 'manual', '["guayaba"]', '3', 'Principal', 2.44, 0, 2.44,
          'unavailable_from_v2_items', 0, ?1, '{}', 'ok', ?2, ?2, ?2
        )`,
      ).bind('b'.repeat(64), now).run();

      await expect(patchCatalogProductInventory(
        testD1.database,
        'guayaba',
        { stockQuantity: 10 },
        actor,
      )).rejects.toMatchObject({ code: 'DUX_INVENTORY_READ_ONLY', status: 409 });
      await expect(updateCatalogProduct(
        testD1.database,
        'guayaba',
        { ...requireBaseProduct('guayaba'), stockQuantity: 10 },
        actor,
      )).rejects.toMatchObject({ code: 'DUX_INVENTORY_READ_ONLY', status: 409 });
    } finally {
      testD1.close();
    }
  });

  it('prioriza la identidad Dux vigente y conserva la anterior ausente sólo como auditoría', async () => {
    const testD1 = createTestD1(commerceMigration, catalogMigration, duxMigration);
    try {
      const now = new Date().toISOString();
      await testD1.database.prepare(
        `INSERT INTO dux_inventory_items (
          inventory_key, cod_item, item_name, local_product_id, mapping_status,
          mapping_source, mapping_candidates_json, deposit_id, deposit_name,
          stock_real, stock_reservado, stock_disponible, quantity_semantics_status,
          checkout_eligible, catalog_version, raw_snapshot_json, last_sync_status,
          last_synced_at, absent_since, created_at, updated_at
        ) VALUES
          (
            'dux:v2:1:3:DUX-ANTERIOR:base', 'DUX-ANTERIOR', 'Guayaba anterior',
            'guayaba', 'mapped', 'persisted', '["guayaba"]', '3', 'Principal',
            99, 0, 99, 'unavailable_from_v2_items', 0, ?1, '{}', 'absent',
            ?3, ?3, ?3, ?3
          ),
          (
            'dux:v2:1:3:DUX-VIGENTE:base', 'DUX-VIGENTE', 'Guayaba vigente',
            'guayaba', 'mapped', 'codigo_externo', '["guayaba"]', '3', 'Principal',
            2.44, 0, 2.44, 'unavailable_from_v2_items', 0, ?2, '{}', 'ok',
            ?3, NULL, ?3, ?3
          )`,
      ).bind('c'.repeat(64), 'd'.repeat(64), now).run();

      const projected = await listRuntimeCatalogProductDetails(testD1.database, {
        DUX_SNAPSHOT_MAX_AGE_SECONDS: '300',
      });
      expect(projected.find((product) => product.id === 'guayaba')).toMatchObject({
        commerce: {
          source: 'dux',
          mappingStatus: 'mapped',
          observedStock: { available: 2.44 },
        },
      });
      await expect(testD1.database.prepare(
        "SELECT COUNT(*) AS count FROM dux_inventory_items WHERE last_sync_status = 'absent'",
      ).first()).resolves.toEqual({ count: 1 });
    } finally {
      testD1.close();
    }
  });

  it('falla cerrado si Mercado Libre intenta reactivarse como inventario directo', async () => {
    const testD1 = createTestD1(commerceMigration, catalogMigration, duxMigration);
    try {
      await expect(listRuntimeCatalogProductDetails(testD1.database, {
        MERCADO_LIBRE_CATALOG_ENABLED: 'true',
      })).rejects.toMatchObject({ code: 'MERCADO_LIBRE_INVENTORY_DISABLED', status: 503 });
    } finally {
      testD1.close();
    }
  });
});

export function writableProduct(id: string): CatalogProductDetail {
  const category = getBaseCatalogCategories()[0];
  if (category === undefined) throw new Error('No existe una categoría canónica para pruebas.');
  return Object.freeze({
    id,
    slug: id,
    path: `/${id}/`,
    name: `Producto ${id}`,
    categorySlugs: Object.freeze([category.slug]),
    categoryNames: Object.freeze([category.name]),
    presentation: '100 g',
    price: Object.freeze({ amount: 1_000, currency: 'ARS' }),
    sku: `SKU-${id}`,
    availability: 'available',
    shortDescription: 'Descripción breve',
    description: 'Descripción completa',
    images: Object.freeze([]),
    variants: Object.freeze([]),
  });
}

function requireBaseProduct(id: string): CatalogProductDetail {
  const product = getBaseCatalogProductDetail(id);
  if (product === null) throw new Error(`No existe el producto base ${id}.`);
  return product;
}
