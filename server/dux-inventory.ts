import type { CatalogProductDetail } from '../src/catalog/model';
import { readDuxSnapshotMaxAgeSeconds, requireDuxApiEnabled } from './config';
import { sha256Hex } from './crypto';
import {
  DuxApiClient,
  DUX_MAX_ITEMS_PER_SYNC,
  type DuxBranch,
  type DuxCompany,
  type DuxItem,
  type DuxItemStock,
  type DuxWarehouse,
} from './dux-api';
import { HttpError } from './http';
import type { D1Database, D1PreparedStatement, Env } from './platform';

const SYNC_LEASE_MAX_AGE_MINUTES = 30;
const DUX_REQUEST_MIN_INTERVAL_MS = 5_000;
const STAGING_ROWS_PER_STATEMENT = 50;
const DUX_REQUESTS_PER_HEARTBEAT = 10;
const DUX_D1_DAILY_ESTIMATED_WRITE_LIMIT = 40_000;
const DUX_D1_CONSTANT_WRITE_RESERVATION = 64;
const DUX_D1_CHANGED_ROW_WRITE_RESERVATION = 14;
export const DUX_STAGING_JSON_MAX_BYTES = 1_900_000;
const DUX_INVENTORY_KEY_MAX_BYTES = 1_000;
const DUX_API_VERSION = 'v2';
const QUANTITY_SEMANTICS_STATUS = 'unavailable_from_v2_items';
const PRESENTATION_QUANTITY_PATTERN =
  /(?<![\p{L}\p{N}])(\d+(?:[.,]\d+)?)\s*(kilogramos?|kilos?|kgs?|kg|gramos?|grs?|gr|g|litros?|lts?|lt|l|cc|ml)(?![\p{L}\p{N}])/giu;
const PRESENTATION_SEPARATOR_PATTERN =
  /(^|\s)[x×](?=\s*\d+(?:[.,]\d+)?\s*(?:kilogramos?|kilos?|kgs?|kg|gramos?|grs?|gr|g|litros?|lts?|lt|l|cc|ml)(?![\p{L}\p{N}]))/giu;
const CANONICAL_PRESENTATION_PATTERN =
  /(?<![\p{L}\p{N}])(\d+(?:\.\d+)?)\s(g|ml)(?![\p{L}\p{N}])/gu;

export type DuxSyncKind = 'initial' | 'full' | 'manual' | 'scheduled';
export type DuxMappingStatus = 'mapped' | 'unmapped' | 'ambiguous';
export type DuxMappingSource =
  | 'persisted'
  | 'codigo_externo'
  | 'sku'
  | 'cod_barra'
  | 'exact_name'
  | 'manual';
export type DuxLastSyncStatus = 'ok' | 'error' | 'absent';

export type DuxInventoryConfig = Readonly<{
  accessToken: string;
  companyId: number;
  branchId: number;
  depositId: number;
}>;

export type DuxInventoryReader = Readonly<{
  listEmpresas: () => Promise<readonly DuxCompany[]>;
  listSucursales: (companyId: number) => Promise<readonly DuxBranch[]>;
  listDepositos: (warehouseId?: number) => Promise<readonly DuxWarehouse[]>;
  listItems: (options?: Readonly<{ warehouseId?: number; enabled?: boolean }>) => Promise<readonly DuxItem[]>;
}>;

export type DuxTenantContext = Readonly<{
  apiVersion: 'v2';
  companyId: string;
  companyName: string;
  branchId: string;
  branchName: string;
  depositId: string;
  depositName: string;
  verifiedAt: string;
}>;

export type DuxInventoryUnit = Readonly<{
  inventoryKey: string;
  itemCode: string;
  variantDetailId: string | null;
  externalCode: string | null;
  barcode: string | null;
  itemName: string;
  localProductId: string | null;
  mappingStatus: DuxMappingStatus;
  mappingSource: DuxMappingSource | null;
  mappingCandidates: readonly string[];
  depositId: string;
  depositName: string;
  observedStock: Readonly<{
    real: number;
    reserved: number;
    available: number;
  }>;
  unitsPerPackage: number | null;
  unit: null;
  isWeighable: null;
  allowsDecimal: null;
  commercialQuantityStep: null;
  quantitySemanticsStatus: typeof QUANTITY_SEMANTICS_STATUS;
  checkoutEligible: false;
  catalogVersion: string;
  lastSyncStatus: DuxLastSyncStatus;
  lastSyncErrorCode: string | null;
  lastSyncedAt: string;
  absentSince: string | null;
  fresh: boolean;
}>;

export type DuxSyncSummary = Readonly<{
  runId: string;
  status: 'succeeded' | 'partial' | 'failed';
  processed: number;
  mapped: number;
  unmapped: number;
  ambiguous: number;
  absent: number;
  failed: number;
  localProductsPreserved: number;
  startedAt: string;
  completedAt: string;
}>;

export type DuxInventoryStatus = Readonly<{
  tenant: DuxTenantContext | null;
  latestRun: Readonly<{
    id: string;
    kind: DuxSyncKind;
    status: 'running' | 'succeeded' | 'partial' | 'failed';
    processed: number;
    mapped: number;
    unmapped: number;
    ambiguous: number;
    absent: number;
    failed: number;
    errorCode: string | null;
    startedAt: string;
    completedAt: string | null;
  }> | null;
  counts: Readonly<{
    inventory: number;
    mapped: number;
    unmapped: number;
    ambiguous: number;
    absent: number;
    errors: number;
    stale: number;
    negativeStock: number;
    checkoutEligible: 0;
  }>;
  maxAgeSeconds: number;
}>;

type SyncOptions = Readonly<{
  kind?: DuxSyncKind;
  localProducts: readonly CatalogProductDetail[];
  client?: DuxInventoryReader;
  now?: () => Date;
  createRunId?: () => string;
}>;

type MappingDecision = Readonly<{
  status: DuxMappingStatus;
  source: DuxMappingSource | null;
  localProductId: string | null;
  candidates: readonly string[];
}>;

type PendingInventoryUnit = Readonly<{
  inventoryKey: string;
  item: DuxItem;
  stock: DuxItemStock;
  mapping: MappingDecision;
}>;

type PersistableInventoryUnit = PendingInventoryUnit & Readonly<{
  tenant: DuxTenantContext;
  barcode: string | null;
  rawSnapshot: string;
  catalogVersion: string;
  syncedAt: string;
}>;

type InventoryPublicationPayload = Readonly<{
  inventoryKey: string;
  itemCode: string;
  variantDetailId: string | null;
  externalCode: string | null;
  barcode: string | null;
  itemName: string;
  localProductId: string | null;
  mappingStatus: DuxMappingStatus;
  mappingSource: DuxMappingSource | null;
  mappingCandidatesJson: string;
  depositId: string;
  depositName: string;
  stockReal: number;
  stockReserved: number;
  stockAvailable: number;
  unitsPerPackage: number | null;
  unitId: string | null;
  unitName: string | null;
  unitSymbol: string | null;
  isWeighable: 0 | 1 | null;
  allowsDecimal: 0 | 1 | null;
  commercialQuantityStep: number | null;
  quantitySemanticsStatus: string;
  checkoutEligible: 0 | 1;
  catalogVersion: string;
  rawSnapshot: string;
  lastSyncStatus: DuxLastSyncStatus;
  lastSyncErrorCode: string | null;
  absentSince: string | null;
}>;

type PublishedInventoryIndexEntry = Readonly<{
  signature: string;
  lastSyncStatus: DuxLastSyncStatus;
}>;

type MappedInventoryItems = Readonly<{
  units: readonly PendingInventoryUnit[];
  missingStockCount: number;
}>;

type PersistedMappingRow = Readonly<{
  inventory_key: unknown;
  local_product_id: unknown;
  mapping_status: unknown;
  mapping_source: unknown;
  mapping_candidates_json: unknown;
}>;

type InventoryRow = Readonly<Record<string, unknown>>;

export function readDuxInventoryConfig(env: Env): DuxInventoryConfig {
  requireDuxApiEnabled(env);
  const accessToken = env.DUX_API_TOKEN;
  if (
    typeof accessToken !== 'string' ||
    accessToken.length === 0 ||
    accessToken.length > 4_096 ||
    accessToken.trim() !== accessToken
  ) {
    throw new HttpError(503, 'DUX_TOKEN_INVALID', 'Dux no está configurado correctamente.');
  }
  return Object.freeze({
    accessToken,
    companyId: readPositiveEnvIdentifier(env.DUX_COMPANY_ID, 'DUX_COMPANY_ID'),
    branchId: readPositiveEnvIdentifier(env.DUX_BRANCH_ID, 'DUX_BRANCH_ID'),
    depositId: readPositiveEnvIdentifier(env.DUX_DEPOSIT_ID, 'DUX_DEPOSIT_ID'),
  });
}

