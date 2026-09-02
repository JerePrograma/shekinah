import type {
  CatalogCategory,
  CatalogProductDetail,
} from '../src/catalog/model';
import { sha256Hex } from './crypto';
import type { DuxInventoryUnit } from './dux-inventory';
import { HttpError } from './http';
import type { D1Database } from './platform';

export const DUX_PUBLIC_PRICE_LIST_NAME = 'PRECIOS DEL NEGOCIO';

const DUX_CATALOG_SCHEMA_VERSION = 1;
const DUX_CATALOG_SNAPSHOT_MAX_BYTES = 1_900_000;
const DUX_PRODUCT_SLUG_MAX_BASE_LENGTH = 140;
const DUX_SYNC_ID_PATTERN = /^dux_sync_[A-Za-z0-9._:-]{1,180}$/u;

type DuxCatalogPrice = Readonly<{
  id: number;
  name: string;
  amount: number;
}>;

type DuxCatalogReference = Readonly<{
  id: number;
  name: string;
}>;

export type DuxCatalogSourceItem = Readonly<{
  code: string;
  name: string;
  enabled: boolean;
  unitsPerPackage: number | null;
  prices: readonly DuxCatalogPrice[];
  category: DuxCatalogReference | null;
  subcategory: DuxCatalogReference | null;
  imageUrl: string | null;
  description: string | null;
}>;

type StoredCatalogReference = Readonly<{
  slug: string;
  name: string;
}>;

type StoredDuxCatalogItem = Readonly<{
  slug: string;
  code: string;
  name: string;
  priceAmount: number;
  categories: readonly StoredCatalogReference[];
  unitsPerPackage: number | null;
  imageUrl: string | null;
  description: string | null;
}>;

type StoredDuxCatalogPayload = Readonly<{
  schemaVersion: typeof DUX_CATALOG_SCHEMA_VERSION;
  priceListName: typeof DUX_PUBLIC_PRICE_LIST_NAME;
  items: readonly StoredDuxCatalogItem[];
}>;

export type DuxCatalogSnapshot = Readonly<{
  inventoryRunId: string;
  catalogVersion: string;
  priceListName: typeof DUX_PUBLIC_PRICE_LIST_NAME;
  itemCount: number;
  items: readonly StoredDuxCatalogItem[];
  syncedAt: string;
}>;

export type DuxCatalogSyncSummary = Readonly<{
  inventoryRunId: string;
  catalogVersion: string;
  priceListName: typeof DUX_PUBLIC_PRICE_LIST_NAME;
  itemCount: number;
  syncedAt: string;
}>;

export type DuxRuntimeCatalog = Readonly<{
  products: readonly CatalogProductDetail[];
  categories: readonly CatalogCategory[];
}>;

type DuxCatalogSnapshotRow = Readonly<{
  inventory_run_id: unknown;
  catalog_version: unknown;
  price_list_name: unknown;
  item_count: unknown;
  payload_json: unknown;
  synced_at: unknown;
  source_run_status: unknown;
}>;

type ProductMappingResolution = Readonly<{
  status: 'mapped' | 'unmapped' | 'ambiguous';
  localProductId: string | null;
  units: readonly DuxInventoryUnit[];
}>;

/**
 * Extrae metadatos comerciales del bloque `datos` ya obtenido por el reader
 * Dux. Un stock con cantidades null no se convierte a cero: el ítem permanece
 * en el catálogo, pero no adquiere una observación cuantitativa ni vendibilidad.
 */
export function parseDuxCatalogSourceItems(
  value: unknown,
): readonly DuxCatalogSourceItem[] {
  if (!isRecord(value) || !Array.isArray(value.datos)) {
    throw invalidProviderResponse();
  }
  return Object.freeze(value.datos.map(parseDuxCatalogSourceItem));
}

/**
 * Publica una única fotografía comercial obtenida en la misma lectura que el
 * snapshot de inventario. La fila anterior sólo se reemplaza después de haber
 * construido, validado y hasheado íntegramente el nuevo payload.
 */
