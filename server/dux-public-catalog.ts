import type { CatalogCategory, CatalogProductDetail, Product } from '../src/catalog/model';
import { toProductSummary } from './catalog-store';
import { projectDuxRuntimeCatalog, projectDuxRuntimeProduct, readDuxCatalogSnapshot } from './dux-catalog';
import { readDuxCatalogControl, requireExpectedDuxCompany } from './dux-catalog-control';
import { listDuxInventoryUnits, listDuxInventoryUnitsForItem } from './dux-inventory';
import { applyPreservedDuxEditorial } from './manual-catalog-retirement';
import { applyMercadoLibreEditorial } from './mercado-libre-editorial-public';
import { readDuxSnapshotMaxAgeSeconds } from './config';
import { applyDuxProductWebSettings } from './dux-product-web-settings';
import type { D1Database, Env } from './platform';

export type PublicCatalog = Readonly<{
  products: readonly Product[]; productDetails: readonly CatalogProductDetail[];
  categories: readonly CatalogCategory[]; source: 'dux';
}>;

/** Recovery and publication flags never reintroduce the retired catalog. */
export async function readPublicCatalog(database: D1Database, env: Env): Promise<PublicCatalog> {
  const control = await readDuxCatalogControl(database);
  if (!control.publicCatalogEnabled) return Object.freeze({ products: [], productDetails: [], categories: [], source: 'dux' });
  const catalog = await readDuxCatalog(database, env);
  const productDetails = Object.freeze(catalog.productDetails.filter(product => product.publicationStatus !== 'unpublished'));
  const categories = Object.freeze(catalog.categories.map(category => ({ ...category,
    productCount: productDetails.filter(product => product.categorySlugs.includes(category.slug)).length,
  })).filter(category => category.productCount > 0));
  return Object.freeze({ ...catalog, productDetails, products: Object.freeze(productDetails.map(toProductSummary)), categories });
}

export async function readDuxCatalog(database: D1Database, env: Env): Promise<PublicCatalog> {
  requireExpectedDuxCompany(env);
  const snapshot = await readDuxCatalogSnapshot(database);
  // Modern snapshots contain the exact warehouse observations of their own completed run.
  // Avoid reparsing a second full inventory generation, which can exceed Workers Free CPU
  // and can race with a newer inventory publication. Old Dux snapshots retain compatibility.
  const inventory = snapshot.items.every(item => item.warehouseStocks !== undefined)
    ? [] : await listDuxInventoryUnits(database, env);
  const runtime = projectDuxRuntimeCatalog(snapshot, [], inventory, readDuxSnapshotMaxAgeSeconds(env));
  const productDetails = await applyDuxProductWebSettings(database,
    await applyMercadoLibreEditorial(database, env, await applyPreservedDuxEditorial(database, runtime.products)));
  return Object.freeze({ products: Object.freeze(productDetails.map(toProductSummary)),
    productDetails, categories: runtime.categories, source: 'dux' });
}

export async function getPublicCatalogProductDetail(database: D1Database, env: Env, productId: string): Promise<CatalogProductDetail | null> {
  if (!(await readDuxCatalogControl(database)).publicCatalogEnabled) return null;
  const product = await getAdminDuxProductDetail(database, env, productId);
  return product?.publicationStatus === 'unpublished' ? null : product;
}

export async function getAdminDuxProductDetail(database: D1Database, env: Env, productId: string): Promise<CatalogProductDetail | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,179}$/u.test(productId)) return null;
  requireExpectedDuxCompany(env);
  const snapshot = await readDuxCatalogSnapshot(database);
  const item = snapshot.items.find(candidate => candidate.slug === productId);
  if (item === undefined) return null;
  const inventory = item.warehouseStocks === undefined ? await listDuxInventoryUnitsForItem(database, env, item.code) : [];
  const product = projectDuxRuntimeProduct(snapshot, productId, inventory, readDuxSnapshotMaxAgeSeconds(env));
  return product === null ? null : (await applyDuxProductWebSettings(database,
    await applyMercadoLibreEditorial(database, env, await applyPreservedDuxEditorial(database, [product]))))[0] ?? null;
}
