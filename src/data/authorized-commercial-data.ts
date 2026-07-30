import catalogIndexSource from 'virtual:shekinah-catalog-index';
import categorySource from '../catalog-data/categories.json';
import {
  parseCategories,
  parseProductDetail,
  parseProducts,
} from '../catalog/model';
import type { CatalogProductDetail } from '../catalog/model';

export const authorizedCategories = parseCategories(categorySource);
export const authorizedProducts = parseProducts(
  catalogIndexSource,
  authorizedCategories,
);

export const authorizedContact = null;

const productBySlug = new Map(
  authorizedProducts.map((product) => [product.slug, product]),
);
let detailSourcePromise: Promise<Record<string, unknown>> | undefined;

export function getAuthorizedProduct(slug: string) {
  return productBySlug.get(slug);
}

export async function loadAuthorizedProductDetail(
  slug: string,
): Promise<CatalogProductDetail | null> {
  const product = getAuthorizedProduct(slug);
  if (product === undefined) {
    return null;
  }

  detailSourcePromise ??= import('../catalog-data/catalog-details.json').then(
    ({ default: value }): Record<string, unknown> => value,
  );
  const details = await detailSourcePromise;
  if (!Object.hasOwn(details, slug)) {
    throw new Error(`Falta el detalle público del producto "${slug}".`);
  }

  return parseProductDetail(product, details[slug]);
}
