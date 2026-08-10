import catalogIndexSource from '../catalog/internal/catalog-index.json';
import catalogDetailSource from '../src/catalog-data/catalog-details.json';
import categorySource from '../src/catalog-data/categories.json';
import {
  InvalidProductError,
  isManagedCatalogImagePath,
  parseCategories,
  parseProductDetail,
  parseProducts,
} from '../src/catalog/model';
import type { CatalogProductDetail, Product } from '../src/catalog/model';
import { HttpError } from './http';
import type { D1Database } from './platform';

const baseCategories = parseCategories(categorySource);
const baseProducts = parseProducts(catalogIndexSource, baseCategories);
const baseDetailById = new Map(
  baseProducts.map((product) => {
    const rawDetails = (catalogDetailSource as Record<string, unknown>)[product.id];
    if (rawDetails === undefined) {
      throw new Error(`Falta el detalle canónico de "${product.id}".`);
    }
    return [product.id, parseProductDetail(product, rawDetails)] as const;
  }),
);
const authorizedImagePaths = new Set(
  [...baseDetailById.values()].flatMap((product) =>
    product.images.map((image) => image.src),
  ),
);

export type CatalogMutationRow = Readonly<{
  product_id: string;
  payload_json: string | null;
  deleted: number;
}>;

export function getBaseCatalogProducts(): readonly Product[] {
  return baseProducts;
}

export function getBaseCatalogCategories() {
  return baseCategories;
}

export function getBaseCatalogProductDetail(productId: string): CatalogProductDetail | null {
  assertProductId(productId);
  return baseDetailById.get(productId) ?? null;
}

export async function listCatalogProducts(database: D1Database): Promise<readonly Product[]> {
  const details = await listCatalogProductDetails(database);
  return Object.freeze(details.map(toProductSummary));
}

export async function listCatalogProductDetails(
  database: D1Database,
): Promise<readonly CatalogProductDetail[]> {
  const merged = new Map(baseDetailById);
  let rows: readonly CatalogMutationRow[];
  try {
    const result = await database
      .prepare('SELECT product_id, payload_json, deleted FROM catalog_product_mutations')
      .all<CatalogMutationRow>();
    rows = result.results ?? [];
  } catch (error: unknown) {
    if (isMissingCatalogTable(error)) {
      return Object.freeze([...merged.values()]);
    }
    throw error;
  }

  for (const row of rows) {
    if (row.deleted === 1) {
      merged.delete(row.product_id);
      continue;
    }
    if (row.payload_json !== null) {
      merged.set(row.product_id, parseStoredProduct(row.payload_json));
    }
  }

  return Object.freeze(
    [...merged.values()].sort((left, right) =>
      left.name.localeCompare(right.name, 'es-AR', { sensitivity: 'base' }),
    ),
  );
}

export async function getCatalogProductDetail(
  database: D1Database,
  productId: string,
): Promise<CatalogProductDetail | null> {
  assertProductId(productId);
  let row: CatalogMutationRow | null;
  try {
    row = await database
      .prepare(
        'SELECT product_id, payload_json, deleted FROM catalog_product_mutations WHERE product_id = ?1 LIMIT 1',
      )
      .bind(productId)
      .first<CatalogMutationRow>();
  } catch (error: unknown) {
    if (isMissingCatalogTable(error)) {
      return baseDetailById.get(productId) ?? null;
    }
    throw error;
  }

  if (row === null) return baseDetailById.get(productId) ?? null;
  if (row.deleted === 1 || row.payload_json === null) return null;
  return parseStoredProduct(row.payload_json);
}

export async function createCatalogProduct(
  database: D1Database,
  value: unknown,
  actorEmail: string,
): Promise<CatalogProductDetail> {
  await ensureCatalogStorageReady(database);
  const product = parseWritableProduct(value, { requireCategory: true });
  if (await getCatalogProductDetail(database, product.id) !== null) {
    throw new HttpError(409, 'PRODUCT_ALREADY_EXISTS', 'Ya existe un producto con ese slug.');
  }
  assertNoDirectImageMutation(null, product);
  await persistProduct(database, product, actorEmail);
  return product;
}