export async function syncDuxInventory(
  database: D1Database,
  env: Env,
  actor: string,
  options: SyncOptions,
): Promise<DuxSyncSummary> {
  const config = readDuxInventoryConfig(env);
  const safeActor = requiredDatabaseText(actor, 500, 'DUX_SYNC_ACTOR_INVALID');
  const kind = parseSyncKind(options.kind ?? 'full');
  const now = options.now ?? (() => new Date());
  const startedAt = validNow(now);
  const runId = options.createRunId?.() ?? `dux_sync_${crypto.randomUUID()}`;
  if (!/^dux_sync_[A-Za-z0-9._:-]{1,180}$/u.test(runId)) {
    throw new HttpError(500, 'DUX_SYNC_ID_INVALID', 'No se pudo identificar la sincronización Dux.');
  }
  const client = options.client ?? new DuxApiClient({
    accessToken: config.accessToken,
    beforeRequest: periodicSyncHeartbeat(database, runId),
  });

  await recoverAbandonedSync(database, startedAt);
  const claimed = await database
    .prepare(
      `INSERT OR IGNORE INTO dux_sync_runs (
        id, kind, status, trigger_actor, started_at, created_at, updated_at
      ) VALUES (?1, ?2, 'running', ?3, ?4, ?4, ?4)
      RETURNING id`,
    )
    .bind(runId, kind, safeActor, startedAt)
    .first<Readonly<{ id: unknown }>>();
  if (claimed === null || claimed.id !== runId) {
    throw new HttpError(409, 'DUX_SYNC_IN_PROGRESS', 'Ya existe una sincronización Dux en curso.');
  }

  try {
    await beginInventoryGeneration(database, runId, startedAt);
    await assertDuxSyncCooldown(database, validNow(now));
    const tenant = await verifyTenant(client, config, startedAt);
    const items = await client.listItems({ warehouseId: config.depositId, enabled: true });
    const mappedItems = await mapInventoryItems(
      database,
      config,
      items,
      options.localProducts,
      kind === 'initial',
    );
    if (mappedItems.units.length > DUX_MAX_ITEMS_PER_SYNC) {
      throw new HttpError(
        502,
        'DUX_INVENTORY_UNIT_LIMIT',
        'Dux excedió el límite operativo de identidades de inventario.',
      );
    }
    const rows = await Promise.all(mappedItems.units.map((unit) => (
      persistableUnit(unit, tenant, startedAt)
    )));
    const publishedInventory = await readPublishedInventoryIndex(database);
    const currentKeys = new Set(rows.map((row) => row.inventoryKey));
    const changedRows = rows.filter((row) => {
      const published = publishedInventory.get(row.inventoryKey);
      return published?.signature !== inventoryPublicationSignature(
        inventoryPublicationPayload(row),
      );
    });
    const absent = [...publishedInventory.keys()].filter((key) => !currentKeys.has(key)).length;
    const newlyAbsent = [...publishedInventory.entries()].filter(([key, published]) => (
      !currentKeys.has(key) && published.lastSyncStatus !== 'absent'
    )).length;
    await reserveD1WriteBudget(
      database,
      startedAt,
      changedRows.length + newlyAbsent,
    );
    await writeInventoryGenerationRows(database, runId, changedRows, startedAt);
    if (newlyAbsent > 0) {
      await stageAbsentInventoryRows(database, runId, currentKeys, startedAt);
    }
    const mapped = rows.filter((row) => row.mapping.status === 'mapped').length;
    const unmapped = rows.filter((row) => row.mapping.status === 'unmapped').length;
    const ambiguous = rows.filter((row) => row.mapping.status === 'ambiguous').length;
    const failed = mappedItems.missingStockCount;
    const status = failed === 0 ? 'succeeded' : 'partial';
    const completedAt = validNow(now);
    const summary = Object.freeze({
      runId,
      status,
      processed: rows.length + failed,
      mapped,
      unmapped,
      ambiguous,
      absent,
      failed,
      localProductsPreserved: options.localProducts.length,
      startedAt,
      completedAt,
    });
    try {
      await publishInventoryGeneration(
        database,
        runId,
        tenant,
        summary,
        changedRows.length + newlyAbsent,
      );
    } catch (error: unknown) {
      if (await isInventoryGenerationPublished(database, runId)) return summary;
      throw error;
    }
    return summary;
  } catch (error: unknown) {
    const completedAt = safeNow(now);
    await failInventoryGeneration(database, runId, providerErrorCode(error), completedAt);
    throw error;
  }
}

async function assertDuxSyncCooldown(database: D1Database, startedAt: string): Promise<void> {
  const latest = await database
    .prepare(
      `SELECT completed_at
       FROM dux_sync_runs
       WHERE completed_at IS NOT NULL
         AND COALESCE(error_code, '') NOT IN ('DUX_SYNC_COOLDOWN', 'DUX_SYNC_ABANDONED')
       ORDER BY completed_at DESC, id DESC
       LIMIT 1`,
    )
    .first<Readonly<{ completed_at: unknown }>>();
  if (latest === null) return;

  const completedAt = nullableDatabaseTimestamp(latest.completed_at);
  if (completedAt === null) return;
  const elapsedMs = Date.parse(startedAt) - Date.parse(completedAt);
  if (elapsedMs >= DUX_REQUEST_MIN_INTERVAL_MS) return;

  throw new HttpError(
    429,
    'DUX_SYNC_COOLDOWN',
    'La sincronización Dux debe respetar el intervalo mínimo entre solicitudes.',
  );
}

export async function listDuxInventoryUnits(
  database: D1Database,
  env: Env,
  now = new Date(),
): Promise<readonly DuxInventoryUnit[]> {
  const maximumAgeSeconds = readDuxSnapshotMaxAgeSeconds(env);
  const nowMilliseconds = validDate(now, 'DUX_CLOCK_INVALID').getTime();
  const result = await database
    .prepare(
      `SELECT inventory.*,
        COALESCE(tenant.verified_at, inventory.last_synced_at) AS snapshot_synced_at
       FROM dux_inventory_items AS inventory
       LEFT JOIN dux_tenant_context AS tenant ON tenant.id = 1
       ORDER BY inventory.local_product_id, inventory.inventory_key`,
    )
    .all<InventoryRow>();
  return Object.freeze((result.results ?? []).map((row) => (
    parseInventoryRow(row, maximumAgeSeconds, nowMilliseconds)
  )));
}

export async function getDuxInventoryUnitForDisplay(
  database: D1Database,
  env: Env,
  localProductId: string,
  now = new Date(),
): Promise<DuxInventoryUnit | null> {
  const safeProductId = requiredDatabaseText(localProductId, 180, 'DUX_PRODUCT_ID_INVALID');
  const result = await database
    .prepare(
      `SELECT inventory.*,
        COALESCE(tenant.verified_at, inventory.last_synced_at) AS snapshot_synced_at
       FROM dux_inventory_items AS inventory
       LEFT JOIN dux_tenant_context AS tenant ON tenant.id = 1
       WHERE inventory.local_product_id = ?1 AND inventory.mapping_status = 'mapped'
       ORDER BY CASE WHEN inventory.last_sync_status = 'absent' THEN 1 ELSE 0 END,
         inventory.inventory_key`,
    )
    .bind(safeProductId)
    .all<InventoryRow>();
  const rows = result.results ?? [];
  const currentRows = rows.filter((row) => row.last_sync_status !== 'absent');
  const candidates = currentRows.length > 0 ? currentRows : rows;
  if (candidates.length !== 1) return null;
  const row = candidates[0];
  if (row === undefined) return null;
  return parseInventoryRow(
    row,
    readDuxSnapshotMaxAgeSeconds(env),
    validDate(now, 'DUX_CLOCK_INVALID').getTime(),
  );
}

export async function getDuxInventoryStatus(
  database: D1Database,
  env: Env,
  now = new Date(),
): Promise<DuxInventoryStatus> {
  const maximumAgeSeconds = readDuxSnapshotMaxAgeSeconds(env);
  const nowDate = validDate(now, 'DUX_CLOCK_INVALID');
  const [tenantRow, latestRunRow, units] = await Promise.all([
    database.prepare('SELECT * FROM dux_tenant_context WHERE id = 1').first<Record<string, unknown>>(),
    database.prepare(
      `SELECT id, kind, status, processed_count, mapped_count, unmapped_count,
              ambiguous_count, absent_count, failed_count, error_code, started_at, completed_at
       FROM dux_sync_runs ORDER BY started_at DESC, id DESC LIMIT 1`,
    ).first<Record<string, unknown>>(),
    listDuxInventoryUnits(database, env, nowDate),
  ]);
  return Object.freeze({
    tenant: tenantRow === null ? null : parseTenantRow(tenantRow),
    latestRun: latestRunRow === null ? null : parseSyncRunRow(latestRunRow),
    counts: Object.freeze({
      inventory: units.length,
      mapped: units.filter((unit) => unit.mappingStatus === 'mapped').length,
      unmapped: units.filter((unit) => unit.mappingStatus === 'unmapped').length,
      ambiguous: units.filter((unit) => unit.mappingStatus === 'ambiguous').length,
      absent: units.filter((unit) => unit.lastSyncStatus === 'absent').length,
      errors: units.filter((unit) => unit.lastSyncStatus === 'error').length,
      stale: units.filter((unit) => !unit.fresh).length,
      negativeStock: units.filter((unit) => unit.observedStock.available < 0).length,
      checkoutEligible: 0 as const,
    }),
    maxAgeSeconds: maximumAgeSeconds,
  });
}

