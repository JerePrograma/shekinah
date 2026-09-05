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
  projectDuxRuntimeCatalog,
  readDuxCatalogSnapshot,
} from './dux-catalog';
import {
  readDuxCatalogControl,
  requireExpectedDuxCompany,
} from './dux-catalog-control';
import {
  applyDuxEditorialLinks,
  listActiveDuxEditorialLinks,
} from './dux-editorial-links';
import { listDuxInventoryUnits } from './dux-inventory';
import type { D1Database, Env } from './platform';

export type PublicCatalog = Readonly<{
  products: readonly Product[];
  productDetails: readonly CatalogProductDetail[];
  categories: readonly CatalogCategory[];
  source: 'dux' | 'legacy-bootstrap';
}>;

/**
 * El catálogo local continúa siendo el runtime público hasta que el control
 * persistido habilita explícitamente el cutover. Tener 0015 aplicado o disponer
 * de un snapshot nunca activa Dux por sí solo.
 */
export async function readPublicCatalog(
  database: D1Database,
  env: Env,
): Promise<PublicCatalog> {
  const control = await readDuxCatalogControl(database);
  if (!control.publicCutoverEnabled) {
    const productDetails = await listRuntimeCatalogProductDetails(database, env);
    return Object.freeze({
      products: Object.freeze(productDetails.map(toProductSummary)),
      productDetails,
      categories: buildCategories(productDetails),
      source: 'legacy-bootstrap' as const,
    });
  }

  requireExpectedDuxCompany(env);
  const snapshot = await readDuxCatalogSnapshot(database);
  let localProducts: readonly CatalogProductDetail[];
  try {
    localProducts = await listCatalogProductDetails(database);
  } catch {
    console.warn('dux_catalog_local_enrichment_unavailable', { version: 2 });
    localProducts = Object.freeze([]);
  }
  const [inventoryUnits, editorialLinks] = await Promise.all([
    listDuxInventoryUnits(database, env),
    listActiveDuxEditorialLinks(database),
  ]);
  const duxRuntime = projectDuxRuntimeCatalog(
    snapshot,
    Object.freeze([]),
    inventoryUnits,
  );
  const productDetails = applyDuxEditorialLinks(
    duxRuntime.products,
    localProducts,
    editorialLinks,
  );
  return Object.freeze({
    products: Object.freeze(productDetails.map(toProductSummary)),
    productDetails,
    categories: duxRuntime.categories,
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
