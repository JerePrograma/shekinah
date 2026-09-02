import type {
  CatalogCategory,
  CatalogProductDetail,
  Product,
} from '../src/catalog/model';
import {
  listCatalogProductDetails,
  listRuntimeCatalogProductDetails,
  toProductSummary,
} from './catalog-store';
import {
  isDuxCatalogBootstrapPendingError,
  projectDuxRuntimeCatalog,
  readDuxCatalogSnapshot,
} from './dux-catalog';
import { listDuxInventoryUnits } from './dux-inventory';
import type { D1Database, Env } from './platform';

export type PublicCatalog = Readonly<{
  products: readonly Product[];
  productDetails: readonly CatalogProductDetail[];
  categories: readonly CatalogCategory[];
  source: 'dux' | 'legacy-bootstrap';
}>;

/**
 * El servidor conserva el catálogo anterior únicamente durante la ventana de
 * despliegue en la que 0015 aún no existe o todavía no se publicó el primer
 * snapshot comercial Dux. Desde la primera publicación, cualquier producto
 * ausente en Dux desaparece del catálogo público y no existe fallback local.
 */
export async function readPublicCatalog(
  database: D1Database,
  env: Env,
): Promise<PublicCatalog> {
  let snapshot: Awaited<ReturnType<typeof readDuxCatalogSnapshot>>;
  try {
    snapshot = await readDuxCatalogSnapshot(database);
  } catch (error: unknown) {
    if (!isDuxCatalogBootstrapPendingError(error)) throw error;
    const productDetails = await listRuntimeCatalogProductDetails(database, env);
    return Object.freeze({
      products: Object.freeze(productDetails.map(toProductSummary)),
      productDetails,
      categories: buildCategories(productDetails),
      source: 'legacy-bootstrap' as const,
    });
  }

  let localProducts: readonly CatalogProductDetail[];
  try {
    localProducts = await listCatalogProductDetails(database);
  } catch {
    console.warn('dux_catalog_local_enrichment_unavailable', { version: 1 });
    localProducts = Object.freeze([]);
  }
  const inventoryUnits = await listDuxInventoryUnits(database, env);
  const runtime = projectDuxRuntimeCatalog(
    snapshot,
    localProducts,
    inventoryUnits,
  );
  return Object.freeze({
    products: Object.freeze(runtime.products.map(toProductSummary)),
    productDetails: runtime.products,
    categories: runtime.categories,
    source: 'dux' as const,
  });
}

export async function getPublicCatalogProductDetail(
  database: D1Database,
  env: Env,
  productId: string,
): Promise<CatalogProductDetail | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,179}$/u.test(productId)) return null;
  const catalog = await readPublicCatalog(database, env);
  return catalog.productDetails.find((product) => product.id === productId) ?? null;
}

function buildCategories(
  products: readonly CatalogProductDetail[],
): readonly CatalogCategory[] {
  const categories = new Map<string, { name: string; count: number }>();
  for (const product of products) {
    product.categorySlugs.forEach((slug, index) => {
      const name = product.categoryNames[index];
      if (name === undefined) return;
      const current = categories.get(slug);
      categories.set(slug, {
        name,
        count: (current?.count ?? 0) + 1,
      });
    });
  }
  return Object.freeze([...categories.entries()]
    .map(([slug, value]) => Object.freeze({
      slug,
      path: `/tienda/categoria/${slug}/`,
      name: value.name,
      productCount: value.count,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'es-AR', {
      sensitivity: 'base',
    })));
}