export function buildDuxInventoryKey(
  companyId: number,
  depositId: number,
  itemCode: string,
  variantDetailId: number | null,
): string {
  const company = positiveIdentifier(companyId, 'companyId');
  const deposit = positiveIdentifier(depositId, 'depositId');
  const code = requiredDatabaseText(itemCode, 300, 'DUX_ITEM_CODE_INVALID');
  const detail = variantDetailId === null
    ? 'base'
    : positiveIdentifier(variantDetailId, 'variantDetailId');
  let encodedCode: string;
  try {
    encodedCode = encodeURIComponent(code);
  } catch {
    throw invalidInventoryKey();
  }
  const inventoryKey = `dux:v2:${company}:${deposit}:${encodedCode}:${detail}`;
  if (
    inventoryKey.length > DUX_INVENTORY_KEY_MAX_BYTES ||
    new TextEncoder().encode(inventoryKey).byteLength > DUX_INVENTORY_KEY_MAX_BYTES
  ) {
    throw invalidInventoryKey();
  }
  return inventoryKey;
}

async function verifyTenant(
  client: DuxInventoryReader,
  config: DuxInventoryConfig,
  verifiedAt: string,
): Promise<DuxTenantContext> {
  const companies = await client.listEmpresas();
  const company = uniqueById(companies, config.companyId, 'DUX_COMPANY_NOT_FOUND');
  const branches = await client.listSucursales(config.companyId);
  const branch = uniqueById(branches, config.branchId, 'DUX_BRANCH_NOT_FOUND');
  if (branch.companyId !== config.companyId) {
    throw new HttpError(503, 'DUX_BRANCH_COMPANY_MISMATCH', 'La sucursal Dux no pertenece a la empresa configurada.');
  }
  const warehouses = await client.listDepositos(config.depositId);
  const warehouse = uniqueById(warehouses, config.depositId, 'DUX_DEPOSIT_NOT_FOUND');
  if (warehouse.companyId !== config.companyId) {
    throw new HttpError(503, 'DUX_DEPOSIT_COMPANY_MISMATCH', 'El depósito Dux no pertenece a la empresa configurada.');
  }
  if (!warehouse.enabled) {
    throw new HttpError(503, 'DUX_DEPOSIT_DISABLED', 'El depósito Dux configurado no está habilitado.');
  }
  return Object.freeze({
    apiVersion: DUX_API_VERSION,
    companyId: String(company.id),
    companyName: company.legalName,
    branchId: String(branch.id),
    branchName: branch.name,
    depositId: String(warehouse.id),
    depositName: warehouse.name,
    verifiedAt,
  });
}

function uniqueById<T extends Readonly<{ id: number }>>(
  values: readonly T[],
  id: number,
  errorCode: string,
): T {
  const matches = values.filter((value) => value.id === id);
  if (matches.length !== 1) {
    throw new HttpError(503, errorCode, 'La identidad configurada de Dux no pudo verificarse de forma inequívoca.');
  }
  const match = matches[0];
  if (match === undefined) throw new Error('Resultado Dux inconsistente.');
  return match;
}

async function mapInventoryItems(
  database: D1Database,
  config: DuxInventoryConfig,
  items: readonly DuxItem[],
  localProducts: readonly CatalogProductDetail[],
  bootstrapRequested: boolean,
): Promise<MappedInventoryItems> {
  const existingMappings = await readPersistedMappings(database);
  const allowExactNameBootstrap = bootstrapRequested &&
    await isDuxInventoryBootstrapPending(database);
  const productsById = groupProducts(localProducts, (product) => product.id);
  const productsBySku = groupProductIdentifiers(localProducts, (product) => [
    product.sku,
    ...product.variants.map((variant) => variant.sku),
  ]);
  const productsByName = groupProducts(localProducts, localBootstrapNameKey);
  const pending: PendingInventoryUnit[] = [];
  const seenKeys = new Set<string>();
  let missingStockCount = 0;

  for (const item of items) {
    let selectedStockCount = 0;
    for (const stock of item.stocks) {
      if (stock.warehouseId !== config.depositId) continue;
      selectedStockCount += 1;
      const inventoryKey = buildDuxInventoryKey(
        config.companyId,
        config.depositId,
        item.code,
        stock.variantDetailId,
      );
      if (seenKeys.has(inventoryKey)) {
        throw new HttpError(
          502,
          'DUX_DUPLICATE_INVENTORY_IDENTITY',
          'Dux devolvió una identidad de inventario duplicada.',
        );
      }
      seenKeys.add(inventoryKey);
      const persisted = existingMappings.get(inventoryKey);
      const mapping = decideMapping(
        persisted,
        productsById,
        productsBySku,
        productsByName,
        item,
        stock,
        allowExactNameBootstrap,
      );
      pending.push(Object.freeze({ inventoryKey, item, stock, mapping }));
    }
    if (selectedStockCount === 0) missingStockCount += 1;
  }

  const rowsByProduct = new Map<string, number[]>();
  pending.forEach((unit, index) => {
    if (unit.mapping.status !== 'mapped' || unit.mapping.localProductId === null) return;
    const indices = rowsByProduct.get(unit.mapping.localProductId) ?? [];
    indices.push(index);
    rowsByProduct.set(unit.mapping.localProductId, indices);
  });
  for (const [localProductId, indices] of rowsByProduct) {
    if (indices.length <= 1) continue;
    for (const index of indices) {
      const unit = pending[index];
      if (unit === undefined) continue;
      pending[index] = Object.freeze({
        ...unit,
        mapping: Object.freeze({
          status: 'ambiguous' as const,
          source: unit.mapping.source,
          localProductId,
          candidates: Object.freeze([localProductId]),
        }),
      });
    }
  }
  pending.sort((left, right) => left.inventoryKey.localeCompare(right.inventoryKey));
  return Object.freeze({ units: Object.freeze(pending), missingStockCount });
}

function decideMapping(
  persisted: MappingDecision | undefined,
  productsById: ReadonlyMap<string, readonly CatalogProductDetail[]>,
  productsBySku: ReadonlyMap<string, readonly CatalogProductDetail[]>,
  productsByName: ReadonlyMap<string, readonly CatalogProductDetail[]>,
  item: DuxItem,
  stock: DuxItemStock,
  allowExactNameBootstrap: boolean,
): MappingDecision {
  if (
    persisted?.status === 'mapped' &&
    persisted.localProductId !== null &&
    productsById.has(persisted.localProductId)
  ) {
    return mappedDecision(persisted.localProductId, 'persisted');
  }
  const external = item.externalCode === null ? [] : productsById.get(item.externalCode) ?? [];
  const byExternal = candidateDecision(external, 'codigo_externo');
  if (byExternal !== null) return byExternal;
  const sku = productsBySku.get(item.code) ?? [];
  const bySku = candidateDecision(sku, 'sku');
  if (bySku !== null) return bySku;
  const barcode = candidateDecision(
    productsForExactIdentifiers(productsBySku, duxBarcodes(item, stock)),
    'cod_barra',
  );
  if (barcode !== null) return barcode;
  if (
    persisted?.status === 'ambiguous' &&
    persisted.candidates.length > 0 &&
    persisted.candidates.every((candidate) => productsById.has(candidate)) &&
    (
      persisted.localProductId === null ||
      (
        productsById.has(persisted.localProductId) &&
        persisted.candidates.includes(persisted.localProductId)
      )
    )
  ) {
    return persisted;
  }
  if (allowExactNameBootstrap) {
    const exactName = productsByName.get(normalizeBootstrapName(item.name)) ?? [];
    const byName = candidateDecision(exactName, 'exact_name');
    if (byName !== null) return byName;
  }
  return Object.freeze({
    status: 'unmapped' as const,
    source: null,
    localProductId: null,
    candidates: Object.freeze([]),
  });
}

