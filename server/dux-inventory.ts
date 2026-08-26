import type { CatalogProductDetail } from '../src/catalog/model';
import { readDuxSnapshotMaxAgeSeconds, requireDuxApiEnabled } from './config';
import { sha256Hex } from './crypto';
import {
  DuxApiClient,
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
const WRITE_BATCH_SIZE = 50;
const DUX_API_VERSION = 'v2';
const QUANTITY_SEMANTICS_STATUS = 'unavailable_from_v2_items';

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

type MappedInventoryItems = Readonly<{
  units: readonly PendingInventoryUnit[];
  missingStockCount: number;
}>;

type PersistedMappingRow = Readonly<{
  inventory_key: unknown;
  local_product_id: unknown;
  mapping_status: unknown;
  mapping_source: unknown;
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
    await assertDuxSyncCooldown(database, validNow(now));
    const client = options.client ?? new DuxApiClient({
      accessToken: config.accessToken,
      beforeRequest: () => heartbeatSync(database, runId),
    });
    const tenant = await verifyTenant(client, config, startedAt);
    const items = await client.listItems({ warehouseId: config.depositId, enabled: true });
    const mappedItems = await mapInventoryItems(
      database,
      config,
      items,
      options.localProducts,
    );
    const rows = await Promise.all(mappedItems.units.map((unit) => (
      persistableUnit(unit, tenant, startedAt)
    )));
    await persistTenant(database, tenant, startedAt);
    await writeInventoryRows(database, rows, startedAt);
    const currentKeys = new Set(rows.map((row) => row.inventoryKey));
    const absent = await markAbsentInventoryRows(database, currentKeys, startedAt);
    const mapped = rows.filter((row) => row.mapping.status === 'mapped').length;
    const unmapped = rows.filter((row) => row.mapping.status === 'unmapped').length;
    const ambiguous = rows.filter((row) => row.mapping.status === 'ambiguous').length;
    const failed = mappedItems.missingStockCount;
    const status = failed === 0 ? 'succeeded' : 'partial';
    const completedAt = validNow(now);
    await database
      .prepare(
        `UPDATE dux_sync_runs
         SET status = ?1, processed_count = ?2, mapped_count = ?3,
             unmapped_count = ?4, ambiguous_count = ?5, absent_count = ?6,
             failed_count = ?7, error_code = NULL, completed_at = ?8, updated_at = ?8
         WHERE id = ?9 AND status = 'running'`,
      )
      .bind(
        status,
        rows.length + failed,
        mapped,
        unmapped,
        ambiguous,
        absent,
        failed,
        completedAt,
        runId,
      )
      .run();
    return Object.freeze({
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
  } catch (error: unknown) {
    const completedAt = safeNow(now);
    await database
      .prepare(
        `UPDATE dux_sync_runs
         SET status = 'failed', failed_count = 1, error_code = ?1,
             completed_at = ?2, updated_at = ?2
         WHERE id = ?3 AND status = 'running'`,
      )
      .bind(providerErrorCode(error), completedAt, runId)
      .run();
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
    .prepare('SELECT * FROM dux_inventory_items ORDER BY local_product_id, inventory_key')
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
      `SELECT * FROM dux_inventory_items
       WHERE local_product_id = ?1 AND mapping_status = 'mapped'
       ORDER BY CASE WHEN last_sync_status = 'absent' THEN 1 ELSE 0 END, inventory_key`,
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
  return `dux:v2:${company}:${deposit}:${encodeURIComponent(code)}:${detail}`;
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
): Promise<MappedInventoryItems> {
  const existingMappings = await readPersistedMappings(database);
  const productsById = groupProducts(localProducts, (product) => product.id);
  const productsBySku = groupProducts(localProducts, (product) => product.sku ?? null);
  const productsByName = groupProducts(localProducts, (product) => normalizeExactName(product.name));
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
  const exactName = productsByName.get(normalizeExactName(item.name)) ?? [];
  const byName = candidateDecision(exactName, 'exact_name');
  if (byName !== null) return byName;
  return Object.freeze({
    status: 'unmapped' as const,
    source: null,
    localProductId: null,
    candidates: Object.freeze([]),
  });
}

function candidateDecision(
  products: readonly CatalogProductDetail[],
  source: 'codigo_externo' | 'sku' | 'exact_name',
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

function normalizeExactName(value: string): string {
  return value.normalize('NFKC').trim().replaceAll(/\s+/gu, ' ').toLocaleLowerCase('es-AR');
}

async function readPersistedMappings(
  database: D1Database,
): Promise<ReadonlyMap<string, MappingDecision>> {
  const result = await database
    .prepare(
      `SELECT inventory_key, local_product_id, mapping_status, mapping_source
       FROM dux_inventory_items WHERE local_product_id IS NOT NULL`,
    )
    .all<PersistedMappingRow>();
  const mappings = new Map<string, MappingDecision>();
  for (const row of result.results ?? []) {
    const inventoryKey = databaseText(row.inventory_key, 1_000);
    const localProductId = nullableDatabaseText(row.local_product_id, 180);
    const status = mappingStatus(row.mapping_status);
    const source = mappingSource(row.mapping_source);
    if (localProductId !== null && source !== null && (status === 'mapped' || status === 'ambiguous')) {
      mappings.set(inventoryKey, mappedDecision(localProductId, 'persisted'));
    }
  }
  return mappings;
}

async function persistableUnit(
  unit: PendingInventoryUnit,
  tenant: DuxTenantContext,
  syncedAt: string,
): Promise<PendingInventoryUnit & Readonly<{
  tenant: DuxTenantContext;
  barcode: string | null;
  rawSnapshot: string;
  catalogVersion: string;
  syncedAt: string;
}>> {
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

async function persistTenant(
  database: D1Database,
  tenant: DuxTenantContext,
  updatedAt: string,
): Promise<void> {
  await database
    .prepare(
      `INSERT INTO dux_tenant_context (
        id, api_version, company_id, company_name, branch_id, branch_name,
        deposit_id, deposit_name, verified_at, updated_at
      ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
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
      tenant.apiVersion,
      tenant.companyId,
      tenant.companyName,
      tenant.branchId,
      tenant.branchName,
      tenant.depositId,
      tenant.depositName,
      tenant.verifiedAt,
      updatedAt,
    )
    .run();
}

async function writeInventoryRows(
  database: D1Database,
  rows: readonly Awaited<ReturnType<typeof persistableUnit>>[],
  updatedAt: string,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += WRITE_BATCH_SIZE) {
    const statements = rows.slice(offset, offset + WRITE_BATCH_SIZE).map((row) => (
      inventoryUpsert(database, row, updatedAt)
    ));
    if (statements.length > 0) await database.batch(statements);
  }
}

function inventoryUpsert(
  database: D1Database,
  row: Awaited<ReturnType<typeof persistableUnit>>,
  updatedAt: string,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO dux_inventory_items (
        inventory_key, cod_item, id_det_item, codigo_externo, cod_barra, item_name,
        local_product_id, mapping_status, mapping_source, mapping_candidates_json,
        deposit_id, deposit_name, stock_real, stock_reservado, stock_disponible,
        units_per_package, unit_id, unit_name, unit_symbol, is_weighable,
        allows_decimal, commercial_quantity_step, quantity_semantics_status,
        checkout_eligible, catalog_version, raw_snapshot_json, last_sync_status,
        last_sync_error_code, last_synced_at, absent_since, created_at, updated_at
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
        ?16, NULL, NULL, NULL, NULL, NULL, NULL, ?17, 0, ?18, ?19, 'ok', NULL,
        ?20, NULL, ?21, ?21
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
        unit_id = NULL,
        unit_name = NULL,
        unit_symbol = NULL,
        is_weighable = NULL,
        allows_decimal = NULL,
        commercial_quantity_step = NULL,
        quantity_semantics_status = excluded.quantity_semantics_status,
        checkout_eligible = 0,
        catalog_version = excluded.catalog_version,
        raw_snapshot_json = excluded.raw_snapshot_json,
        last_sync_status = 'ok',
        last_sync_error_code = NULL,
        last_synced_at = excluded.last_synced_at,
        absent_since = NULL,
        updated_at = excluded.updated_at`,
    )
    .bind(
      row.inventoryKey,
      row.item.code,
      row.stock.variantDetailId === null ? null : String(row.stock.variantDetailId),
      row.item.externalCode,
      row.barcode,
      row.item.name,
      row.mapping.localProductId,
      row.mapping.status,
      row.mapping.source,
      JSON.stringify(row.mapping.candidates),
      row.tenant.depositId,
      row.stock.warehouseName,
      row.stock.realQuantity,
      row.stock.reservedQuantity,
      row.stock.availableQuantity,
      row.item.unitsPerPackage,
      QUANTITY_SEMANTICS_STATUS,
      row.catalogVersion,
      row.rawSnapshot,
      row.syncedAt,
      updatedAt,
    );
}

async function markAbsentInventoryRows(
  database: D1Database,
  currentKeys: ReadonlySet<string>,
  updatedAt: string,
): Promise<number> {
  const result = await database
    .prepare('SELECT inventory_key FROM dux_inventory_items')
    .all<Readonly<{ inventory_key: unknown }>>();
  const absentKeys = (result.results ?? [])
    .map((row) => databaseText(row.inventory_key, 1_000))
    .filter((key) => !currentKeys.has(key));
  for (let offset = 0; offset < absentKeys.length; offset += WRITE_BATCH_SIZE) {
    const statements = absentKeys.slice(offset, offset + WRITE_BATCH_SIZE).map((inventoryKey) => (
      database
        .prepare(
          `UPDATE dux_inventory_items
           SET checkout_eligible = 0, last_sync_status = 'absent',
               last_sync_error_code = NULL,
               absent_since = COALESCE(absent_since, ?1), updated_at = ?1
           WHERE inventory_key = ?2`,
        )
        .bind(updatedAt, inventoryKey)
    ));
    if (statements.length > 0) await database.batch(statements);
  }
  return absentKeys.length;
}

async function recoverAbandonedSync(database: D1Database, now: string): Promise<void> {
  await database
    .prepare(
      `UPDATE dux_sync_runs
       SET status = 'failed', error_code = 'DUX_SYNC_ABANDONED',
           completed_at = ?1, updated_at = ?1
       WHERE status = 'running'
         AND unixepoch(updated_at) <= unixepoch(?1, '-${SYNC_LEASE_MAX_AGE_MINUTES} minutes')`,
    )
    .bind(now)
    .run();
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
  const lastSyncedAt = databaseTimestamp(row.last_synced_at);
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
