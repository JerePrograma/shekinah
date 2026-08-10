import catalogIndexSource from '../catalog/internal/catalog-index.json';
import catalogDetailSource from '../src/catalog-data/catalog-details.json';
import categorySource from '../src/catalog-data/categories.json';
import {
  InvalidProductError,
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
  const product = parseWritableProduct(value);
  if (await getCatalogProductDetail(database, product.id) !== null) {
    throw new HttpError(409, 'PRODUCT_ALREADY_EXISTS', 'Ya existe un producto con ese slug.');
  }
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
  if (await getCatalogProductDetail(database, productId) === null) {
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
  await persistProduct(database, product, actorEmail);
  return product;
}

export async function deleteCatalogProduct(
  database: D1Database,
  productId: string,
  actorEmail: string,
): Promise<void> {
  assertProductId(productId);
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
    ...(detail.shortDescription === undefined
      ? {}
      : { shortDescription: detail.shortDescription }),
    ...(detail.primaryImage === undefined ? {} : { primaryImage: detail.primaryImage }),
  });
}

function parseWritableProduct(value: unknown): CatalogProductDetail {
  try {
    const summary = parseProducts([value], baseCategories)[0];
    if (summary === undefined) {
      throw new InvalidProductError('El producto no es válido.');
    }
    return parseProductDetail(summary, value);
  } catch (error: unknown) {
    if (error instanceof InvalidProductError) {
      throw new HttpError(400, 'INVALID_PRODUCT', error.message);
    }
    throw error;
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