function candidateDecision(
  products: readonly CatalogProductDetail[],
  source: 'codigo_externo' | 'sku' | 'cod_barra' | 'exact_name',
): MappingDecision | null {
  if (products.length === 0) return null;
  const candidates = Object.freeze([...new Set(products.map((product) => product.id))].sort());
  if (candidates.length === 1) {
    const candidate = candidates[0];
    if (candidate === undefined) return null;
    return mappedDecision(candidate, source);
  }
  return Object.freeze({
    status: 'ambiguous' as const,
    source: null,
    localProductId: null,
    candidates,
  });
}

function mappedDecision(localProductId: string, source: DuxMappingSource): MappingDecision {
  return Object.freeze({
    status: 'mapped' as const,
    source,
    localProductId,
    candidates: Object.freeze([localProductId]),
  });
}

function groupProducts(
  products: readonly CatalogProductDetail[],
  key: (product: CatalogProductDetail) => string | null,
): ReadonlyMap<string, readonly CatalogProductDetail[]> {
  const grouped = new Map<string, CatalogProductDetail[]>();
  for (const product of products) {
    const value = key(product);
    if (value === null || value === '') continue;
    const matches = grouped.get(value) ?? [];
    matches.push(product);
    grouped.set(value, matches);
  }
  return grouped;
}

function groupProductIdentifiers(
  products: readonly CatalogProductDetail[],
  identifiers: (product: CatalogProductDetail) => readonly (string | undefined)[],
): ReadonlyMap<string, readonly CatalogProductDetail[]> {
  const grouped = new Map<string, CatalogProductDetail[]>();
  for (const product of products) {
    for (const identifier of new Set(identifiers(product))) {
      if (identifier === undefined || identifier === '') continue;
      const matches = grouped.get(identifier) ?? [];
      matches.push(product);
      grouped.set(identifier, matches);
    }
  }
  return grouped;
}

function duxBarcodes(item: DuxItem, stock: DuxItemStock): readonly string[] {
  return Object.freeze([
    ...(stock.variantBarcode === null ? [] : [stock.variantBarcode]),
    ...item.barcodes,
  ]);
}

function productsForExactIdentifiers(
  productsByIdentifier: ReadonlyMap<string, readonly CatalogProductDetail[]>,
  identifiers: readonly string[],
): readonly CatalogProductDetail[] {
  const byId = new Map<string, CatalogProductDetail>();
  for (const identifier of new Set(identifiers)) {
    for (const product of productsByIdentifier.get(identifier) ?? []) {
      byId.set(product.id, product);
    }
  }
  return Object.freeze([...byId.values()]);
}

function localBootstrapNameKey(product: CatalogProductDetail): string | null {
  const normalizedName = normalizeBootstrapName(product.name);
  const namePresentation = presentationFingerprint(product.name);
  const explicitPresentation = presentationFingerprint(product.presentation ?? '');
  if (
    namePresentation.length > 0 &&
    explicitPresentation.length > 0 &&
    !samePresentationFingerprint(namePresentation, explicitPresentation)
  ) {
    return null;
  }

  const visiblePresentation = namePresentation.length > 0
    ? namePresentation
    : explicitPresentation;
  const historicalIdPresentation = presentationFingerprint(
    product.id.replaceAll(/[-_]+/gu, ' '),
  );
  if (
    historicalIdPresentation.length > 0 &&
    visiblePresentation.length > 0 &&
    !samePresentationFingerprint(historicalIdPresentation, visiblePresentation)
  ) {
    return null;
  }

  if (namePresentation.length === 0 && explicitPresentation.length > 0) {
    return `${normalizedName} ${explicitPresentation.join(' ')}`;
  }
  return normalizedName;
}

function normalizeBootstrapName(value: string): string {
  const normalized = foldBootstrapDiacritics(
    value.normalize('NFKC').toLocaleLowerCase('es-AR'),
  );
  return normalized
    .replaceAll(PRESENTATION_SEPARATOR_PATTERN, '$1')
    .replaceAll(PRESENTATION_QUANTITY_PATTERN, (_match, amount: string, unit: string) => (
      canonicalPresentationQuantity(amount, unit)
    ))
    .trim()
    .replaceAll(/\s+/gu, ' ');
}

function foldBootstrapDiacritics(value: string): string {
  let folded = '';
  for (const character of value) {
    const decomposed = character.normalize('NFD');
    if (decomposed === 'n\u0303') {
      folded += 'ñ';
      continue;
    }
    folded += decomposed.replaceAll(/\p{M}+/gu, '');
  }
  return folded;
}

function canonicalPresentationQuantity(amount: string, unit: string): string {
  if (/^(?:kilogramos?|kilos?|kgs?|kg)$/u.test(unit)) {
    return `${canonicalDecimalAmount(amount, 1_000n)} g`;
  }
  if (/^(?:gramos?|grs?|gr|g)$/u.test(unit)) {
    return `${canonicalDecimalAmount(amount, 1n)} g`;
  }
  if (/^(?:litros?|lts?|lt|l)$/u.test(unit)) {
    return `${canonicalDecimalAmount(amount, 1_000n)} ml`;
  }
  return `${canonicalDecimalAmount(amount, 1n)} ml`;
}

function canonicalDecimalAmount(value: string, multiplier: bigint): string {
  const [integerPart = '0', fractionPart = ''] = value.replace(',', '.').split('.');
  const scale = 10n ** BigInt(fractionPart.length);
  const unscaled = (BigInt(integerPart) * scale) + BigInt(fractionPart || '0');
  const converted = unscaled * multiplier;
  const integer = converted / scale;
  const remainder = converted % scale;
  if (remainder === 0n) return integer.toString();
  const fraction = remainder
    .toString()
    .padStart(fractionPart.length, '0')
    .replaceAll(/0+$/gu, '');
  return `${integer}.${fraction}`;
}

function presentationFingerprint(value: string): readonly string[] {
  const normalized = normalizeBootstrapName(value);
  return Object.freeze([...normalized.matchAll(CANONICAL_PRESENTATION_PATTERN)].map((match) => (
    `${match[1]} ${match[2]}`
  )));
}