export async function updateCatalogProduct(
  database: D1Database,
  productId: string,
  value: unknown,
  actorEmail: string,
): Promise<CatalogProductDetail> {
  assertProductId(productId);
  await ensureCatalogStorageReady(database);
  const current = await getCatalogProductDetail(database, productId);
  if (current === null) {
    throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'El producto no existe.');
  }
  const product = parseWritableProduct(value);
  if (product.id !== productId) {
    throw new HttpError(
      400,
      'PRODUCT_ID_IMMUTABLE',
      'El slug no puede cambiarse al editar un producto.',
    );
  }
  assertNoDirectImageMutation(current, product);
  await persistProduct(database, product, actorEmail);
  return product;
}

export async function patchCatalogProductInventory(
  database: D1Database,
  productId: string,
  value: unknown,
  actorEmail: string,
): Promise<CatalogProductDetail> {
  assertProductId(productId);
  await ensureCatalogStorageReady(database);
  const current = await getCatalogProductDetail(database, productId);
  if (current === null) {
    throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'El producto no existe.');
  }
  if (!isRecord(value)) {
    throw invalidProductPatch();
  }
  const keys = Object.keys(value);
  if (
    keys.length === 0 ||
    keys.some((key) => key !== 'availability' && key !== 'stockQuantity')
  ) {
    throw invalidProductPatch();
  }

  let patched: Record<string, unknown> = { ...current };
  if (Object.hasOwn(value, 'availability')) {
    if (value.availability !== 'available' && value.availability !== 'unavailable') {
      throw invalidProductPatch();
    }
    patched = { ...patched, availability: value.availability };
  }
  if (Object.hasOwn(value, 'stockQuantity')) {
    if (value.stockQuantity === null) {
      delete patched.stockQuantity;
    } else {
      patched = { ...patched, stockQuantity: value.stockQuantity };
    }
  }

  const product = parseWritableProduct(patched);
  await persistProduct(database, product, actorEmail);
  return product;
}

export type CatalogImageReplacement = Readonly<{
  previousImages: readonly CatalogProductDetail['images'][number][];
  product: CatalogProductDetail;
}>;

export async function replaceCatalogProductImages(
  database: D1Database,
  productId: string,
  images: readonly CatalogProductDetail['images'][number][],
  actorEmail: string,
): Promise<CatalogImageReplacement> {
  assertProductId(productId);
  await ensureCatalogStorageReady(database);
  const current = await getCatalogProductDetail(database, productId);
  if (current === null) {
    throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'El producto no existe.');
  }
  const nextValue: Record<string, unknown> = {
    ...current,
    images: [...images],
  };
  if (images[0] === undefined) {
    delete nextValue.primaryImage;
  } else {
    nextValue.primaryImage = images[0];
  }
  const product = parseWritableProduct(nextValue);
  await persistProduct(database, product, actorEmail);
  return Object.freeze({ previousImages: current.images, product });
}

export async function isCatalogImageReferenced(
  database: D1Database,
  source: string,
): Promise<boolean> {
  return (await listCatalogProductDetails(database)).some((product) =>
    product.images.some((image) => image.src === source),
  );
}

export async function deleteCatalogProduct(
  database: D1Database,
  productId: string,
  actorEmail: string,
): Promise<void> {
  assertProductId(productId);
  await ensureCatalogStorageReady(database);
  if (await getCatalogProductDetail(database, productId) === null) {
    throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'El producto no existe.');
  }
  const now = new Date().toISOString();
  try {
    await database
      .prepare(`INSERT INTO catalog_product_mutations (product_id, payload_json, deleted, updated_by, created_at, updated_at)
        VALUES (?1, NULL, 1, ?2, ?3, ?3)
        ON CONFLICT(product_id) DO UPDATE SET
          payload_json = NULL,
          deleted = 1,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at`)
      .bind(productId, actorEmail, now)
      .run();
  } catch (error: unknown) {
    throwCatalogStorageError(error);
  }
}