export async function persistDuxCatalogSnapshot(
  database: D1Database,
  inventoryRunId: string,
  sourceItems: readonly DuxCatalogSourceItem[],
  syncedAt: string,
): Promise<DuxCatalogSyncSummary> {
  const safeRunId = syncRunId(inventoryRunId);
  const safeSyncedAt = timestamp(syncedAt, invalidInternalInput);
  const payload = buildStoredPayload(sourceItems);
  const serializedPayload = JSON.stringify(payload);
  if (new TextEncoder().encode(serializedPayload).byteLength > DUX_CATALOG_SNAPSHOT_MAX_BYTES) {
    throw new HttpError(
      502,
      'DUX_CATALOG_SNAPSHOT_TOO_LARGE',
      'El catálogo Dux excedió el tamaño seguro de publicación.',
    );
  }
  const catalogVersion = await sha256Hex(serializedPayload);

  try {
    await database
      .prepare(
        `INSERT INTO dux_catalog_snapshot (
          id, inventory_run_id, catalog_version, price_list_name, item_count,
          payload_json, synced_at, created_at, updated_at
        ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?6, ?6)
        ON CONFLICT(id) DO UPDATE SET
          inventory_run_id = excluded.inventory_run_id,
          catalog_version = excluded.catalog_version,
          price_list_name = excluded.price_list_name,
          item_count = excluded.item_count,
          payload_json = excluded.payload_json,
          synced_at = excluded.synced_at,
          updated_at = excluded.updated_at`,
      )
      .bind(
        safeRunId,
        catalogVersion,
        DUX_PUBLIC_PRICE_LIST_NAME,
        payload.items.length,
        serializedPayload,
        safeSyncedAt,
      )
      .run();
  } catch (error: unknown) {
    if (isMissingCatalogSnapshotTable(error)) {
      throw catalogMigrationRequired();
    }
    if (
      error instanceof Error &&
      error.message.includes('DUX_CATALOG_REQUIRES_COMPLETED_SYNC')
    ) {
      throw new HttpError(
        503,
        'DUX_CATALOG_SOURCE_RUN_INVALID',
        'El catálogo Dux no pudo vincularse a una sincronización completa.',
      );
    }
    throw error;
  }

  return Object.freeze({
    inventoryRunId: safeRunId,
    catalogVersion,
    priceListName: DUX_PUBLIC_PRICE_LIST_NAME,
    itemCount: payload.items.length,
    syncedAt: safeSyncedAt,
  });
}

export async function readDuxCatalogSnapshot(
  database: D1Database,
): Promise<DuxCatalogSnapshot> {
  let row: DuxCatalogSnapshotRow | null;
  try {
    row = await database
      .prepare(
        `SELECT catalog.inventory_run_id, catalog.catalog_version,
                catalog.price_list_name, catalog.item_count,
                catalog.payload_json, catalog.synced_at,
                run.status AS source_run_status
         FROM dux_catalog_snapshot AS catalog
         INNER JOIN dux_sync_runs AS run ON run.id = catalog.inventory_run_id
         WHERE catalog.id = 1`,
      )
      .first<DuxCatalogSnapshotRow>();
  } catch (error: unknown) {
    if (isMissingCatalogSnapshotTable(error)) throw catalogMigrationRequired();
    throw error;
  }
  if (row === null) {
    throw new HttpError(
      503,
      'DUX_CATALOG_SNAPSHOT_UNAVAILABLE',
      'El catálogo Dux todavía no tiene una publicación disponible.',
    );
  }
  if (row.source_run_status !== 'succeeded' && row.source_run_status !== 'partial') {
    throw invalidDatabaseProjection();
  }

  const payloadText = databaseJsonText(row.payload_json);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadText) as unknown;
  } catch {
    throw invalidDatabaseProjection();
  }
  const payload = parseStoredPayload(parsed);
  const itemCount = nonNegativeInteger(row.item_count);
  if (itemCount !== payload.items.length) throw invalidDatabaseProjection();
  if (row.price_list_name !== DUX_PUBLIC_PRICE_LIST_NAME) {
    throw invalidDatabaseProjection();
  }

  return Object.freeze({
    inventoryRunId: databaseText(row.inventory_run_id, 220),
    catalogVersion: databaseHexDigest(row.catalog_version),
    priceListName: DUX_PUBLIC_PRICE_LIST_NAME,
    itemCount,
    items: payload.items,
    syncedAt: timestamp(row.synced_at, invalidDatabaseProjection),
  });
}

