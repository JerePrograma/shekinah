import type { CatalogProductDetail, Product } from '../src/catalog/model';
import {
  hasConfiguredStock,
  projectCatalogProductDetailForSale,
  projectCatalogProductForSale,
  projectCatalogProductsForSale,
} from './local-inventory';

const productWithoutStock: Product = Object.freeze({
  id: 'producto-sin-stock',
  slug: 'producto-sin-stock',
  path: '/producto-sin-stock/',
  name: 'Producto sin stock',
  categorySlugs: Object.freeze(['hierbas']),
  categoryNames: Object.freeze(['Hierbas']),
  price: Object.freeze({ amount: 1_000, currency: 'ARS' }),
  availability: 'available',
});

describe('proyección pública de inventario local', () => {
  it('mantiene visible pero no vendible un producto sin stock configurado', () => {
    const projected = projectCatalogProductForSale(productWithoutStock);

    expect(hasConfiguredStock(productWithoutStock)).toBe(false);
    expect(projected).toMatchObject({
      id: productWithoutStock.id,
      availability: 'unavailable',
    });
    expect(projected.stockQuantity).toBeUndefined();
    expect(productWithoutStock.availability).toBe('available');
  });

  it('preserva stock cero y positivo para que la disponibilidad efectiva use la cantidad real', () => {
    const depleted = Object.freeze({ ...productWithoutStock, stockQuantity: 0 });
    const available = Object.freeze({ ...productWithoutStock, stockQuantity: 3 });

    expect(projectCatalogProductForSale(depleted)).toBe(depleted);
    expect(projectCatalogProductForSale(available)).toBe(available);
    expect(projectCatalogProductsForSale([depleted, available])).toEqual([
      depleted,
      available,
    ]);
  });

  it('conserva el detalle administrativo al cerrar la venta pública', () => {
    const detail: CatalogProductDetail = Object.freeze({
      ...productWithoutStock,
      description: 'Detalle operativo',
      images: Object.freeze([]),
      variants: Object.freeze([]),
    });

    expect(projectCatalogProductDetailForSale(detail)).toEqual({
      ...detail,
      availability: 'unavailable',
    });
    expect(projectCatalogProductDetailForSale(detail).description).toBe('Detalle operativo');
  });
});