export function toProductSummary(detail: CatalogProductDetail): Product {
  return Object.freeze({
    id: detail.id,
    slug: detail.slug,
    path: detail.path,
    name: detail.name,
    categorySlugs: detail.categorySlugs,
    categoryNames: detail.categoryNames,
    ...(detail.presentation === undefined ? {} : { presentation: detail.presentation }),
    price: detail.price,
    ...(detail.salePrice === undefined ? {} : { salePrice: detail.salePrice }),
    ...(detail.sku === undefined ? {} : { sku: detail.sku }),
    ...(detail.availability === undefined ? {} : { availability: detail.availability }),
    ...(detail.stockQuantity === undefined ? {} : { stockQuantity: detail.stockQuantity }),
    ...(detail.shortDescription === undefined
      ? {}
      : { shortDescription: detail.shortDescription }),
    ...(detail.primaryImage === undefined ? {} : { primaryImage: detail.primaryImage }),
  });
}

function parseWritableProduct(
  value: unknown,
  options: Readonly<{ requireCategory?: boolean }> = {},
): CatalogProductDetail {
  try {
    const summary = parseProducts([value], baseCategories)[0];
    if (summary === undefined) {
      throw new InvalidProductError('El producto no es válido.');
    }
    if (options.requireCategory === true && summary.categorySlugs.length === 0) {
      throw new InvalidProductError('El producto debe pertenecer al menos a una categoría.');
    }
    const detail = parseProductDetail(summary, value);
    const unauthorizedImage = detail.images.find(
      (image) =>
        !authorizedImagePaths.has(image.src) && !isManagedCatalogImagePath(image.src),
    );
    if (unauthorizedImage !== undefined) {
      throw new InvalidProductError(
        `La imagen no pertenece al inventario autorizado: ${unauthorizedImage.src}.`,
      );
    }
    return detail;
  } catch (error: unknown) {
    if (error instanceof InvalidProductError) {
      throw new HttpError(400, 'INVALID_PRODUCT', error.message);
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidProductPatch(): HttpError {
  return new HttpError(
    400,
    'INVALID_PRODUCT_PATCH',
    'La actualización rápida sólo admite disponibilidad y stock.',
  );
}

function assertNoDirectImageMutation(
  current: CatalogProductDetail | null,
  next: CatalogProductDetail,
): void {
  const currentSources = current?.images.map((image) => image.src) ?? [];
  const nextSources = next.images.map((image) => image.src);
  if (
    currentSources.length !== nextSources.length ||
    currentSources.some((source, index) => source !== nextSources[index])
  ) {
    throw new HttpError(
      400,
      'PRODUCT_IMAGE_MUTATION_REQUIRES_UPLOAD',
      'Las imágenes deben cambiarse mediante el control de carga administrativo.',
    );
  }
}

async function ensureCatalogStorageReady(database: D1Database): Promise<void> {
  try {
    await database.prepare('SELECT 1 FROM catalog_product_mutations LIMIT 1').first();
  } catch (error: unknown) {
    throwCatalogStorageError(error);
  }
}

function parseStoredProduct(serialized: string): CatalogProductDetail {
  try {
    return parseWritableProduct(JSON.parse(serialized) as unknown);
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      throw new Error(`Producto persistido inválido: ${error.message}`, { cause: error });
    }
    throw error;
  }
}

async function persistProduct(
  database: D1Database,
  product: CatalogProductDetail,
  actorEmail: string,
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await database
      .prepare(`INSERT INTO catalog_product_mutations (product_id, payload_json, deleted, updated_by, created_at, updated_at)
        VALUES (?1, ?2, 0, ?3, ?4, ?4)
        ON CONFLICT(product_id) DO UPDATE SET
          payload_json = excluded.payload_json,
          deleted = 0,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at`)
      .bind(product.id, JSON.stringify(product), actorEmail, now)
      .run();
  } catch (error: unknown) {
    throwCatalogStorageError(error);
  }
}

function assertProductId(productId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,179}$/u.test(productId)) {
    throw new HttpError(400, 'INVALID_PRODUCT_ID', 'El identificador del producto no es válido.');
  }
}

function isMissingCatalogTable(error: unknown): boolean {
  return error instanceof Error && /no such table:\s*catalog_product_mutations/iu.test(error.message);
}

function throwCatalogStorageError(error: unknown): never {
  if (isMissingCatalogTable(error)) {
    throw new HttpError(
      503,
      'CATALOG_MIGRATION_REQUIRED',
      'La migración del catálogo administrativo todavía no fue aplicada.',
    );
  }
  throw error;
}
