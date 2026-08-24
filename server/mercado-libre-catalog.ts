import type { CatalogProductDetail } from '../src/catalog/model';
import { readMercadoLibreCatalogMaxAgeSeconds } from './config';
import { sha256Hex } from './crypto';
import { HttpError } from './http';
import {
  getMercadoLibreAccess,
  getMercadoLibreConnectionStatus,
  mercadoLibreApiJson,
} from './mercado-libre';
import type { D1Database, D1PreparedStatement, Env } from './platform';

const ITEM_BATCH_SIZE = 20;
const MAX_FAILED_ITEM_EXCLUSIONS = 500;
const MAX_SCAN_PAGES = 250;
const SCAN_PAGE_SIZE = 100;

export type MercadoLibreStockModel =
  | 'seller_warehouse_versioned'
  | 'selling_address'
  | 'meli_facility'
  | 'legacy_available_quantity'
  | 'unknown';

export type MercadoLibreCatalogUnit = Readonly<{
  inventoryKey: string;
  sellerId: string;
  itemId: string;
  variationId: string | null;
  userProductId: string | null;
  sellerSku: string | null;
  localProductId: string | null;
  title: string;
  priceMinor: number;
  currency: string;
  itemStatus: string;
  availableQuantity: number;
  stockModel: MercadoLibreStockModel;
  stockLocationId: string | null;
  upstreamVersion: string | null;
  stockLocations: readonly StockLocation[];
  primaryImageUrl: string | null;
  permalink: string | null;
  providerUpdatedAt: string | null;
  catalogVersion: string;
  mappingStatus: 'mapped' | 'unmapped' | 'ambiguous' | 'duplicate';
  sellable: boolean;
  checkoutEligible: boolean;
  lastSyncStatus: 'ok' | 'error' | 'absent';
  lastSyncErrorCode: string | null;
  lastSyncedAt: string;
  fresh: boolean;
}>;

export type MercadoLibreSyncSummary = Readonly<{
  runId: string;
  status: 'succeeded' | 'partial' | 'failed';
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  failed: number;
  ambiguous: number;
  active: number;
  paused: number;
  closed: number;
  outOfStock: number;
  startedAt: string;
  completedAt: string;
}>;

type StockLocation = Readonly<{
  type: string;
  id: string;
  quantity: number;
}>;

type RawUnit = Readonly<{
  itemId: string;
  variationId: string | null;
  userProductId: string | null;
  sellerSku: string | null;
  title: string;
  priceMinor: number;
  currency: string;
  itemStatus: string;
  legacyAvailableQuantity: number;
  primaryImageUrl: string | null;
  permalink: string | null;
  providerUpdatedAt: string | null;
}>;

type EnrichedUnit = RawUnit & Readonly<{
  sellerId: string;
  availableQuantity: number;
  stockModel: MercadoLibreStockModel;
  stockLocationId: string | null;
  upstreamVersion: string | null;
  stockLocations: readonly StockLocation[];
  stockErrorCode: string | null;
}>;

type CatalogUnitRow = Readonly<{
  inventory_key: string;
  seller_id: string;
  item_id: string;
  variation_id: string | null;
  user_product_id: string | null;
  seller_sku: string | null;
  local_product_id: string | null;
  title: string;
  price_minor: number;
  currency: string;
  item_status: string;
  available_quantity: number;
  stock_model: MercadoLibreStockModel;
  stock_location_id: string | null;
  upstream_version: string | null;
  stock_snapshot_json: string;
  primary_image_url: string | null;
  permalink: string | null;
  provider_updated_at: string | null;
  catalog_version: string;
  mapping_status: MercadoLibreCatalogUnit['mappingStatus'];
  sellable: number;
  checkout_eligible: number;
  last_sync_status: MercadoLibreCatalogUnit['lastSyncStatus'];
  last_sync_error_code: string | null;
  last_synced_at: string;
}>;

