import type { CatalogProductDetail } from '../src/catalog/model';
import { CATALOG_IMAGE_CACHE_CONTROL, managedImageStorageKey, readCatalogImageUpload, requireCatalogImageBucket } from './catalog-images';
import { isCatalogImageReferenced } from './catalog-store';
import { getAdminDuxProductDetail } from './dux-public-catalog';
import { isDuxWebImageReferenced, writeDuxProductWebSettings, type DuxProductWebPatch } from './dux-product-web-settings';
import { HttpError } from './http';
import type { D1Database, Env } from './platform';

export async function patchAdminDuxProduct(database: D1Database, env: Env, productId: string, actor: string, patch: DuxProductWebPatch): Promise<CatalogProductDetail> {
  const current = await requireProduct(database, env, productId);
  await writeDuxProductWebSettings(database, current.sku!, actor, patch);
  return requireProduct(database, env, productId);
}

export async function replaceAdminDuxProductImage(database: D1Database, env: Env, productId: string, actor: string, request: Request): Promise<CatalogProductDetail> {
  const current = await requireProduct(database, env, productId);
  const bucket = requireCatalogImageBucket(env);
  const upload = await readCatalogImageUpload(request);
  const source = `/api/catalog-images/${crypto.randomUUID()}.${upload.extension}`;
  const key = managedImageStorageKey(source)!;
  const stored = await bucket.put(key, upload.bytes, { httpMetadata: { contentType: upload.contentType, cacheControl: CATALOG_IMAGE_CACHE_CONTROL } });
  if (stored === null) throw new HttpError(503, 'CATALOG_IMAGE_UPLOAD_FAILED', 'No se pudo almacenar la imagen.');
  try { await writeDuxProductWebSettings(database, current.sku!, actor, { images: [{ src: source, alt: current.name }] }); }
  catch (error: unknown) {
    // An uncertain D1 response may follow a successful write. Preserve the object
    // unless a fresh read proves that the new reference was not committed.
    try { if (!(await isDuxWebImageReferenced(database, source))) await bucket.delete(key); } catch { /* Retain for reconciliation. */ }
    throw error;
  }
  await cleanupPreviousWebImages(database, env, current);
  return requireProduct(database, env, productId);
}

export async function removeAdminDuxProductImage(database: D1Database, env: Env, productId: string, actor: string): Promise<CatalogProductDetail> {
  const current = await requireProduct(database, env, productId);
  await writeDuxProductWebSettings(database, current.sku!, actor, { images: [] });
  await cleanupPreviousWebImages(database, env, current);
  return requireProduct(database, env, productId);
}

async function requireProduct(database: D1Database, env: Env, productId: string): Promise<CatalogProductDetail> {
  const current = await getAdminDuxProductDetail(database, env, productId);
  if (current === null || current.sku === undefined) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'El producto no existe en Dux.');
  return current;
}

async function cleanupPreviousWebImages(database: D1Database, env: Env, current: CatalogProductDetail): Promise<void> {
  if (env.CATALOG_IMAGES === undefined) return;
  for (const image of current.images) {
    const key = managedImageStorageKey(image.src);
    if (key === null) continue;
    try {
      // Preserved content and Mercado Libre publications remain referenced even
      // when an override masks them. Only an unreferenced managed object is removed.
      if (!(await isCatalogImageReferenced(database, image.src))) await env.CATALOG_IMAGES.delete(key);
    } catch { console.warn('dux_web_image_cleanup_pending'); }
  }
}