function samePresentationFingerprint(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

async function readPersistedMappings(
  database: D1Database,
): Promise<ReadonlyMap<string, MappingDecision>> {
  const result = await database
    .prepare(
      `SELECT inventory_key, local_product_id, mapping_status, mapping_source,
              mapping_candidates_json
       FROM dux_inventory_items
       WHERE mapping_status IN ('mapped', 'ambiguous')`,
    )
    .all<PersistedMappingRow>();

  const mappings = new Map<string, MappingDecision>();

  for (const row of result.results ?? []) {
    const inventoryKey = databaseText(row.inventory_key, 1_000);
    const localProductId = nullableDatabaseText(row.local_product_id, 180);
    const status = mappingStatus(row.mapping_status);
    const source = mappingSource(row.mapping_source);
    const candidates = parseStringArray(row.mapping_candidates_json);

    if (status === 'mapped') {
      if (
        localProductId === null ||
        source === null ||
        candidates.length !== 1 ||
        candidates[0] !== localProductId
      ) {
        throw invalidDatabaseProjection();
      }

      mappings.set(
        inventoryKey,
        mappedDecision(localProductId, 'persisted'),
      );
      continue;
    }

    if (candidates.length === 0) throw invalidDatabaseProjection();

    if (localProductId === null) {
      if (source !== null) throw invalidDatabaseProjection();

      mappings.set(inventoryKey, Object.freeze({
        status: 'ambiguous' as const,
        source: null,
        localProductId: null,
        candidates,
      }));
      continue;
    }

    if (source === null || !candidates.includes(localProductId)) {
      throw invalidDatabaseProjection();
    }

    mappings.set(inventoryKey, Object.freeze({
      status: 'ambiguous' as const,
      source,
      localProductId,
      candidates,
    }));
  }

  return mappings;
}

export async function isDuxInventoryBootstrapPending(database: D1Database): Promise<boolean> {
  const row = await database
    .prepare(
      `SELECT NOT EXISTS (
        SELECT 1 FROM dux_inventory_items LIMIT 1
      ) AS bootstrap_pending`,
    )
    .first<Readonly<{ bootstrap_pending: unknown }>>();
  return databaseBoolean(row?.bootstrap_pending);
}

async function persistableUnit(
  unit: PendingInventoryUnit,
  tenant: DuxTenantContext,
  syncedAt: string,
): Promise<PersistableInventoryUnit> {
  const barcode = unit.stock.variantBarcode ?? (
    unit.item.barcodes.length === 1 ? unit.item.barcodes[0] ?? null : null
  );
  const snapshot = {
    apiVersion: DUX_API_VERSION,
    companyId: tenant.companyId,
    depositId: tenant.depositId,
    item: {
      code: unit.item.code,
      externalCode: unit.item.externalCode,
      name: unit.item.name,
      barcodes: [...unit.item.barcodes].sort(),
      enabled: unit.item.enabled,
      unitsPerPackage: unit.item.unitsPerPackage,
    },
    stock: {
      warehouseId: unit.stock.warehouseId,
      warehouseName: unit.stock.warehouseName,
      real: unit.stock.realQuantity,
      reserved: unit.stock.reservedQuantity,
      available: unit.stock.availableQuantity,
      variantDetailId: unit.stock.variantDetailId,
      variantBarcode: unit.stock.variantBarcode,
      size: unit.stock.size,
      color: unit.stock.color,
    },
    quantitySemanticsStatus: QUANTITY_SEMANTICS_STATUS,
    mapping: {
      status: unit.mapping.status,
      localProductId: unit.mapping.localProductId,
      candidates: [...unit.mapping.candidates],
    },
  };
  const rawSnapshot = JSON.stringify(snapshot);
  return Object.freeze({
    ...unit,
    tenant,
    barcode,
    rawSnapshot,
    catalogVersion: await sha256Hex(rawSnapshot),
    syncedAt,
  });
}

async function readPublishedInventoryIndex(
  database: D1Database,
): Promise<ReadonlyMap<string, PublishedInventoryIndexEntry>> {
  const result = await database
    .prepare(
      `SELECT inventory_key, cod_item, id_det_item, codigo_externo, cod_barra,
        item_name, local_product_id, mapping_status, mapping_source,
        mapping_candidates_json, deposit_id, deposit_name, stock_real,
        stock_reservado, stock_disponible, units_per_package, unit_id, unit_name,
        unit_symbol, is_weighable, allows_decimal, commercial_quantity_step,
        quantity_semantics_status, checkout_eligible, catalog_version,
        raw_snapshot_json, last_sync_status, last_sync_error_code, absent_since
       FROM dux_inventory_items`,
    )
    .all<InventoryRow>();
  const inventory = new Map<string, PublishedInventoryIndexEntry>();
  for (const row of result.results ?? []) {
    const payload = publishedInventoryPayload(row);
    if (inventory.has(payload.inventoryKey)) throw invalidDatabaseProjection();
    inventory.set(payload.inventoryKey, Object.freeze({
      signature: inventoryPublicationSignature(payload),
      lastSyncStatus: payload.lastSyncStatus,
    }));
  }
  return inventory;
}

function inventoryPublicationPayload(row: PersistableInventoryUnit): InventoryPublicationPayload {
  return Object.freeze({
    inventoryKey: row.inventoryKey,
    itemCode: row.item.code,
    variantDetailId: row.stock.variantDetailId === null
      ? null
      : String(row.stock.variantDetailId),
    externalCode: row.item.externalCode,
    barcode: row.barcode,
    itemName: row.item.name,
    localProductId: row.mapping.localProductId,
    mappingStatus: row.mapping.status,
    mappingSource: row.mapping.source,
    mappingCandidatesJson: JSON.stringify(row.mapping.candidates),
    depositId: row.tenant.depositId,
    depositName: row.stock.warehouseName,
    stockReal: row.stock.realQuantity,
    stockReserved: row.stock.reservedQuantity,
    stockAvailable: row.stock.availableQuantity,
    unitsPerPackage: row.item.unitsPerPackage,
    unitId: null,
    unitName: null,
    unitSymbol: null,
    isWeighable: null,
    allowsDecimal: null,
    commercialQuantityStep: null,
    quantitySemanticsStatus: QUANTITY_SEMANTICS_STATUS,
    checkoutEligible: 0,
    catalogVersion: row.catalogVersion,
    rawSnapshot: row.rawSnapshot,
    lastSyncStatus: 'ok',
    lastSyncErrorCode: null,
    absentSince: null,
  });
}

function publishedInventoryPayload(row: InventoryRow): InventoryPublicationPayload {
  return Object.freeze({
    inventoryKey: databaseText(row.inventory_key, 1_000),
    itemCode: databaseText(row.cod_item, 300),
    variantDetailId: nullableDatabaseText(row.id_det_item, 100),
    externalCode: nullableDatabaseText(row.codigo_externo, 300),
    barcode: nullableDatabaseText(row.cod_barra, 300),
    itemName: databaseText(row.item_name, 500),
    localProductId: nullableDatabaseText(row.local_product_id, 180),
    mappingStatus: mappingStatus(row.mapping_status),
    mappingSource: mappingSource(row.mapping_source),
    mappingCandidatesJson: JSON.stringify(parseStringArray(row.mapping_candidates_json)),
    depositId: databaseText(row.deposit_id, 100),
    depositName: databaseText(row.deposit_name, 300),
    stockReal: finiteDatabaseNumber(row.stock_real),
    stockReserved: finiteDatabaseNumber(row.stock_reservado),
    stockAvailable: finiteDatabaseNumber(row.stock_disponible),
    unitsPerPackage: nullableFiniteNumber(row.units_per_package),
    unitId: nullableDatabaseText(row.unit_id, 300),
    unitName: nullableDatabaseText(row.unit_name, 300),
    unitSymbol: nullableDatabaseText(row.unit_symbol, 100),
    isWeighable: nullableDatabaseFlag(row.is_weighable),
    allowsDecimal: nullableDatabaseFlag(row.allows_decimal),
    commercialQuantityStep: nullableFiniteNumber(row.commercial_quantity_step),
    quantitySemanticsStatus: databaseText(row.quantity_semantics_status, 100),
    checkoutEligible: databaseFlag(row.checkout_eligible),
    catalogVersion: databaseHexDigest(row.catalog_version),
    rawSnapshot: databaseJsonText(row.raw_snapshot_json),
    lastSyncStatus: syncStatus(row.last_sync_status),
    lastSyncErrorCode: nullableDatabaseText(row.last_sync_error_code, 300),
    absentSince: nullableDatabaseTimestamp(row.absent_since),
  });
}

function inventoryPublicationSignature(payload: InventoryPublicationPayload): string {
  return JSON.stringify(payload);
}

async function beginInventoryGeneration(
  database: D1Database,
  runId: string,
  startedAt: string,
): Promise<void> {
  await database
    .prepare(
      `INSERT INTO dux_inventory_generations (
        generation_id, run_id, status, started_at, created_at, updated_at
      ) VALUES (?1, ?1, 'loading', ?2, ?2, ?2)`,
    )
    .bind(runId, startedAt)
    .run();
}

async function writeInventoryGenerationRows(
  database: D1Database,
  generationId: string,
  rows: readonly PersistableInventoryUnit[],
  updatedAt: string,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += STAGING_ROWS_PER_STATEMENT) {
    const batchRows = rows.slice(offset, offset + STAGING_ROWS_PER_STATEMENT);
    if (batchRows.length > 0) {
      await database.batch([
        inventoryGenerationBatchInsert(database, generationId, batchRows, updatedAt),
      ]);
    }
  }
}

async function reserveD1WriteBudget(
  database: D1Database,
  startedAt: string,
  changedCount: number,
): Promise<void> {
  const estimatedRows = DUX_D1_CONSTANT_WRITE_RESERVATION +
    (DUX_D1_CHANGED_ROW_WRITE_RESERVATION * changedCount);
  const utcDate = startedAt.slice(0, 10);
  const reservation = await database
    .prepare(
      `INSERT INTO dux_d1_write_budget (
        utc_date, estimated_rows, created_at, updated_at
      )
      SELECT ?1, ?2, ?3, ?3
      WHERE ?2 <= ${DUX_D1_DAILY_ESTIMATED_WRITE_LIMIT}
      ON CONFLICT(utc_date) DO UPDATE SET
        estimated_rows = dux_d1_write_budget.estimated_rows + excluded.estimated_rows,
        updated_at = excluded.updated_at
      WHERE dux_d1_write_budget.estimated_rows + excluded.estimated_rows
        <= ${DUX_D1_DAILY_ESTIMATED_WRITE_LIMIT}
      RETURNING estimated_rows`,
    )
    .bind(utcDate, estimatedRows, startedAt)
    .first<Readonly<{ estimated_rows: unknown }>>();
  if (reservation === null) {
    throw new HttpError(
      503,
      'DUX_D1_WRITE_BUDGET_EXHAUSTED',
      'Dux excedió el presupuesto diario seguro de escrituras de inventario.',
    );
  }
  const reservedRows = nonNegativeDatabaseInteger(reservation.estimated_rows);
  if (reservedRows > DUX_D1_DAILY_ESTIMATED_WRITE_LIMIT) throw invalidDatabaseProjection();
}