export async function syncMercadoLibreCatalog(
  database: D1Database,
  env: Env,
  actor: string,
  options: Readonly<{
    kind?: 'initial' | 'full' | 'incremental' | 'notification';
    itemIds?: readonly string[];
    localProducts: readonly CatalogProductDetail[];
  }>,
): Promise<MercadoLibreSyncSummary> {
  const kind = options.kind ?? 'full';
  const startedAt = new Date().toISOString();
  const runId = `ml_sync_${crypto.randomUUID()}`;
  await database
    .prepare(
      `UPDATE mercadolibre_sync_runs
       SET status = 'failed', error_code = 'MERCADO_LIBRE_SYNC_ABANDONED',
           completed_at = ?, updated_at = ?
       WHERE status = 'running' AND unixepoch(started_at) <= unixepoch(?, '-15 minutes')`,
    )
    .bind(startedAt, startedAt, startedAt)
    .run();
  const claimed = await database
    .prepare(
      `INSERT OR IGNORE INTO mercadolibre_sync_runs (
        id, kind, status, trigger_actor, started_at, created_at, updated_at
      ) VALUES (?, ?, 'running', ?, ?, ?, ?)
      RETURNING id`,
    )
    .bind(runId, kind, actor, startedAt, startedAt, startedAt)
    .first<Readonly<{ id: string }>>();
  if (claimed === null) {
    throw new HttpError(409, 'MERCADO_LIBRE_SYNC_IN_PROGRESS', 'Ya existe una sincronización en curso.');
  }

  try {
    const { accessToken, sellerId } = await getMercadoLibreAccess(database, env);
    const itemIds = options.itemIds === undefined
      ? await listSellerItemIds(sellerId, accessToken)
      : normalizeItemIds(options.itemIds);
    const rawUnits: RawUnit[] = [];
    const failedItemIds = new Set<string>();
    let failed = 0;
    for (const batch of chunk(itemIds, ITEM_BATCH_SIZE)) {
      const details = await fetchItemBatch(batch, accessToken, sellerId);
      failed += details.failed;
      rawUnits.push(...details.units);
      details.failedItemIds.forEach((itemId) => failedItemIds.add(itemId));
    }
    if (failedItemIds.size > MAX_FAILED_ITEM_EXCLUSIONS) {
      throw new HttpError(
        502,
        'MERCADO_LIBRE_PARTIAL_SCAN_UNSAFE',
        'Mercado Libre no permitió demostrar un ciclo completo seguro.',
      );
    }
    const stockResults = await mapConcurrent(rawUnits, 5, async (unit) => {
      try {
        return await enrichStock(unit, sellerId, accessToken);
      } catch (error: unknown) {
        return unavailableStockUnit(unit, sellerId, errorCode(error));
      }
    });
    failed += stockResults.filter((unit) => unit.stockErrorCode !== null).length;
    const unitsWithStock = stockResults;
    const mapped = await mapCatalogUnits(unitsWithStock, sellerId, options.localProducts, startedAt);
    const existing = await readExistingVersions(database, mapped.map((unit) => unit.inventoryKey));
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    for (const unit of mapped) {
      const previous = existing.get(unit.inventoryKey);
      if (previous === undefined) created += 1;
      else if (
        previous.catalogVersion === unit.catalogVersion &&
        previous.mappingStatus === unit.mappingStatus &&
        previous.lastSyncStatus === 'ok'
      ) unchanged += 1;
      else updated += 1;
    }
    await writeUnits(database, mapped, startedAt);
    let deactivated = 0;
    if (options.itemIds === undefined) {
      const failedPlaceholders = [...failedItemIds].map(() => '?').join(',');
      const result = await database
        .prepare(
          `UPDATE mercadolibre_catalog_units
           SET sellable = 0,
               checkout_eligible = 0,
               last_sync_status = 'absent',
               absent_since = COALESCE(absent_since, ?),
               updated_at = ?
           WHERE seller_id = ? AND last_synced_at <> ? AND last_sync_status <> 'absent'
             ${failedItemIds.size === 0 ? '' : `AND item_id NOT IN (${failedPlaceholders})`}`,
        )
        .bind(startedAt, startedAt, sellerId, startedAt, ...failedItemIds)
        .run();
      deactivated = result.meta.changes ?? 0;
    } else {
      const refreshedItemIds = [...new Set(mapped.map((unit) => unit.itemId))];
      for (const batch of chunk(refreshedItemIds, 50)) {
        if (batch.length === 0) continue;
        const placeholders = batch.map(() => '?').join(',');
        const result = await database
          .prepare(
            `UPDATE mercadolibre_catalog_units
             SET sellable = 0,
                 checkout_eligible = 0,
                 last_sync_status = 'absent',
                 absent_since = COALESCE(absent_since, ?),
                 updated_at = ?
             WHERE seller_id = ? AND item_id IN (${placeholders})
               AND last_synced_at <> ? AND last_sync_status <> 'absent'`,
          )
          .bind(startedAt, startedAt, sellerId, ...batch, startedAt)
          .run();
        deactivated += result.meta.changes ?? 0;
      }
    }
    await markPersistedMappingConflicts(database, sellerId, startedAt);
    const ambiguousRow = await database
      .prepare(
        `SELECT COUNT(*) AS total FROM mercadolibre_catalog_units
         WHERE seller_id = ? AND last_synced_at = ? AND mapping_status <> 'mapped'`,
      )
      .bind(sellerId, startedAt)
      .first<Readonly<{ total: number }>>();
    const ambiguous = ambiguousRow?.total ?? 0;
    const active = mapped.filter((unit) => unit.itemStatus === 'active').length;
    const paused = mapped.filter((unit) => unit.itemStatus === 'paused').length;
    const closed = mapped.filter((unit) => ['closed', 'deleted', 'under_review'].includes(unit.itemStatus)).length;
    const outOfStock = mapped.filter((unit) => unit.availableQuantity === 0).length;
    const completedAt = new Date().toISOString();
    const status = failed === 0 ? 'succeeded' : mapped.length > 0 ? 'partial' : 'failed';
    await finishSyncRun(database, {
      runId, status, processed: mapped.length, created, updated, unchanged, deactivated,
      failed, ambiguous, active, paused, closed, outOfStock, startedAt, completedAt,
    });
    return Object.freeze({
      runId, status, processed: mapped.length, created, updated, unchanged, deactivated,
      failed, ambiguous, active, paused, closed, outOfStock, startedAt, completedAt,
    });
  } catch (error: unknown) {
    const completedAt = new Date().toISOString();
    await database
      .prepare(
        `UPDATE mercadolibre_sync_runs
         SET status = 'failed', error_code = ?, completed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(errorCode(error), completedAt, completedAt, runId)
      .run();
    throw error;
  }
}

export async function revalidateMercadoLibreCart(
  database: D1Database,
  env: Env,
  value: unknown,
  localProducts: readonly CatalogProductDetail[],
  actor: string,
): Promise<void> {
  if (env.MERCADO_LIBRE_CATALOG_ENABLED !== 'true') return;
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new HttpError(400, 'INVALID_CART', 'El carrito no es válido.');
  }
  const productIds = value.items.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.productId !== 'string') {
      throw new HttpError(400, 'INVALID_CART_LINE', 'Una línea del carrito no es válida.');
    }
    const id = candidate.productId.trim();
    if (!/^[a-z0-9][a-z0-9-]{0,179}$/u.test(id)) {
      throw new HttpError(400, 'INVALID_PRODUCT_ID', 'El producto no es válido.');
    }
    return id;
  });
  if (productIds.length === 0 || productIds.length > 50) {
    throw new HttpError(400, 'INVALID_CART', 'El carrito no es válido.');
  }
  const itemIds = new Set<string>();
  const mappedProductIds = new Set<string>();
  for (const batch of chunk([...new Set(productIds)], 50)) {
    const placeholders = batch.map(() => '?').join(',');
    const rows = await database
      .prepare(
        `SELECT local_product_id, item_id FROM mercadolibre_catalog_units
         WHERE local_product_id IN (${placeholders})
           AND mapping_status = 'mapped' AND last_sync_status = 'ok'`,
      )
      .bind(...batch)
      .all<Readonly<{ local_product_id: string; item_id: string }>>();
    for (const row of rows.results ?? []) {
      itemIds.add(row.item_id);
      mappedProductIds.add(row.local_product_id);
    }
  }
  if (mappedProductIds.size !== new Set(productIds).size) {
    throw new HttpError(409, 'MERCADO_LIBRE_PRODUCT_UNMAPPED', 'El carrito contiene un producto sin publicación inequívoca.');
  }
  await syncMercadoLibreCatalog(database, env, actor, {
    kind: 'incremental',
    itemIds: [...itemIds],
    localProducts,
  });
}

export async function getMercadoLibreCatalogStatus(
  database: D1Database,
  env: Env,
): Promise<unknown> {
  const connection = await getMercadoLibreConnectionStatus(database);
  const latestRun = await database
    .prepare(
      `SELECT id, kind, status, processed_count, created_count, updated_count,
              unchanged_count, deactivated_count, failed_count, ambiguous_count,
              active_count, paused_count, closed_count, out_of_stock_count,
              error_code, started_at, completed_at
       FROM mercadolibre_sync_runs ORDER BY started_at DESC LIMIT 1`,
    )
    .first<Record<string, unknown>>();
  const counts = await database
    .prepare(
      `SELECT
        COUNT(*) AS unit_count,
        SUM(CASE WHEN sellable = 1 THEN 1 ELSE 0 END) AS sellable_count,
        SUM(CASE WHEN checkout_eligible = 1 THEN 1 ELSE 0 END) AS checkout_eligible_count,
        SUM(CASE WHEN mapping_status = 'unmapped' THEN 1 ELSE 0 END) AS unmapped_count,
        SUM(CASE WHEN mapping_status IN ('ambiguous', 'duplicate') THEN 1 ELSE 0 END) AS ambiguous_count,
        SUM(CASE WHEN last_sync_status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
        SUM(CASE WHEN last_sync_status = 'error' THEN 1 ELSE 0 END) AS error_count,
        SUM(CASE WHEN unixepoch(last_synced_at) <= unixepoch('now') - ? THEN 1 ELSE 0 END) AS stale_count,
        SUM(CASE WHEN available_quantity = 0 THEN 1 ELSE 0 END) AS out_of_stock_count,
        SUM(CASE WHEN available_quantity < 0 THEN 1 ELSE 0 END) AS negative_stock_count,
        SUM(CASE WHEN stock_model = 'seller_warehouse_versioned' THEN 1 ELSE 0 END) AS seller_warehouse_count,
        SUM(CASE WHEN stock_model = 'selling_address' THEN 1 ELSE 0 END) AS selling_address_count,
        SUM(CASE WHEN stock_model = 'meli_facility' THEN 1 ELSE 0 END) AS meli_facility_count,
        SUM(CASE WHEN stock_model = 'legacy_available_quantity' THEN 1 ELSE 0 END) AS legacy_count,
        SUM(CASE WHEN stock_model = 'unknown' THEN 1 ELSE 0 END) AS unknown_model_count,
        (SELECT COUNT(*) FROM (
          SELECT user_product_id FROM mercadolibre_catalog_units
          WHERE user_product_id IS NOT NULL AND last_sync_status <> 'absent'
          GROUP BY seller_id, user_product_id HAVING COUNT(*) > 1
        )) AS shared_user_product_count
       FROM mercadolibre_catalog_units`,
    )
    .bind(readMercadoLibreCatalogMaxAgeSeconds(env))
    .first<Record<string, unknown>>();
  const operations = await database
    .prepare(
      `SELECT
        SUM(CASE WHEN status IN ('pending', 'applied') THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN status IN ('compensation_pending', 'uncertain', 'failed') THEN 1 ELSE 0 END) AS attention_count,
        SUM(CASE WHEN action = 'reconcile' AND error_code = 'REFUND_REQUIRES_MANUAL_STOCK_POLICY' THEN 1 ELSE 0 END) AS refund_review_count,
        SUM(CASE WHEN action = 'reserve' AND status = 'confirmed' AND EXISTS (
          SELECT 1 FROM orders WHERE orders.id = mercadolibre_inventory_operations.order_id
            AND orders.stock_consumed_at IS NULL
            AND unixepoch(orders.stock_reservation_expires_at) > unixepoch('now')
        ) THEN 1 ELSE 0 END) AS active_reservation_count,
        SUM(CASE WHEN action = 'reserve' AND status IN ('pending', 'applied', 'confirmed', 'compensation_pending', 'uncertain') AND EXISTS (
          SELECT 1 FROM orders WHERE orders.id = mercadolibre_inventory_operations.order_id
            AND orders.stock_consumed_at IS NULL
            AND unixepoch(orders.stock_reservation_expires_at) <= unixepoch('now')
        ) THEN 1 ELSE 0 END) AS expired_reservation_count,
        SUM(CASE WHEN action = 'reserve' AND status IN ('compensation_pending', 'uncertain', 'failed') AND EXISTS (
          SELECT 1 FROM orders WHERE orders.id = mercadolibre_inventory_operations.order_id
            AND orders.status = 'approved'
        ) THEN 1 ELSE 0 END) AS approved_stock_conflict_count
       FROM mercadolibre_inventory_operations`,
    )
    .first<Record<string, unknown>>();
  return Object.freeze({
    connection,
    latestRun,
    counts: counts ?? {},
    operations: operations ?? {},
    maxAgeSeconds: readMercadoLibreCatalogMaxAgeSeconds(env),
  });
}

export async function getMappedCatalogUnit(
  database: D1Database,
  env: Env,
  localProductId: string,
): Promise<MercadoLibreCatalogUnit> {
  const unit = await getCatalogUnitForDisplay(database, env, localProductId);
  if (unit === null) {
    throw new HttpError(409, 'MERCADO_LIBRE_PRODUCT_UNMAPPED', 'El producto no tiene una publicación inequívoca.');
  }
  assertFreshUnit(unit, env);
  return unit;
}

export async function getCatalogUnitForDisplay(
  database: D1Database,
  env: Env,
  localProductId: string,
): Promise<MercadoLibreCatalogUnit | null> {
  const rows = await database
    .prepare(
      `SELECT * FROM mercadolibre_catalog_units
       WHERE local_product_id = ? AND mapping_status = 'mapped'
       ORDER BY inventory_key LIMIT 2`,
    )
    .bind(localProductId)
    .all<CatalogUnitRow>();
  if ((rows.results?.length ?? 0) !== 1) {
    return null;
  }
  const unit = parseCatalogUnit(rows.results?.[0]);
  return isFreshUnit(unit, env)
    ? unit
    : Object.freeze({ ...unit, sellable: false, checkoutEligible: false, fresh: false });
}

export async function listMappedCatalogUnits(
  database: D1Database,
  env: Env,
): Promise<readonly MercadoLibreCatalogUnit[]> {
  const result = await database
    .prepare(
      `SELECT * FROM mercadolibre_catalog_units
       WHERE mapping_status = 'mapped'
       ORDER BY local_product_id, inventory_key`,
    )
    .all<CatalogUnitRow>();
  return Object.freeze((result.results ?? []).map((row) => {
    const unit = parseCatalogUnit(row);
    return isFreshUnit(unit, env)
      ? unit
      : Object.freeze({ ...unit, sellable: false, checkoutEligible: false, fresh: false });
  }));
}

export function assertFreshUnit(unit: MercadoLibreCatalogUnit, env: Env): void {
  if (!isFreshUnit(unit, env)) {
    throw new HttpError(409, 'MERCADO_LIBRE_CATALOG_STALE', 'La disponibilidad debe actualizarse antes de continuar.');
  }
}

function isFreshUnit(unit: MercadoLibreCatalogUnit, env: Env): boolean {
  const syncedAt = Date.parse(unit.lastSyncedAt);
  return unit.lastSyncStatus === 'ok' && Number.isFinite(syncedAt) &&
    Date.now() - syncedAt <= readMercadoLibreCatalogMaxAgeSeconds(env) * 1_000;
}

async function listSellerItemIds(sellerId: string, accessToken: string): Promise<readonly string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();
  let scrollId: string | null = null;
  for (let page = 0; page < MAX_SCAN_PAGES; page += 1) {
    const url = new URL(`/users/${sellerId}/items/search`, 'https://local.invalid');
    url.searchParams.set('search_type', 'scan');
    url.searchParams.set('limit', String(SCAN_PAGE_SIZE));
    if (scrollId !== null) url.searchParams.set('scroll_id', scrollId);
    const response = await mercadoLibreApiJson(`${url.pathname}${url.search}`, accessToken);
    if (!isRecord(response.body) || !Array.isArray(response.body.results)) throw providerShapeError();
    const pageIds = normalizeItemIds(response.body.results);
    for (const id of pageIds) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    if (pageIds.length === 0) break;
    const nextScroll = safeText(response.body.scroll_id, 512);
    if (nextScroll === null || nextScroll === scrollId) break;
    scrollId = nextScroll;
  }
  if (ids.length >= MAX_SCAN_PAGES * SCAN_PAGE_SIZE) {
    throw new HttpError(502, 'MERCADO_LIBRE_PAGINATION_LIMIT', 'La cuenta excede el límite operativo de sincronización.');
  }
  return Object.freeze(ids);
}

async function fetchItemBatch(
  itemIds: readonly string[],
  accessToken: string,
  expectedSellerId: string,
): Promise<Readonly<{
  units: readonly RawUnit[];
  failed: number;
  failedItemIds: readonly string[];
}>> {
  if (itemIds.length === 0) {
    return Object.freeze({ units: [], failed: 0, failedItemIds: [] });
  }
  const url = new URL('/items', 'https://local.invalid');
  url.searchParams.set('ids', itemIds.join(','));
  url.searchParams.set('include_attributes', 'all');
  const response = await mercadoLibreApiJson(`${url.pathname}${url.search}`, accessToken);
  if (!Array.isArray(response.body)) throw providerShapeError();
  const units: RawUnit[] = [];
  const successfulItemIds = new Set<string>();
  let failed = 0;
  for (const entry of response.body) {
    if (
      !isRecord(entry) || entry.code !== 200 || !isRecord(entry.body) ||
      numericIdentifier(entry.body.seller_id) !== expectedSellerId
    ) {
      failed += 1;
      continue;
    }
    try {
      const normalized = normalizeItem(entry.body);
      units.push(...normalized);
      const normalizedItemId = normalized[0]?.itemId;
      if (normalizedItemId !== undefined) successfulItemIds.add(normalizedItemId);
    } catch {
      failed += 1;
    }
  }
  const failedItemIds = itemIds.filter((itemId) => !successfulItemIds.has(itemId));
  return Object.freeze({
    units: Object.freeze(units),
    failed: Math.max(failed, failedItemIds.length),
    failedItemIds: Object.freeze(failedItemIds),
  });
}

function normalizeItem(item: Record<string, unknown>): readonly RawUnit[] {
  const itemId = itemIdentifier(item.id);
  const title = safeText(item.title, 300);
  const currency = safeText(item.currency_id, 10);
  const status = safeText(item.status, 40);
  const sellerId = numericIdentifier(item.seller_id);
  if (itemId === null || title === null || currency === null || status === null || sellerId === null) {
    throw providerShapeError();
  }
  const variations = Array.isArray(item.variations) ? item.variations : [];
  const base = {
    itemId,
    title,
    currency,
    itemStatus: status,
    primaryImageUrl: safeHttpsUrl(item.thumbnail),
    permalink: safeHttpsUrl(item.permalink),
    providerUpdatedAt: providerDate(item.last_updated),
  } as const;
  if (variations.length === 0) {
    return Object.freeze([Object.freeze({
      ...base,
      variationId: null,
      userProductId: providerInventoryId(item.user_product_id ?? item.inventory_id),
      sellerSku: extractSku(item),
      priceMinor: providerPriceMinor(item.price),
      legacyAvailableQuantity: providerQuantity(item.available_quantity),
    })]);
  }
  return Object.freeze(variations.map((candidate) => {
    if (!isRecord(candidate)) throw providerShapeError();
    const variationId = numericIdentifier(candidate.id);
    if (variationId === null) throw providerShapeError();
    return Object.freeze({
      ...base,
      variationId,
      userProductId: providerInventoryId(candidate.user_product_id ?? candidate.inventory_id),
      sellerSku: extractSku(candidate),
      priceMinor: providerPriceMinor(candidate.price ?? item.price),
      legacyAvailableQuantity: providerQuantity(candidate.available_quantity),
    });
  }));
}

async function enrichStock(
  unit: RawUnit,
  sellerId: string,
  accessToken: string,
): Promise<EnrichedUnit> {
  if (unit.userProductId === null) {
    return Object.freeze({
      ...unit,
      sellerId,
      availableQuantity: unit.legacyAvailableQuantity,
      stockModel: 'legacy_available_quantity',
      stockLocationId: null,
      upstreamVersion: null,
      stockLocations: Object.freeze([]),
      stockErrorCode: null,
    });
  }
  try {
    const response = await mercadoLibreApiJson(`/user-products/${encodeURIComponent(unit.userProductId)}/stock`, accessToken);
    if (!isRecord(response.body) || !Array.isArray(response.body.locations)) throw providerShapeError();
    const locations = Object.freeze(response.body.locations.map(normalizeLocation));
    const types = new Set(locations.map((location) => location.type));
    const version = safeText(response.headers.get('x-version'), 256);
    const stockModel: MercadoLibreStockModel =
      types.size === 1 && types.has('seller_warehouse') && version !== null
        ? 'seller_warehouse_versioned'
        : types.has('meli_facility')
          ? 'meli_facility'
          : types.has('selling_address')
            ? 'selling_address'
            : 'unknown';
    return Object.freeze({
      ...unit,
      sellerId,
      availableQuantity: locations.reduce((sum, location) => sum + location.quantity, 0),
      stockModel,
      stockLocationId: locations.length === 1 ? locations[0]?.id ?? null : null,
      upstreamVersion: version,
      stockLocations: locations,
      stockErrorCode: null,
    });
  } catch (error: unknown) {
    if (error instanceof HttpError && error.code === 'MERCADO_LIBRE_PROVIDER_REJECTED') {
      return Object.freeze({
        ...unit,
        sellerId,
        availableQuantity: unit.legacyAvailableQuantity,
        stockModel: 'unknown',
        stockLocationId: null,
        upstreamVersion: null,
        stockLocations: Object.freeze([]),
        stockErrorCode: 'MERCADO_LIBRE_STOCK_MODEL_UNAVAILABLE',
      });
    }
    throw error;
  }
}

function unavailableStockUnit(unit: RawUnit, sellerId: string, code: string): EnrichedUnit {
  return Object.freeze({
    ...unit,
    sellerId,
    availableQuantity: 0,
    stockModel: 'unknown',
    stockLocationId: null,
    upstreamVersion: null,
    stockLocations: Object.freeze([]),
    stockErrorCode: code,
  });
}

async function mapCatalogUnits(
  units: readonly EnrichedUnit[],
  sellerId: string,
  localProducts: readonly CatalogProductDetail[],
  syncedAt: string,
): Promise<readonly MercadoLibreCatalogUnit[]> {
  const localBySku = new Map<string, string[]>();
  for (const product of localProducts) {
    const sku = normalizeSku(product.sku);
    if (sku === null) continue;
    const ids = localBySku.get(sku) ?? [];
    ids.push(product.id);
    localBySku.set(sku, ids);
  }
  const providerSkuCounts = new Map<string, number>();
  const providerInventoryCounts = new Map<string, number>();
  for (const unit of units) {
    const sku = normalizeSku(unit.sellerSku);
    if (sku !== null) providerSkuCounts.set(sku, (providerSkuCounts.get(sku) ?? 0) + 1);
    if (unit.userProductId !== null) {
      providerInventoryCounts.set(
        unit.userProductId,
        (providerInventoryCounts.get(unit.userProductId) ?? 0) + 1,
      );
    }
  }
  const initial = await Promise.all(units.map(async (unit) => {
    const sku = normalizeSku(unit.sellerSku);
    const candidates = sku === null ? [] : localBySku.get(sku) ?? [];
    const mappingStatus: MercadoLibreCatalogUnit['mappingStatus'] =
      sku === null || candidates.length === 0
        ? 'unmapped'
        : candidates.length > 1
          ? 'ambiguous'
          : (providerSkuCounts.get(sku) ?? 0) > 1 ||
              (unit.userProductId !== null && (providerInventoryCounts.get(unit.userProductId) ?? 0) > 1)
            ? 'duplicate'
            : 'mapped';
    const localProductId = mappingStatus === 'mapped' ? candidates[0] ?? null : null;
    const inventoryKey = await sha256Hex([
      sellerId, unit.itemId, unit.variationId ?? '', unit.userProductId ?? '',
    ].join('|'));
    const catalogVersion = await sha256Hex(JSON.stringify({
      itemId: unit.itemId,
      variationId: unit.variationId,
      userProductId: unit.userProductId,
      priceMinor: unit.priceMinor,
      currency: unit.currency,
      status: unit.itemStatus,
      availableQuantity: unit.availableQuantity,
      version: unit.upstreamVersion,
      providerUpdatedAt: unit.providerUpdatedAt,
    }));
    const active = unit.itemStatus === 'active';
    const sellable = unit.stockErrorCode === null && mappingStatus === 'mapped' && active && unit.availableQuantity > 0 && unit.priceMinor > 0;
    const checkoutEligible = sellable &&
      unit.stockModel === 'seller_warehouse_versioned' &&
      unit.upstreamVersion !== null &&
      unit.stockLocations.length > 0;
    return Object.freeze({
      inventoryKey,
      sellerId,
      itemId: unit.itemId,
      variationId: unit.variationId,
      userProductId: unit.userProductId,
      sellerSku: unit.sellerSku,
      localProductId,
      title: unit.title,
      priceMinor: unit.priceMinor,
      currency: unit.currency,
      itemStatus: unit.itemStatus,
      availableQuantity: unit.availableQuantity,
      stockModel: unit.stockModel,
      stockLocationId: unit.stockLocationId,
      upstreamVersion: unit.upstreamVersion,
      stockLocations: unit.stockLocations,
      primaryImageUrl: unit.primaryImageUrl,
      permalink: unit.permalink,
      providerUpdatedAt: unit.providerUpdatedAt,
      catalogVersion,
      mappingStatus,
      sellable,
      checkoutEligible,
      lastSyncStatus: unit.stockErrorCode === null ? 'ok' as const : 'error' as const,
      lastSyncErrorCode: unit.stockErrorCode,
      lastSyncedAt: syncedAt,
      fresh: true,
    });
  }));
  const localCounts = new Map<string, number>();
  for (const unit of initial) {
    if (unit.localProductId !== null) {
      localCounts.set(unit.localProductId, (localCounts.get(unit.localProductId) ?? 0) + 1);
    }
  }
  return Object.freeze(initial.map((unit) =>
    unit.localProductId !== null && (localCounts.get(unit.localProductId) ?? 0) > 1
      ? Object.freeze({
          ...unit,
          localProductId: null,
          mappingStatus: 'duplicate' as const,
          sellable: false,
          checkoutEligible: false,
        })
      : unit));
}

async function writeUnits(
  database: D1Database,
  units: readonly MercadoLibreCatalogUnit[],
  now: string,
): Promise<void> {
  for (const batch of chunk(units, 50)) {
    const statements: D1PreparedStatement[] = batch.map((unit) => database
      .prepare(
        `INSERT INTO mercadolibre_catalog_units (
          inventory_key, seller_id, item_id, variation_id, user_product_id,
          seller_sku, local_product_id, title, price_minor, currency, item_status,
          available_quantity, stock_model, stock_location_id, upstream_version,
          stock_snapshot_json, primary_image_url, permalink, provider_updated_at,
          catalog_version, mapping_status, sellable, checkout_eligible,
          last_sync_status, last_sync_error_code, last_synced_at, absent_since,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
        ON CONFLICT(inventory_key) DO UPDATE SET
          seller_sku = excluded.seller_sku,
          local_product_id = excluded.local_product_id,
          title = excluded.title,
          price_minor = excluded.price_minor,
          currency = excluded.currency,
          item_status = excluded.item_status,
          available_quantity = excluded.available_quantity,
          stock_model = excluded.stock_model,
          stock_location_id = excluded.stock_location_id,
          upstream_version = excluded.upstream_version,
          stock_snapshot_json = excluded.stock_snapshot_json,
          primary_image_url = excluded.primary_image_url,
          permalink = excluded.permalink,
          provider_updated_at = excluded.provider_updated_at,
          catalog_version = excluded.catalog_version,
          mapping_status = excluded.mapping_status,
          sellable = excluded.sellable,
          checkout_eligible = excluded.checkout_eligible,
          last_sync_status = excluded.last_sync_status,
          last_sync_error_code = excluded.last_sync_error_code,
          last_synced_at = excluded.last_synced_at,
          absent_since = NULL,
          updated_at = excluded.updated_at`,
      )
      .bind(
        unit.inventoryKey, unit.sellerId, unit.itemId, unit.variationId,
        unit.userProductId, unit.sellerSku, unit.localProductId, unit.title,
        unit.priceMinor, unit.currency, unit.itemStatus, unit.availableQuantity,
        unit.stockModel, unit.stockLocationId, unit.upstreamVersion,
        JSON.stringify(unit.stockLocations), unit.primaryImageUrl, unit.permalink,
        unit.providerUpdatedAt, unit.catalogVersion, unit.mappingStatus,
        unit.sellable ? 1 : 0, unit.checkoutEligible ? 1 : 0,
        unit.lastSyncStatus, unit.lastSyncErrorCode, unit.lastSyncedAt, now, now,
      ));
    if (statements.length > 0) await database.batch(statements);
  }
}

async function markPersistedMappingConflicts(
  database: D1Database,
  sellerId: string,
  now: string,
): Promise<void> {
  await database
    .prepare(
      `UPDATE mercadolibre_catalog_units
       SET mapping_status = 'duplicate', local_product_id = NULL,
           sellable = 0, checkout_eligible = 0, updated_at = ?
       WHERE seller_id = ? AND last_sync_status = 'ok' AND (
         (seller_sku IS NOT NULL AND seller_sku IN (
           SELECT seller_sku FROM mercadolibre_catalog_units
           WHERE seller_id = ? AND last_sync_status = 'ok' AND seller_sku IS NOT NULL
           GROUP BY seller_sku HAVING COUNT(*) > 1
         ))
         OR
         (user_product_id IS NOT NULL AND user_product_id IN (
           SELECT user_product_id FROM mercadolibre_catalog_units
           WHERE seller_id = ? AND last_sync_status = 'ok' AND user_product_id IS NOT NULL
           GROUP BY user_product_id HAVING COUNT(*) > 1
         ))
       )`,
    )
    .bind(now, sellerId, sellerId, sellerId)
    .run();
}

async function readExistingVersions(
  database: D1Database,
  inventoryKeys: readonly string[],
): Promise<ReadonlyMap<string, Readonly<{
  catalogVersion: string;
  mappingStatus: string;
  lastSyncStatus: string;
}>>> {
  const result = new Map<string, Readonly<{
    catalogVersion: string;
    mappingStatus: string;
    lastSyncStatus: string;
  }>>();
  for (const batch of chunk(inventoryKeys, 50)) {
    if (batch.length === 0) continue;
    const placeholders = batch.map(() => '?').join(',');
    const rows = await database
      .prepare(
        `SELECT inventory_key, catalog_version, mapping_status, last_sync_status
         FROM mercadolibre_catalog_units WHERE inventory_key IN (${placeholders})`,
      )
      .bind(...batch)
      .all<Readonly<{
        inventory_key: string;
        catalog_version: string;
        mapping_status: string;
        last_sync_status: string;
      }>>();
    for (const row of rows.results ?? []) {
      result.set(row.inventory_key, {
        catalogVersion: row.catalog_version,
        mappingStatus: row.mapping_status,
        lastSyncStatus: row.last_sync_status,
      });
    }
  }
  return result;
}

async function finishSyncRun(database: D1Database, summary: MercadoLibreSyncSummary): Promise<void> {
  await database
    .prepare(
      `UPDATE mercadolibre_sync_runs SET
        status = ?, processed_count = ?, created_count = ?, updated_count = ?,
        unchanged_count = ?, deactivated_count = ?, failed_count = ?,
        ambiguous_count = ?, active_count = ?, paused_count = ?, closed_count = ?,
        out_of_stock_count = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      summary.status, summary.processed, summary.created, summary.updated,
      summary.unchanged, summary.deactivated, summary.failed, summary.ambiguous,
      summary.active, summary.paused, summary.closed, summary.outOfStock,
      summary.completedAt, summary.completedAt, summary.runId,
    )
    .run();
}

function parseCatalogUnit(row: CatalogUnitRow | undefined): MercadoLibreCatalogUnit {
  if (row === undefined) throw new Error('Unidad de catálogo ausente.');
  let stockLocations: readonly StockLocation[];
  try {
    const value = JSON.parse(row.stock_snapshot_json) as unknown;
    if (!Array.isArray(value)) throw new Error('Snapshot inválido.');
    stockLocations = Object.freeze(value.map((entry) => {
      if (!isRecord(entry)) throw new Error('Snapshot inválido.');
      return normalizeLocation(entry);
    }));
  } catch (error: unknown) {
    throw new Error('Snapshot de stock persistido inválido.', { cause: error });
  }
  return Object.freeze({
    inventoryKey: row.inventory_key,
    sellerId: row.seller_id,
    itemId: row.item_id,
    variationId: row.variation_id,
    userProductId: row.user_product_id,
    sellerSku: row.seller_sku,
    localProductId: row.local_product_id,
    title: row.title,
    priceMinor: row.price_minor,
    currency: row.currency,
    itemStatus: row.item_status,
    availableQuantity: row.available_quantity,
    stockModel: row.stock_model,
    stockLocationId: row.stock_location_id,
    upstreamVersion: row.upstream_version,
    stockLocations,
    primaryImageUrl: row.primary_image_url,
    permalink: row.permalink,
    providerUpdatedAt: row.provider_updated_at,
    catalogVersion: row.catalog_version,
    mappingStatus: row.mapping_status,
    sellable: row.sellable === 1,
    checkoutEligible: row.checkout_eligible === 1,
    lastSyncStatus: row.last_sync_status,
    lastSyncErrorCode: row.last_sync_error_code,
    lastSyncedAt: row.last_synced_at,
    fresh: true,
  });
}

function normalizeLocation(value: unknown): StockLocation {
  if (!isRecord(value)) throw providerShapeError();
  const type = safeText(value.type, 80);
  const id = safeText(
    value.store_id ?? value.network_node_id ?? value.location_id ?? value.id,
    120,
  );
  const quantity = providerQuantity(value.quantity);
  if (type === null || id === null) throw providerShapeError();
  return Object.freeze({ type, id, quantity });
}

function extractSku(value: Record<string, unknown>): string | null {
  const direct = safeText(value.seller_custom_field, 180);
  if (direct !== null) return direct;
  if (!Array.isArray(value.attributes)) return null;
  for (const candidate of value.attributes) {
    if (!isRecord(candidate) || candidate.id !== 'SELLER_SKU') continue;
    return safeText(candidate.value_name ?? candidate.value_id, 180);
  }
  return null;
}

function normalizeSku(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim().toLocaleUpperCase('en');
  return normalized === '' ? null : normalized;
}

function providerPriceMinor(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw providerShapeError();
  const minor = Math.round(value * 100);
  if (!Number.isSafeInteger(minor)) throw providerShapeError();
  return minor;
}

function providerQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw providerShapeError();
  return value;
}

function providerDate(value: unknown): string | null {
  const text = safeText(value, 80);
  return text !== null && !Number.isNaN(Date.parse(text)) ? new Date(text).toISOString() : null;
}

function providerInventoryId(value: unknown): string | null {
  const text = safeText(value, 120);
  return text !== null && /^[A-Za-z0-9._:-]+$/u.test(text) ? text : null;
}

function itemIdentifier(value: unknown): string | null {
  const text = safeText(value, 40);
  return text !== null && /^MLA\d{5,30}$/u.test(text) ? text : null;
}

function numericIdentifier(value: unknown): string | null {
  const text = typeof value === 'number' && Number.isSafeInteger(value)
    ? String(value)
    : safeText(value, 30);
  return text !== null && /^\d{1,30}$/u.test(text) ? text : null;
}

function normalizeItemIds(values: readonly unknown[]): readonly string[] {
  const ids = values.map(itemIdentifier);
  if (ids.some((id) => id === null)) throw providerShapeError();
  return Object.freeze(ids as string[]);
}

function safeText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized !== '' && normalized.length <= maximum ? normalized : null;
}

function safeHttpsUrl(value: unknown): string | null {
  const text = safeText(value, 2_048);
  if (text === null) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && url.username === '' && url.password === ''
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function providerShapeError(): HttpError {
  return new HttpError(502, 'MERCADO_LIBRE_RESPONSE_INVALID', 'Mercado Libre devolvió una respuesta no válida.');
}

function errorCode(error: unknown): string {
  return error instanceof HttpError ? error.code : 'MERCADO_LIBRE_SYNC_FAILED';
}

function chunk<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<readonly R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) results[index] = await mapper(value);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return Object.freeze(results);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
