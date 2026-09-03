import type { D1Database } from './platform';

export type MercadoLibreMatchingUnit = Readonly<{
  itemId: string;
  variationId: string | null;
  sellerSku: string | null;
  localProductId: string | null;
  title: string;
  itemStatus: string;
  primaryImageUrl: string | null;
  permalink: string | null;
  mappingStatus: 'mapped' | 'unmapped' | 'ambiguous' | 'duplicate';
  lastSyncStatus: 'ok' | 'error';
  lastSyncedAt: string;
}>;

export type MercadoLibreMatchingSource = Readonly<{
  available: boolean;
  connectionPresent: boolean;
  sellerId: string | null;
  nickname: string | null;
  lastVerifiedAt: string | null;
  latestRunStatus: string | null;
  latestRunCompletedAt: string | null;
  latestSyncedAt: string | null;
  freshByLegacyThreshold: boolean;
  maximumAgeSeconds: number;
  invalidRowCount: number;
  units: readonly MercadoLibreMatchingUnit[];
}>;

type MercadoLibreConnectionRow = Readonly<{
  seller_id: unknown;
  nickname: unknown;
  last_verified_at: unknown;
}>;

type MercadoLibreRunRow = Readonly<{
  status: unknown;
  completed_at: unknown;
}>;

type MercadoLibreUnitRow = Readonly<{
  item_id: unknown;
  variation_id: unknown;
  seller_sku: unknown;
  local_product_id: unknown;
  title: unknown;
  item_status: unknown;
  primary_image_url: unknown;
  permalink: unknown;
  mapping_status: unknown;
  last_sync_status: unknown;
  last_synced_at: unknown;
}>;

/**
 * Lee únicamente el mirror histórico de Mercado Libre almacenado en D1.
 * No renueva OAuth, no consulta APIs externas y no habilita inventario directo.
 */
export async function readMercadoLibreMatchingSource(
  database: D1Database,
  maximumAgeSeconds: number,
  now = new Date(),
): Promise<MercadoLibreMatchingSource> {
  try {
    const connection = await database
      .prepare(
        `SELECT seller_id, nickname, last_verified_at
         FROM mercadolibre_connections WHERE id = 1`,
      )
      .first<MercadoLibreConnectionRow>();
    const latestRun = await database
      .prepare(
        `SELECT status, completed_at
         FROM mercadolibre_sync_runs
         ORDER BY started_at DESC, id DESC LIMIT 1`,
      )
      .first<MercadoLibreRunRow>();
    const rows = await database
      .prepare(
        `SELECT item_id, variation_id, seller_sku, local_product_id,
                title, item_status, primary_image_url, permalink,
                mapping_status, last_sync_status, last_synced_at
         FROM mercadolibre_catalog_units
         WHERE last_sync_status <> 'absent'
         ORDER BY item_id, variation_id, inventory_key`,
      )
      .all<MercadoLibreUnitRow>();

    const units: MercadoLibreMatchingUnit[] = [];
    let invalidRowCount = 0;
    for (const row of rows.results ?? []) {
      const parsed = parseMercadoLibreUnit(row);
      if (parsed === null) invalidRowCount += 1;
      else units.push(parsed);
    }
    const latestSyncedAt = maximumTimestamp(units.map((unit) => unit.lastSyncedAt));
    const latestMilliseconds = latestSyncedAt === null
      ? Number.NaN
      : Date.parse(latestSyncedAt);
    const freshByLegacyThreshold = Number.isFinite(latestMilliseconds) &&
      now.getTime() - latestMilliseconds <= maximumAgeSeconds * 1_000;

    return Object.freeze({
      available: units.length > 0,
      connectionPresent: connection !== null,
      sellerId: optionalDatabaseText(connection?.seller_id, 80),
      nickname: optionalDatabaseText(connection?.nickname, 300),
      lastVerifiedAt: optionalTimestamp(connection?.last_verified_at),
      latestRunStatus: optionalDatabaseText(latestRun?.status, 80),
      latestRunCompletedAt: optionalTimestamp(latestRun?.completed_at),
      latestSyncedAt,
      freshByLegacyThreshold,
      maximumAgeSeconds,
      invalidRowCount,
      units: Object.freeze(units),
    });
  } catch (error: unknown) {
    if (!isMissingMercadoLibreTable(error)) throw error;
    return emptyMercadoLibreSource(maximumAgeSeconds);
  }
}

function parseMercadoLibreUnit(
  row: MercadoLibreUnitRow,
): MercadoLibreMatchingUnit | null {
  const itemId = requiredDatabaseText(row.item_id, 80);
  const title = requiredDatabaseText(row.title, 500);
  const itemStatus = requiredDatabaseText(row.item_status, 80);
  const mappingStatus = row.mapping_status;
  const lastSyncStatus = row.last_sync_status;
  const lastSyncedAt = optionalTimestamp(row.last_synced_at);
  if (
    itemId === null ||
    title === null ||
    itemStatus === null ||
    lastSyncedAt === null ||
    (mappingStatus !== 'mapped' && mappingStatus !== 'unmapped' &&
      mappingStatus !== 'ambiguous' && mappingStatus !== 'duplicate') ||
    (lastSyncStatus !== 'ok' && lastSyncStatus !== 'error')
  ) {
    return null;
  }
  return Object.freeze({
    itemId,
    variationId: optionalDatabaseText(row.variation_id, 80),
    sellerSku: optionalDatabaseText(row.seller_sku, 300),
    localProductId: optionalDatabaseText(row.local_product_id, 180),
    title,
    itemStatus,
    primaryImageUrl: optionalHttpsUrl(row.primary_image_url),
    permalink: optionalHttpsUrl(row.permalink),
    mappingStatus,
    lastSyncStatus,
    lastSyncedAt,
  });
}

function emptyMercadoLibreSource(
  maximumAgeSeconds: number,
): MercadoLibreMatchingSource {
  return Object.freeze({
    available: false,
    connectionPresent: false,
    sellerId: null,
    nickname: null,
    lastVerifiedAt: null,
    latestRunStatus: null,
    latestRunCompletedAt: null,
    latestSyncedAt: null,
    freshByLegacyThreshold: false,
    maximumAgeSeconds,
    invalidRowCount: 0,
    units: Object.freeze([]),
  });
}

function requiredDatabaseText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized !== '' && normalized.length <= maximum ? normalized : null;
}

function optionalDatabaseText(value: unknown, maximum: number): string | null {
  if (value === null || value === undefined || value === '') return null;
  return requiredDatabaseText(value, maximum);
}

function optionalTimestamp(value: unknown): string | null {
  const text = optionalDatabaseText(value, 100);
  if (text === null || Number.isNaN(Date.parse(text))) return null;
  return new Date(text).toISOString() === text ? text : null;
}

function optionalHttpsUrl(value: unknown): string | null {
  const text = optionalDatabaseText(value, 2_048);
  if (text === null) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && url.username === '' && url.password === ''
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function maximumTimestamp(values: readonly string[]): string | null {
  const valid = values.filter((value) => !Number.isNaN(Date.parse(value))).sort();
  return valid[valid.length - 1] ?? null;
}

function isMissingMercadoLibreTable(error: unknown): boolean {
  return error instanceof Error && /no such table:\s*mercadolibre_/iu.test(error.message);
}