export function isDuxCatalogBootstrapPendingError(error: unknown): boolean {
  return error instanceof HttpError && (
    error.code === 'DUX_CATALOG_MIGRATION_REQUIRED' ||
    error.code === 'DUX_CATALOG_SNAPSHOT_UNAVAILABLE'
  );
}

export function isDuxCatalogMigrationRequiredError(error: unknown): boolean {
  return error instanceof HttpError && error.code === 'DUX_CATALOG_MIGRATION_REQUIRED';
}

/**
 * Proyecta exclusivamente los ítems presentes en Dux. Los datos locales sólo
 * enriquecen ítems con mapping único; nunca agregan productos ausentes, ni
 * reemplazan nombre, precio, SKU o clasificación Dux.
 */
export function projectDuxRuntimeCatalog(
  snapshot: DuxCatalogSnapshot,
  localProducts: readonly CatalogProductDetail[],
  inventoryUnits: readonly DuxInventoryUnit[],
): DuxRuntimeCatalog {
  const localById = new Map(localProducts.map((product) => [product.id, product]));
  const unitsByCode = groupInventoryUnitsByCode(inventoryUnits);
  const resolutions = new Map(
    snapshot.items.map((item) => [
      item.code,
      resolveProductMapping(unitsByCode.get(item.code) ?? Object.freeze([])),
    ]),
  );
  const localIdUseCount = new Map<string, number>();
  for (const resolution of resolutions.values()) {
    if (resolution.status !== 'mapped' || resolution.localProductId === null) continue;
    localIdUseCount.set(
      resolution.localProductId,
      (localIdUseCount.get(resolution.localProductId) ?? 0) + 1,
    );
  }
  const generatedSlugs = new Set(snapshot.items.map((item) => item.slug));
  const productIds = new Set<string>();

  const products = snapshot.items.map((item) => {
    const resolution = resolutions.get(item.code);
    if (resolution === undefined) throw invalidDatabaseProjection();
    const localProduct = resolution.localProductId === null
      ? undefined
      : localById.get(resolution.localProductId);
    const canPreserveLocalId =
      resolution.status === 'mapped' &&
      localProduct !== undefined &&
      localIdUseCount.get(localProduct.id) === 1 &&
      (!generatedSlugs.has(localProduct.id) || localProduct.id === item.slug);
    const productId = canPreserveLocalId ? localProduct.id : item.slug;
    if (productIds.has(productId)) throw invalidDatabaseProjection();
    productIds.add(productId);
    return projectProduct(item, snapshot, localProduct, resolution, productId);
  });

  return Object.freeze({
    products: Object.freeze([...products].sort((left, right) =>
      left.name.localeCompare(right.name, 'es-AR', { sensitivity: 'base' }),
    )),
    categories: buildRuntimeCategories(products),
  });
}