function inventoryGenerationBatchInsert(
  database: D1Database,
  generationId: string,
  rows: readonly PersistableInventoryUnit[],
  updatedAt: string,
): D1PreparedStatement {
  const payload = rows.map((row) => ({
    ...inventoryPublicationPayload(row),
    syncedAt: row.syncedAt,
  }));
  const serializedPayload = JSON.stringify(payload);
  if (new TextEncoder().encode(serializedPayload).byteLength > DUX_STAGING_JSON_MAX_BYTES) {
    throw new HttpError(
      502,
      'DUX_STAGING_PAYLOAD_TOO_LARGE',
      'Dux excedió el tamaño seguro de una carga intermedia de inventario.',
    );
  }
  return database
    .prepare(
      `INSERT INTO dux_inventory_generation_items (
        generation_id, inventory_key, cod_item, id_det_item, codigo_externo, cod_barra, item_name,
        local_product_id, mapping_status, mapping_source, mapping_candidates_json,
        deposit_id, deposit_name, stock_real, stock_reservado, stock_disponible,
        units_per_package, unit_id, unit_name, unit_symbol, is_weighable,
        allows_decimal, commercial_quantity_step, quantity_semantics_status,
        checkout_eligible, catalog_version, raw_snapshot_json, last_sync_status,
        last_sync_error_code, last_synced_at, absent_since, created_at, updated_at
      )
      SELECT
        ?1,
        json_extract(staged.value, '$.inventoryKey'),
        json_extract(staged.value, '$.itemCode'),
        json_extract(staged.value, '$.variantDetailId'),
        json_extract(staged.value, '$.externalCode'),
        json_extract(staged.value, '$.barcode'),
        json_extract(staged.value, '$.itemName'),
        json_extract(staged.value, '$.localProductId'),
        json_extract(staged.value, '$.mappingStatus'),
        json_extract(staged.value, '$.mappingSource'),
        json_extract(staged.value, '$.mappingCandidatesJson'),
        json_extract(staged.value, '$.depositId'),
        json_extract(staged.value, '$.depositName'),
        json_extract(staged.value, '$.stockReal'),
        json_extract(staged.value, '$.stockReserved'),
        json_extract(staged.value, '$.stockAvailable'),
        json_extract(staged.value, '$.unitsPerPackage'),
        NULL, NULL, NULL, NULL, NULL, NULL, '${QUANTITY_SEMANTICS_STATUS}', 0,
        json_extract(staged.value, '$.catalogVersion'),
        json_extract(staged.value, '$.rawSnapshot'),
        'ok', NULL, json_extract(staged.value, '$.syncedAt'), NULL,
        COALESCE((
          SELECT created_at
          FROM dux_inventory_items
          WHERE inventory_key = json_extract(staged.value, '$.inventoryKey')
        ), ?3),
        ?3
      FROM json_each(?2) AS staged`,
    )
    .bind(
      generationId,
      serializedPayload,
      updatedAt,
    );
}

async function stageAbsentInventoryRows(
  database: D1Database,
  generationId: string,
  currentKeys: ReadonlySet<string>,
  updatedAt: string,
): Promise<void> {
  await database
    .prepare(
      `INSERT INTO dux_inventory_generation_items (
        generation_id, inventory_key, cod_item, id_det_item, codigo_externo, cod_barra,
        item_name, local_product_id, mapping_status, mapping_source,
        mapping_candidates_json, deposit_id, deposit_name, stock_real,
        stock_reservado, stock_disponible, units_per_package, unit_id, unit_name,
        unit_symbol, is_weighable, allows_decimal, commercial_quantity_step,
        quantity_semantics_status, checkout_eligible, catalog_version,
        raw_snapshot_json, last_sync_status, last_sync_error_code, last_synced_at,
        absent_since, created_at, updated_at
      )
      SELECT ?1, published.inventory_key, published.cod_item, published.id_det_item,
        published.codigo_externo, published.cod_barra, published.item_name,
        published.local_product_id, published.mapping_status, published.mapping_source,
        published.mapping_candidates_json, published.deposit_id, published.deposit_name,
        published.stock_real, published.stock_reservado, published.stock_disponible,
        published.units_per_package, published.unit_id, published.unit_name,
        published.unit_symbol, published.is_weighable, published.allows_decimal,
        published.commercial_quantity_step, published.quantity_semantics_status, 0,
        published.catalog_version, published.raw_snapshot_json, 'absent', NULL,
        published.last_synced_at, COALESCE(published.absent_since, ?2),
        published.created_at, ?2
      FROM dux_inventory_items AS published
      WHERE published.last_sync_status <> 'absent'
        AND NOT EXISTS (
          SELECT 1 FROM json_each(?3) AS current
          WHERE current.value = published.inventory_key
        )`,
    )
    .bind(generationId, updatedAt, JSON.stringify([...currentKeys]))
    .run();
}

async function publishInventoryGeneration(
  database: D1Database,
  generationId: string,
  tenant: DuxTenantContext,
  summary: DuxSyncSummary,
  changedCount: number,
): Promise<void> {
  const stagedCount = await stagedInventoryItemCount(database, generationId);
  if (stagedCount !== changedCount) {
    throw new HttpError(
      503,
      'DUX_SNAPSHOT_GENERATION_INCOMPLETE',
      'La generación Dux no pudo completarse de forma íntegra.',
    );
  }
  const itemCount = summary.processed - summary.failed + summary.absent;

  await database.batch([
    database
      .prepare(
        `INSERT INTO dux_inventory_items (
          inventory_key, cod_item, id_det_item, codigo_externo, cod_barra, item_name,
          local_product_id, mapping_status, mapping_source, mapping_candidates_json,
          deposit_id, deposit_name, stock_real, stock_reservado, stock_disponible,
          units_per_package, unit_id, unit_name, unit_symbol, is_weighable,
          allows_decimal, commercial_quantity_step, quantity_semantics_status,
          checkout_eligible, catalog_version, raw_snapshot_json, last_sync_status,
          last_sync_error_code, last_synced_at, absent_since, created_at, updated_at
        )
        SELECT staged.inventory_key, staged.cod_item, staged.id_det_item,
          staged.codigo_externo, staged.cod_barra, staged.item_name,
          staged.local_product_id, staged.mapping_status, staged.mapping_source,
          staged.mapping_candidates_json, staged.deposit_id, staged.deposit_name,
          staged.stock_real, staged.stock_reservado, staged.stock_disponible,
          staged.units_per_package, staged.unit_id, staged.unit_name, staged.unit_symbol,
          staged.is_weighable, staged.allows_decimal, staged.commercial_quantity_step,
          staged.quantity_semantics_status, staged.checkout_eligible,
          staged.catalog_version, staged.raw_snapshot_json, staged.last_sync_status,
          staged.last_sync_error_code, staged.last_synced_at, staged.absent_since,
          staged.created_at, staged.updated_at
        FROM dux_inventory_generation_items AS staged
        WHERE staged.generation_id = ?1
          AND EXISTS (
            SELECT 1 FROM dux_inventory_generations
            WHERE generation_id = ?1 AND status = 'loading'
          )
        ON CONFLICT(inventory_key) DO UPDATE SET
          cod_item = excluded.cod_item,
          id_det_item = excluded.id_det_item,
          codigo_externo = excluded.codigo_externo,
          cod_barra = excluded.cod_barra,
          item_name = excluded.item_name,
          local_product_id = excluded.local_product_id,
          mapping_status = excluded.mapping_status,
          mapping_source = excluded.mapping_source,
          mapping_candidates_json = excluded.mapping_candidates_json,
          deposit_id = excluded.deposit_id,
          deposit_name = excluded.deposit_name,
          stock_real = excluded.stock_real,
          stock_reservado = excluded.stock_reservado,
          stock_disponible = excluded.stock_disponible,
          units_per_package = excluded.units_per_package,
          unit_id = excluded.unit_id,
          unit_name = excluded.unit_name,
          unit_symbol = excluded.unit_symbol,
          is_weighable = excluded.is_weighable,
          allows_decimal = excluded.allows_decimal,
          commercial_quantity_step = excluded.commercial_quantity_step,
          quantity_semantics_status = excluded.quantity_semantics_status,
          checkout_eligible = excluded.checkout_eligible,
          catalog_version = excluded.catalog_version,
          raw_snapshot_json = excluded.raw_snapshot_json,
          last_sync_status = excluded.last_sync_status,
          last_sync_error_code = excluded.last_sync_error_code,
          last_synced_at = excluded.last_synced_at,
          absent_since = excluded.absent_since,
          updated_at = excluded.updated_at`,
      )
      .bind(generationId),
    database
      .prepare(
        `UPDATE dux_inventory_generations
         SET status = 'superseded', updated_at = ?2
         WHERE status = 'published' AND generation_id <> ?1
           AND EXISTS (
             SELECT 1 FROM dux_inventory_generations
             WHERE generation_id = ?1 AND status = 'loading'
           )`,
      )
      .bind(generationId, summary.completedAt),
    database
      .prepare(
        `UPDATE dux_inventory_generations
         SET status = 'published', item_count = ?2, changed_count = ?3,
             completed_at = ?4, published_at = ?4, updated_at = ?4
         WHERE generation_id = ?1 AND status = 'loading'`,
      )
      .bind(generationId, itemCount, changedCount, summary.completedAt),
    tenantPublication(database, generationId, tenant, summary.completedAt),
    database
      .prepare(
        `UPDATE dux_sync_runs
         SET status = ?1, processed_count = ?2, mapped_count = ?3,
             unmapped_count = ?4, ambiguous_count = ?5, absent_count = ?6,
             failed_count = ?7, error_code = NULL, completed_at = ?8, updated_at = ?8
         WHERE id = ?9 AND status = 'running'
           AND EXISTS (
             SELECT 1 FROM dux_inventory_generations
             WHERE generation_id = ?9 AND status = 'published'
           )`,
      )
      .bind(
        summary.status,
        summary.processed,
        summary.mapped,
        summary.unmapped,
        summary.ambiguous,
        summary.absent,
        summary.failed,
        summary.completedAt,
        generationId,
      ),
    database
      .prepare(
        `DELETE FROM dux_inventory_generation_items
         WHERE generation_id = ?1
           AND EXISTS (
             SELECT 1 FROM dux_inventory_generations
             WHERE generation_id = ?1 AND status = 'published'
           )`,
      )
      .bind(generationId),
  ]);

  if (!await isInventoryGenerationPublished(database, generationId)) {
    throw new HttpError(
      503,
      'DUX_SNAPSHOT_PUBLICATION_FAILED',
      'La generación Dux no pudo publicarse de forma atómica.',
    );
  }
}

