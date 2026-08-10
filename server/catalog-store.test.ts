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
  updateCatalogProduct,
} from './catalog-store';
import type { CatalogProductDetail } from '../src/catalog/model';

const catalogMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0004_catalog_admin.sql'),
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