function buildStoredPayload(
  sourceItems: readonly DuxCatalogSourceItem[],
): StoredDuxCatalogPayload {
  const codes = new Set<string>();
  const slugs = new Set<string>();
  const categoryNames = new Map<string, string>();
  const items = sourceItems
    .filter((item) => item.enabled)
    .map((item) => {
      if (codes.has(item.code)) {
        throw new HttpError(
          502,
          'DUX_CATALOG_DUPLICATE_ITEM',
          'Dux devolvió un código de catálogo duplicado.',
        );
      }
      codes.add(item.code);
      const slug = createDuxProductSlug(item.name, item.code);
      if (slugs.has(slug)) {
        throw new HttpError(
          502,
          'DUX_CATALOG_SLUG_COLLISION',
          'Dux devolvió identidades de catálogo que no pudieron distinguirse.',
        );
      }
      slugs.add(slug);
      return Object.freeze({
        slug,
        code: item.code,
        name: item.name,
        priceAmount: selectPublicPrice(item.prices),
        categories: sourceCategories(item, categoryNames),
        unitsPerPackage: item.unitsPerPackage,
        imageUrl: normalizeProviderImageUrl(item.imageUrl),
        description: item.description,
      });
    })
    .sort((left, right) => left.code.localeCompare(right.code, 'en'));

  return Object.freeze({
    schemaVersion: DUX_CATALOG_SCHEMA_VERSION,
    priceListName: DUX_PUBLIC_PRICE_LIST_NAME,
    items: Object.freeze(items),
  });
}

function parseStoredPayload(value: unknown): StoredDuxCatalogPayload {
  if (
    !isRecord(value) ||
    value.schemaVersion !== DUX_CATALOG_SCHEMA_VERSION ||
    value.priceListName !== DUX_PUBLIC_PRICE_LIST_NAME ||
    !Array.isArray(value.items)
  ) {
    throw invalidDatabaseProjection();
  }
  const codes = new Set<string>();
  const slugs = new Set<string>();
  const categoryNames = new Map<string, string>();
  const items = value.items.map((candidate) => {
    if (!isRecord(candidate) || !Array.isArray(candidate.categories)) {
      throw invalidDatabaseProjection();
    }
    const slug = databaseSlug(candidate.slug);
    const code = databaseText(candidate.code, 300);
    if (codes.has(code) || slugs.has(slug)) throw invalidDatabaseProjection();
    codes.add(code);
    slugs.add(slug);
    const categories = Object.freeze(candidate.categories.map((category) => {
      if (!isRecord(category)) throw invalidDatabaseProjection();
      const categorySlug = databaseSlug(category.slug);
      const categoryName = databaseText(category.name, 300);
      const previousName = categoryNames.get(categorySlug);
      if (previousName !== undefined && previousName !== categoryName) {
        throw invalidDatabaseProjection();
      }
      categoryNames.set(categorySlug, categoryName);
      return Object.freeze({ slug: categorySlug, name: categoryName });
    }));
    if (new Set(categories.map((category) => category.slug)).size !== categories.length) {
      throw invalidDatabaseProjection();
    }
    return Object.freeze({
      slug,
      code,
      name: databaseText(candidate.name, 500),
      priceAmount: databasePrice(candidate.priceAmount),
      categories,
      unitsPerPackage: nullableFiniteDatabaseNumber(candidate.unitsPerPackage),
      imageUrl: nullableDatabaseText(candidate.imageUrl, 2_048),
      description: nullableDatabaseText(candidate.description, 20_000),
    });
  });
  return Object.freeze({
    schemaVersion: DUX_CATALOG_SCHEMA_VERSION,
    priceListName: DUX_PUBLIC_PRICE_LIST_NAME,
    items: Object.freeze(items),
  });
}

function parseDuxCatalogSourceItem(value: unknown): DuxCatalogSourceItem {
  if (!isRecord(value)) throw invalidProviderResponse();
  return Object.freeze({
    code: requiredProviderText(value.cod_item, 300),
    name: requiredProviderText(value.item, 500),
    enabled: requiredBoolean(value.habilitado),
    unitsPerPackage: optionalFiniteNumber(value.ctd_unidades_por_bulto),
    prices: parsePrices(value.precios),
    category: parseReference(value.rubro),
    subcategory: parseReference(value.sub_rubro),
    imageUrl: optionalProviderText(value.imagen_url, 2_048),
    description: optionalProviderText(value.descripcion, 20_000),
  });
}

