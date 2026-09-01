import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createTestD1 } from '../src/test/d1';
import { createCatalogProduct, deleteCatalogProduct, updateCatalogProduct } from './catalog-store';
import { recalculateDynamicCart } from './dynamic-cart';

const catalogMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0004_catalog_admin.sql'),
  'utf8',
);
const fulfillment = Object.freeze({
  method: 'coordinated_pickup',
  fullName: 'Ana Pérez',
  phone: '5491155554444',
  address: 'Calle 123',
  locality: 'CABA',
  province: 'Buenos Aires',
  postalCode: 'C1234ABC',
});

describe('carrito autoritativo con catálogo dinámico', () => {
  it('preserva el precio local pero bloquea productos sin vínculo autoritativo Dux', async () => {
    const testD1 = createTestD1(catalogMigration);
    try {
      const created = await createCatalogProduct(
        testD1.database,
        productInput('producto-checkout', 1_000),
        'admin@example.test',
      );
      await updateCatalogProduct(
        testD1.database,
        created.id,
        { ...created, price: { amount: 2_345.67, currency: 'ARS' } },
        'admin@example.test',
      );

      await expect(recalculateDynamicCart({
        idempotencyKey: crypto.randomUUID(),
        fulfillment,
        items: [{ productId: created.id, quantity: 2 }],
      }, testD1.database)).rejects.toMatchObject({
        code: 'PRODUCT_UNAVAILABLE',
        status: 409,
      });
    } finally {
      testD1.close();
    }
  });

  it('rechaza productos no disponibles y tombstones', async () => {
    const testD1 = createTestD1(catalogMigration);
    try {
      const created = await createCatalogProduct(
        testD1.database,
        productInput('producto-bloqueado', 1_000),
        'admin@example.test',
      );
      const request = {
        idempotencyKey: crypto.randomUUID(),
        fulfillment,
        items: [{ productId: created.id, quantity: 1 }],
      };
      await updateCatalogProduct(
        testD1.database,
        created.id,
        { ...created, availability: 'unavailable' },
        'admin@example.test',
      );
      await expect(recalculateDynamicCart(request, testD1.database)).rejects.toMatchObject({
        code: 'PRODUCT_UNAVAILABLE',
        status: 409,
      });

      await deleteCatalogProduct(testD1.database, created.id, 'admin@example.test');
      await expect(recalculateDynamicCart(request, testD1.database)).rejects.toMatchObject({
        code: 'PRODUCT_NOT_FOUND',
        status: 400,
      });
    } finally {
      testD1.close();
    }
  });

  it('no usa stock local configurado ni lo trata como fallback de Dux', async () => {
    const testD1 = createTestD1(catalogMigration);
    try {
      await expect(createCatalogProduct(
        testD1.database,
        { ...productInput('producto-con-stock', 1_000), stockQuantity: 2 },
        'admin@example.test',
      )).rejects.toMatchObject({ code: 'DUX_INVENTORY_READ_ONLY', status: 409 });

      const unconfigured = await createCatalogProduct(
        testD1.database,
        productInput('producto-sin-stock', 1_000),
        'admin@example.test',
      );
      await expect(recalculateDynamicCart({
        idempotencyKey: crypto.randomUUID(),
        fulfillment,
        items: [{ productId: unconfigured.id, quantity: 1 }],
      }, testD1.database)).rejects.toMatchObject({
        code: 'PRODUCT_UNAVAILABLE',
        status: 409,
      });
    } finally {
      testD1.close();
    }
  });
});

function productInput(id: string, amount: number): Record<string, unknown> {
  return {
    id,
    slug: id,
    path: `/${id}/`,
    name: `Producto ${id}`,
    categorySlugs: ['agroecologicos'],
    categoryNames: ['Agroecologicos'],
    presentation: '100 g',
    price: { amount, currency: 'ARS' },
    availability: 'available',
    images: [],
    variants: [],
  };
}
