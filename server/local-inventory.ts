import type { CatalogProductDetail, Product } from '../src/catalog/model';

export function hasConfiguredStock(
  product: Pick<Product, 'stockQuantity'>,
): boolean {
  return product.stockQuantity !== undefined;
}

export function projectCatalogProductForSale(product: Product): Product {
  if (hasConfiguredStock(product)) return product;
  return Object.freeze({
    ...product,
    availability: 'unavailable' as const,
  });
}

export function projectCatalogProductsForSale(
  products: readonly Product[],
): readonly Product[] {
  return Object.freeze(products.map(projectCatalogProductForSale));
}

export function projectCatalogProductDetailForSale(
  product: CatalogProductDetail,
): CatalogProductDetail {
  if (hasConfiguredStock(product)) return product;
  return Object.freeze({
    ...product,
    availability: 'unavailable' as const,
  });
}