function parsePrices(value: unknown): readonly DuxCatalogPrice[] {
  if (value === undefined || value === null) return Object.freeze([]);
  if (!Array.isArray(value)) throw invalidProviderResponse();
  return Object.freeze(value.map((candidate) => {
    if (!isRecord(candidate)) throw invalidProviderResponse();
    return Object.freeze({
      id: requiredIdentifier(candidate.id),
      name: requiredProviderText(candidate.nombre, 300),
      amount: requiredFiniteNumber(candidate.precio),
    });
  }));
}

function parseReference(value: unknown): DuxCatalogReference | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw invalidProviderResponse();
  return Object.freeze({
    id: requiredIdentifier(value.id),
    name: requiredProviderText(value.nombre, 300),
  });
}

function sourceCategories(
  item: DuxCatalogSourceItem,
  namesBySlug: Map<string, string>,
): readonly StoredCatalogReference[] {
  const categories: StoredCatalogReference[] = [];
  for (const [prefix, reference] of [
    ['dux-rubro', item.category],
    ['dux-subrubro', item.subcategory],
  ] as const) {
    if (reference === null) continue;
    const slug = `${prefix}-${reference.id}`;
    const previousName = namesBySlug.get(slug);
    if (previousName !== undefined && previousName !== reference.name) {
      throw new HttpError(
        502,
        'DUX_CATALOG_CATEGORY_CONFLICT',
        'Dux devolvió una categoría con nombres incompatibles.',
      );
    }
    namesBySlug.set(slug, reference.name);
    categories.push(Object.freeze({ slug, name: reference.name }));
  }
  return Object.freeze(categories);
}

function selectPublicPrice(prices: readonly DuxCatalogPrice[]): number {
  const matches = prices.filter((price) =>
    price.name.toLocaleUpperCase('es-AR') === DUX_PUBLIC_PRICE_LIST_NAME,
  );
  if (matches.length !== 1) {
    throw new HttpError(
      502,
      'DUX_CATALOG_PRICE_LIST_INVALID',
      `Dux debe informar exactamente una lista ${DUX_PUBLIC_PRICE_LIST_NAME} por producto.`,
    );
  }
  const match = matches[0];
  if (match === undefined) throw invalidProviderResponse();
  return validPrice(match.amount, () => new HttpError(
    502,
    'DUX_CATALOG_PRICE_INVALID',
    'Dux devolvió un precio público no válido.',
  ));
}

function createDuxProductSlug(name: string, code: string): string {
  const normalized = name
    .normalize('NFKD')
    .replaceAll(/\p{M}+/gu, '')
    .toLocaleLowerCase('es-AR')
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
    .slice(0, DUX_PRODUCT_SLUG_MAX_BASE_LENGTH)
    .replaceAll(/-+$/gu, '');
  const base = normalized === '' ? 'producto' : normalized;
  return `dux-${base}-${stableIdentityHash(code)}`;
}

function stableIdentityHash(value: string): string {
  let hash = 14_695_981_039_346_656_037n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 1_099_511_628_211n);
  }
  return hash.toString(16).padStart(16, '0');
}

function normalizeProviderImageUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw invalidProviderResponse();
    }
    return url.href;
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error;
    throw invalidProviderResponse();
  }
}

function groupInventoryUnitsByCode(
  units: readonly DuxInventoryUnit[],
): ReadonlyMap<string, readonly DuxInventoryUnit[]> {
  const grouped = new Map<string, DuxInventoryUnit[]>();
  for (const unit of units) {
    if (unit.lastSyncStatus === 'absent') continue;
    const matches = grouped.get(unit.itemCode) ?? [];
    matches.push(unit);
    grouped.set(unit.itemCode, matches);
  }
  return grouped;
}