function tenantPublication(
  database: D1Database,
  generationId: string,
  tenant: DuxTenantContext,
  updatedAt: string,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO dux_tenant_context (
        id, api_version, company_id, company_name, branch_id, branch_name,
        deposit_id, deposit_name, verified_at, updated_at
      )
      SELECT 1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
      FROM dux_inventory_generations
      WHERE generation_id = ?1 AND status = 'published'
      ON CONFLICT(id) DO UPDATE SET
        api_version = excluded.api_version,
        company_id = excluded.company_id,
        company_name = excluded.company_name,
        branch_id = excluded.branch_id,
        branch_name = excluded.branch_name,
        deposit_id = excluded.deposit_id,
        deposit_name = excluded.deposit_name,
        verified_at = excluded.verified_at,
        updated_at = excluded.updated_at`,
    )
    .bind(
      generationId,
      tenant.apiVersion,
      tenant.companyId,
      tenant.companyName,
      tenant.branchId,
      tenant.branchName,
      tenant.depositId,
      tenant.depositName,
      updatedAt,
      updatedAt,
    );
}

async function stagedInventoryItemCount(
  database: D1Database,
  generationId: string,
): Promise<number> {
  const result = await database
    .prepare(
      `SELECT COUNT(*) AS item_count
       FROM dux_inventory_generation_items
       WHERE generation_id = ?1`,
    )
    .bind(generationId)
    .first<Readonly<{ item_count: unknown }>>();
  return nonNegativeDatabaseInteger(result?.item_count ?? 0);
}

async function isInventoryGenerationPublished(
  database: D1Database,
  generationId: string,
): Promise<boolean> {
  const row = await database
    .prepare(
      `SELECT generation_id FROM dux_inventory_generations
       WHERE generation_id = ?1 AND status = 'published'`,
    )
    .bind(generationId)
    .first<Readonly<{ generation_id: unknown }>>();
  return row?.generation_id === generationId;
}

async function failInventoryGeneration(
  database: D1Database,
  generationId: string,
  errorCode: string,
  completedAt: string,
): Promise<void> {
  await database.batch([
    database
      .prepare(
        `UPDATE dux_inventory_generations
         SET status = 'failed', item_count = NULL, changed_count = NULL, completed_at = ?2,
             failed_at = ?2, updated_at = ?2
         WHERE generation_id = ?1 AND status = 'loading'`,
      )
      .bind(generationId, completedAt),
    database
      .prepare(
        `DELETE FROM dux_inventory_generation_items
         WHERE generation_id = ?1
           AND EXISTS (
             SELECT 1 FROM dux_inventory_generations
             WHERE generation_id = ?1 AND status = 'failed'
           )`,
      )
      .bind(generationId),
    database
      .prepare(
        `UPDATE dux_sync_runs
         SET status = 'failed', failed_count = 1, error_code = ?1,
             completed_at = ?2, updated_at = ?2
         WHERE id = ?3 AND status = 'running'
           AND NOT EXISTS (
             SELECT 1 FROM dux_inventory_generations
             WHERE generation_id = ?3 AND status = 'published'
           )`,
      )
      .bind(errorCode, completedAt, generationId),
  ]);
}

async function recoverAbandonedSync(database: D1Database, now: string): Promise<void> {
  const abandonedRuns = `SELECT id FROM dux_sync_runs
    WHERE status = 'running'
      AND unixepoch(updated_at) <= unixepoch(?1, '-${SYNC_LEASE_MAX_AGE_MINUTES} minutes')`;
  await database.batch([
    database
      .prepare(
        `UPDATE dux_inventory_generations
         SET status = 'failed', item_count = NULL, changed_count = NULL, completed_at = ?1,
             failed_at = ?1, updated_at = ?1
         WHERE status = 'loading' AND run_id IN (${abandonedRuns})`,
      )
      .bind(now),
    database
      .prepare(
        `DELETE FROM dux_inventory_generation_items
         WHERE generation_id IN (
           SELECT generation_id FROM dux_inventory_generations WHERE status = 'failed'
         )`,
      ),
    database
      .prepare(
        `UPDATE dux_sync_runs
         SET status = 'failed', error_code = 'DUX_SYNC_ABANDONED',
             completed_at = ?1, updated_at = ?1
         WHERE status = 'running'
           AND unixepoch(updated_at) <= unixepoch(?1, '-${SYNC_LEASE_MAX_AGE_MINUTES} minutes')`,
      )
      .bind(now),
  ]);
}

function periodicSyncHeartbeat(
  database: D1Database,
  runId: string,
): () => Promise<void> {
  let requestCount = 0;
  return () => {
    requestCount += 1;
    if (requestCount % DUX_REQUESTS_PER_HEARTBEAT !== 0) return Promise.resolve();
    return heartbeatSync(database, runId);
  };
}

async function heartbeatSync(database: D1Database, runId: string): Promise<void> {
  const updatedAt = new Date().toISOString();
  const heartbeat = await database
    .prepare(
      `UPDATE dux_sync_runs
       SET updated_at = ?1
       WHERE id = ?2 AND status = 'running'
       RETURNING id`,
    )
    .bind(updatedAt, runId)
    .first<Readonly<{ id: unknown }>>();
  if (heartbeat === null || heartbeat.id !== runId) {
    throw new HttpError(409, 'DUX_SYNC_LEASE_LOST', 'La sincronización Dux perdió su lease global.');
  }
}

function parseInventoryRow(
  row: InventoryRow,
  maximumAgeSeconds: number,
  nowMilliseconds: number,
): DuxInventoryUnit {
  const lastSyncedAt = databaseTimestamp(row.snapshot_synced_at);
  const lastSyncStatus = syncStatus(row.last_sync_status);
  const syncedMilliseconds = Date.parse(lastSyncedAt);
  const fresh = lastSyncStatus === 'ok' &&
    syncedMilliseconds <= nowMilliseconds &&
    nowMilliseconds - syncedMilliseconds <= maximumAgeSeconds * 1_000;
  const unitId = nullableDatabaseText(row.unit_id, 300);
  const unitName = nullableDatabaseText(row.unit_name, 300);
  const unitSymbol = nullableDatabaseText(row.unit_symbol, 100);
  if (unitId !== null || unitName !== null || unitSymbol !== null) {
    throw invalidDatabaseProjection();
  }
  if (nullableDatabaseBoolean(row.is_weighable) !== null || nullableDatabaseBoolean(row.allows_decimal) !== null) {
    throw invalidDatabaseProjection();
  }
  if (nullableFiniteNumber(row.commercial_quantity_step) !== null) {
    throw invalidDatabaseProjection();
  }
  if (row.quantity_semantics_status !== QUANTITY_SEMANTICS_STATUS || databaseBoolean(row.checkout_eligible)) {
    throw invalidDatabaseProjection();
  }
  const mappingCandidates = parseStringArray(row.mapping_candidates_json);
  const status = mappingStatus(row.mapping_status);
  const source = mappingSource(row.mapping_source);
  const localProductId = nullableDatabaseText(row.local_product_id, 180);
  if (
    (status === 'mapped' && (localProductId === null || source === null)) ||
    (status === 'unmapped' && (localProductId !== null || source !== null)) ||
    (status === 'ambiguous' && (
      (localProductId === null && source !== null) ||
      (localProductId !== null && (source === null || !mappingCandidates.includes(localProductId)))
    ))
  ) {
    throw invalidDatabaseProjection();
  }
  return Object.freeze({
    inventoryKey: databaseText(row.inventory_key, 1_000),
    itemCode: databaseText(row.cod_item, 300),
    variantDetailId: nullableDatabaseText(row.id_det_item, 100),
    externalCode: nullableDatabaseText(row.codigo_externo, 300),
    barcode: nullableDatabaseText(row.cod_barra, 300),
    itemName: databaseText(row.item_name, 500),
    localProductId,
    mappingStatus: status,
    mappingSource: source,
    mappingCandidates,
    depositId: databaseText(row.deposit_id, 100),
    depositName: databaseText(row.deposit_name, 300),
    observedStock: Object.freeze({
      real: finiteDatabaseNumber(row.stock_real),
      reserved: finiteDatabaseNumber(row.stock_reservado),
      available: finiteDatabaseNumber(row.stock_disponible),
    }),
    unitsPerPackage: nullableFiniteNumber(row.units_per_package),
    unit: null,
    isWeighable: null,
    allowsDecimal: null,
    commercialQuantityStep: null,
    quantitySemanticsStatus: QUANTITY_SEMANTICS_STATUS,
    checkoutEligible: false,
    catalogVersion: databaseHexDigest(row.catalog_version),
    lastSyncStatus,
    lastSyncErrorCode: nullableDatabaseText(row.last_sync_error_code, 300),
    lastSyncedAt,
    absentSince: nullableDatabaseTimestamp(row.absent_since),
    fresh,
  });
}

function parseTenantRow(row: Readonly<Record<string, unknown>>): DuxTenantContext {
  if (row.api_version !== DUX_API_VERSION) throw invalidDatabaseProjection();
  return Object.freeze({
    apiVersion: DUX_API_VERSION,
    companyId: positiveDatabaseIdentifier(row.company_id),
    companyName: databaseText(row.company_name, 300),
    branchId: positiveDatabaseIdentifier(row.branch_id),
    branchName: databaseText(row.branch_name, 300),
    depositId: positiveDatabaseIdentifier(row.deposit_id),
    depositName: databaseText(row.deposit_name, 300),
    verifiedAt: databaseTimestamp(row.verified_at),
  });
}

function parseSyncRunRow(row: Readonly<Record<string, unknown>>): NonNullable<DuxInventoryStatus['latestRun']> {
  const kind = row.kind;
  if (kind !== 'initial' && kind !== 'full' && kind !== 'manual' && kind !== 'scheduled') {
    throw invalidDatabaseProjection();
  }
  const status = row.status;
  if (status !== 'running' && status !== 'succeeded' && status !== 'partial' && status !== 'failed') {
    throw invalidDatabaseProjection();
  }
  return Object.freeze({
    id: databaseText(row.id, 220),
    kind,
    status,
    processed: nonNegativeDatabaseInteger(row.processed_count),
    mapped: nonNegativeDatabaseInteger(row.mapped_count),
    unmapped: nonNegativeDatabaseInteger(row.unmapped_count),
    ambiguous: nonNegativeDatabaseInteger(row.ambiguous_count),
    absent: nonNegativeDatabaseInteger(row.absent_count),
    failed: nonNegativeDatabaseInteger(row.failed_count),
    errorCode: nullableDatabaseText(row.error_code, 300),
    startedAt: databaseTimestamp(row.started_at),
    completedAt: nullableDatabaseTimestamp(row.completed_at),
  });
}

function mappingStatus(value: unknown): DuxMappingStatus {
  if (value !== 'mapped' && value !== 'unmapped' && value !== 'ambiguous') {
    throw invalidDatabaseProjection();
  }
  return value;
}

function mappingSource(value: unknown): DuxMappingSource | null {
  if (value === null) return null;
  if (
    value !== 'persisted' && value !== 'codigo_externo' && value !== 'sku' &&
    value !== 'cod_barra' &&
    value !== 'exact_name' && value !== 'manual'
  ) {
    throw invalidDatabaseProjection();
  }
  return value;
}

function syncStatus(value: unknown): DuxLastSyncStatus {
  if (value !== 'ok' && value !== 'error' && value !== 'absent') {
    throw invalidDatabaseProjection();
  }
  return value;
}

function parseSyncKind(value: unknown): DuxSyncKind {
  if (value !== 'initial' && value !== 'full' && value !== 'manual' && value !== 'scheduled') {
    throw new HttpError(400, 'DUX_SYNC_KIND_INVALID', 'El tipo de sincronización Dux no es válido.');
  }
  return value;
}

function parseStringArray(value: unknown): readonly string[] {
  if (typeof value !== 'string') throw invalidDatabaseProjection();
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw invalidDatabaseProjection();
    const result = parsed.map((entry) => databaseText(entry, 180));
    if (new Set(result).size !== result.length) throw invalidDatabaseProjection();
    return Object.freeze(result);
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error;
    throw invalidDatabaseProjection();
  }
}

function databaseText(value: unknown, maximumLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength || value.trim() !== value) {
    throw invalidDatabaseProjection();
  }
  return value;
}

function nullableDatabaseText(value: unknown, maximumLength: number): string | null {
  return value === null ? null : databaseText(value, maximumLength);
}

function finiteDatabaseNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalidDatabaseProjection();
  return value;
}

function nullableFiniteNumber(value: unknown): number | null {
  return value === null ? null : finiteDatabaseNumber(value);
}

function databaseBoolean(value: unknown): boolean {
  if (value !== 0 && value !== 1) throw invalidDatabaseProjection();
  return value === 1;
}

function nullableDatabaseBoolean(value: unknown): boolean | null {
  return value === null ? null : databaseBoolean(value);
}

function databaseFlag(value: unknown): 0 | 1 {
  if (value !== 0 && value !== 1) throw invalidDatabaseProjection();
  return value;
}

function nullableDatabaseFlag(value: unknown): 0 | 1 | null {
  return value === null ? null : databaseFlag(value);
}

function databaseJsonText(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_000_000) {
    throw invalidDatabaseProjection();
  }
  try {
    JSON.parse(value);
    return value;
  } catch {
    throw invalidDatabaseProjection();
  }
}

function databaseHexDigest(value: unknown): string {
  const digest = databaseText(value, 64);
  if (!/^[0-9a-f]{64}$/u.test(digest)) throw invalidDatabaseProjection();
  return digest;
}

function positiveDatabaseIdentifier(value: unknown): string {
  const identifier = databaseText(value, 100);
  if (!/^[1-9]\d*$/u.test(identifier) || !Number.isSafeInteger(Number(identifier))) {
    throw invalidDatabaseProjection();
  }
  return identifier;
}

function nonNegativeDatabaseInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidDatabaseProjection();
  }
  return value;
}

function databaseTimestamp(value: unknown): string {
  const timestamp = databaseText(value, 100);
  if (!Number.isFinite(Date.parse(timestamp))) throw invalidDatabaseProjection();
  return timestamp;
}

function nullableDatabaseTimestamp(value: unknown): string | null {
  return value === null ? null : databaseTimestamp(value);
}

function readPositiveEnvIdentifier(value: string | undefined, name: string): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) {
    throw new HttpError(503, 'DUX_CONFIG_INVALID', `${name} no es un identificador Dux válido.`);
  }
  const identifier = Number(value);
  if (!Number.isSafeInteger(identifier)) {
    throw new HttpError(503, 'DUX_CONFIG_INVALID', `${name} no es un identificador Dux válido.`);
  }
  return identifier;
}

function positiveIdentifier(value: number, field: string): string {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new HttpError(500, 'DUX_IDENTITY_INVALID', `El identificador ${field} no es válido.`);
  }
  return String(value);
}

function requiredDatabaseText(value: string, maximumLength: number, code: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximumLength) {
    throw new HttpError(500, code, 'La integración Dux recibió un texto no válido.');
  }
  return normalized;
}

function validNow(now: () => Date): string {
  return validDate(now(), 'DUX_CLOCK_INVALID').toISOString();
}

function safeNow(now: () => Date): string {
  try {
    return validNow(now);
  } catch {
    return new Date().toISOString();
  }
}

function validDate(value: Date, code: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new HttpError(500, code, 'No se pudo determinar el tiempo de sincronización Dux.');
  }
  return value;
}

function providerErrorCode(error: unknown): string {
  if (error instanceof HttpError) return error.code.slice(0, 300);
  return 'DUX_SYNC_FAILED';
}

function invalidDatabaseProjection(): HttpError {
  return new HttpError(
    503,
    'DUX_SNAPSHOT_INVALID',
    'La proyección de inventario Dux no es válida.',
  );
}

function invalidInventoryKey(): HttpError {
  return new HttpError(
    502,
    'DUX_INVENTORY_KEY_INVALID',
    'Dux devolvió una identidad de inventario que excede el límite seguro.',
  );
}