function resolveProductMapping(
  units: readonly DuxInventoryUnit[],
): ProductMappingResolution {
  if (units.length === 0) {
    return Object.freeze({
      status: 'unmapped' as const,
      localProductId: null,
      units,
    });
  }
  const mappedIds = new Set(units.flatMap((unit) =>
    unit.mappingStatus === 'mapped' && unit.localProductId !== null
      ? [unit.localProductId]
      : [],
  ));
  const fullyMapped = mappedIds.size === 1 && units.every((unit) =>
    unit.mappingStatus === 'mapped' && unit.localProductId !== null,
  );
  if (fullyMapped) {
    const localProductId = [...mappedIds][0];
    if (localProductId === undefined) throw invalidDatabaseProjection();
    return Object.freeze({
      status: 'mapped' as const,
      localProductId,
      units,
    });
  }
  return Object.freeze({
    status: mappedIds.size > 0 || units.some((unit) => unit.mappingStatus === 'ambiguous')
      ? 'ambiguous' as const
      : 'unmapped' as const,
    localProductId: null,
    units,
  });
}

function projectProduct(
  item: StoredDuxCatalogItem,
  snapshot: DuxCatalogSnapshot,
  localProduct: CatalogProductDetail | undefined,
  resolution: ProductMappingResolution,
  productId: string,
): CatalogProductDetail {
  const observedStock = aggregateObservedStock(resolution.units);
  const allFresh = resolution.units.length > 0 && resolution.units.every((unit) =>
    unit.lastSyncStatus === 'ok' && unit.fresh,
  );
  const availabilityState = observedStock === undefined
    ? 'unavailable' as const
    : !allFresh
      ? 'updating' as const
      : observedStock.available <= 0
        ? 'out_of_stock' as const
        : 'unavailable' as const;
  const depositNames = new Set(resolution.units.map((unit) => unit.depositName));
  const depositName = depositNames.size === 1 ? [...depositNames][0] : undefined;
  const images = localProduct?.images ?? Object.freeze([]);
  const description = item.description ?? localProduct?.description;

  return Object.freeze({
    id: productId,
    slug: productId,
    path: `/${productId}/`,
    name: item.name,
    categorySlugs: Object.freeze(item.categories.map((category) => category.slug)),
    categoryNames: Object.freeze(item.categories.map((category) => category.name)),
    ...(localProduct?.presentation === undefined
      ? {}
      : { presentation: localProduct.presentation }),
    price: Object.freeze({ amount: item.priceAmount, currency: 'ARS' as const }),
    sku: item.code,
    availability: 'unavailable' as const,
    ...(localProduct?.shortDescription === undefined
      ? {}
      : { shortDescription: localProduct.shortDescription }),
    ...(images[0] === undefined ? {} : { primaryImage: images[0] }),
    commerce: Object.freeze({
      source: 'dux' as const,
      catalogVersion: snapshot.catalogVersion,
      syncedAt: snapshot.syncedAt,
      availabilityState,
      checkoutEligible: false,
      mappingStatus: resolution.status,
      quantitySemanticsStatus: 'unavailable_from_v2_items' as const,
      ...(observedStock === undefined ? {} : { observedStock }),
      ...(depositName === undefined ? {} : { depositName }),
    }),
    ...(description === undefined ? {} : { description }),
    images,
    variants: Object.freeze([]),
  });
}

function aggregateObservedStock(
  units: readonly DuxInventoryUnit[],
): Readonly<{ real: number; reserved: number; available: number }> | undefined {
  if (units.length === 0) return undefined;
  const total = units.reduce(
    (current, unit) => ({
      real: current.real + unit.observedStock.real,
      reserved: current.reserved + unit.observedStock.reserved,
      available: current.available + unit.observedStock.available,
    }),
    { real: 0, reserved: 0, available: 0 },
  );
  if (
    !Number.isFinite(total.real) ||
    !Number.isFinite(total.reserved) ||
    !Number.isFinite(total.available)
  ) {
    throw invalidDatabaseProjection();
  }
  return Object.freeze(total);
}

function buildRuntimeCategories(
  products: readonly CatalogProductDetail[],
): readonly CatalogCategory[] {
  const categories = new Map<string, { name: string; count: number }>();
  for (const product of products) {
    product.categorySlugs.forEach((slug, index) => {
      const name = product.categoryNames[index];
      if (name === undefined) throw invalidDatabaseProjection();
      const current = categories.get(slug);
      if (current !== undefined && current.name !== name) {
        throw invalidDatabaseProjection();
      }
      categories.set(slug, { name, count: (current?.count ?? 0) + 1 });
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

function validPrice(value: number, error: () => HttpError): number {
  const minor = value * 100;
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    !Number.isSafeInteger(Math.round(minor)) ||
    Math.abs(minor - Math.round(minor)) > 0.000001
  ) {
    throw error();
  }
  return value;
}

function databasePrice(value: unknown): number {
  if (typeof value !== 'number') throw invalidDatabaseProjection();
  return validPrice(value, invalidDatabaseProjection);
}

function requiredBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw invalidProviderResponse();
  return value;
}

function requiredIdentifier(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw invalidProviderResponse();
  }
  return value;
}

function requiredFiniteNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidProviderResponse();
  }
  return value;
}

function optionalFiniteNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  return requiredFiniteNumber(value);
}

function requiredProviderText(value: unknown, maximum: number): string {
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    value.length > maximum
  ) {
    throw invalidProviderResponse();
  }
  return value.trim();
}

function optionalProviderText(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  return requiredProviderText(value, maximum);
}

function databaseText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maximum) {
    throw invalidDatabaseProjection();
  }
  return value;
}

function nullableDatabaseText(value: unknown, maximum: number): string | null {
  if (value === null || value === undefined) return null;
  return databaseText(value, maximum);
}

function databaseSlug(value: unknown): string {
  const slug = databaseText(value, 180);
  if (!/^[a-z0-9][a-z0-9-]{0,179}$/u.test(slug)) {
    throw invalidDatabaseProjection();
  }
  return slug;
}

function timestamp(
  value: unknown,
  error: () => HttpError,
): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 100) {
    throw error();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) throw error();
  return value;
}

function databaseHexDigest(value: unknown): string {
  const digest = databaseText(value, 64);
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw invalidDatabaseProjection();
  return digest;
}

function databaseJsonText(value: unknown): string {
  if (typeof value !== 'string' || value === '') throw invalidDatabaseProjection();
  return value;
}

function nonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidDatabaseProjection();
  }
  return value;
}

function nullableFiniteDatabaseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidDatabaseProjection();
  }
  return value;
}

function syncRunId(value: unknown): string {
  if (typeof value !== 'string' || !DUX_SYNC_ID_PATTERN.test(value)) {
    throw invalidInternalInput();
  }
  return value;
}

function isMissingCatalogSnapshotTable(error: unknown): boolean {
  return error instanceof Error && /no such table:\s*dux_catalog_snapshot/iu.test(error.message);
}

function catalogMigrationRequired(): HttpError {
  return new HttpError(
    503,
    'DUX_CATALOG_MIGRATION_REQUIRED',
    'La migración del catálogo Dux todavía no fue aplicada.',
  );
}

function invalidProviderResponse(): HttpError {
  return new HttpError(
    502,
    'DUX_RESPONSE_INVALID',
    'Dux devolvió una respuesta no válida.',
  );
}

function invalidInternalInput(): HttpError {
  return new HttpError(
    500,
    'DUX_CATALOG_INTERNAL_INPUT_INVALID',
    'No se pudo preparar la publicación del catálogo Dux.',
  );
}

function invalidDatabaseProjection(): HttpError {
  return new HttpError(
    503,
    'DUX_CATALOG_SNAPSHOT_INVALID',
    'La publicación del catálogo Dux no es válida.',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
