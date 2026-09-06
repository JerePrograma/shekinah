import {
  isDuxCatalogMigrationRequiredError,
  persistDuxCatalogSnapshot,
  readDuxCatalogSnapshot,
  type DuxCatalogSourceItem,
  type DuxCatalogSyncSummary,
} from './dux-catalog';
import { HttpError } from './http';
import type { D1Database, Env } from './platform';

export const DUX_CATALOG_CONTROL_MIGRATION = '0017_dux_complete_public_catalog.sql';
export const DUX_CATALOG_COMPANY_ID = '12862';

export type DuxCatalogControl = Readonly<{
  migrationApplied: boolean;
  companyId: string;
  snapshotCollectionEnabled: boolean;
  publicCatalogEnabled: boolean;
  publicCutoverEnabled: boolean;
}>;

export type ControlledDuxCatalogSnapshotResult =
  | Readonly<{ status: 'disabled' }>
  | Readonly<{ status: 'persisted'; summary: DuxCatalogSyncSummary }>;

type ControlRow = Readonly<{
  company_id: unknown;
  snapshot_collection_enabled: unknown;
  public_catalog_enabled: unknown;
  public_cutover_enabled: unknown;
}>;

export async function readDuxCatalogControl(
  database: D1Database,
): Promise<DuxCatalogControl> {
  let row: ControlRow | null;
  try {
    row = await database
      .prepare(
        `SELECT company_id, snapshot_collection_enabled, public_catalog_enabled, public_cutover_enabled
         FROM dux_catalog_control
         WHERE company_id = ?1`,
      )
      .bind(DUX_CATALOG_COMPANY_ID)
      .first<ControlRow>();
  } catch (error: unknown) {
    if (isMissingControlTable(error)) {
      return Object.freeze({
        migrationApplied: false,
        companyId: DUX_CATALOG_COMPANY_ID,
        snapshotCollectionEnabled: false,
        publicCatalogEnabled: false,
        publicCutoverEnabled: false,
      });
    }
    throw error;
  }
  if (row === null || row.company_id !== DUX_CATALOG_COMPANY_ID) {
    throw controlProjectionInvalid();
  }
  return Object.freeze({
    migrationApplied: true,
    companyId: DUX_CATALOG_COMPANY_ID,
    snapshotCollectionEnabled: databaseFlag(row.snapshot_collection_enabled),
    publicCatalogEnabled: databaseFlag(row.public_catalog_enabled),
    publicCutoverEnabled: databaseFlag(row.public_cutover_enabled),
  });
}

export function requireExpectedDuxCompany(env: Env): string {
  const configured = env.DUX_COMPANY_ID?.trim();
  if (configured !== DUX_CATALOG_COMPANY_ID) {
    throw new HttpError(
      503,
      'DUX_CATALOG_COMPANY_MISMATCH',
      'La empresa Dux configurada no coincide con el catálogo editorial aprobado.',
    );
  }
  return configured;
}

export async function updateDuxCatalogControl(
  database: D1Database,
  actor: string,
  requested: Readonly<{
    snapshotCollectionEnabled?: boolean;
    publicCatalogEnabled?: boolean;
    publicCutoverEnabled?: boolean;
  }>,
): Promise<DuxCatalogControl> {
  const current = await readDuxCatalogControl(database);
  if (!current.migrationApplied) throw controlMigrationRequired();
  const nextCutover = requested.publicCutoverEnabled ?? current.publicCutoverEnabled;
  if (requested.publicCatalogEnabled === true || nextCutover) {
    await requireVerifiedDuxCatalogTenant(database);
    let snapshot;
    try {
      snapshot = await readDuxCatalogSnapshot(database);
    } catch (error: unknown) {
      if (error instanceof HttpError && error.code === 'DUX_CATALOG_SNAPSHOT_UNAVAILABLE') {
        throw new HttpError(409, nextCutover ? 'DUX_CATALOG_CUTOVER_REQUIRES_SNAPSHOT' : 'DUX_CATALOG_PUBLIC_REQUIRES_SNAPSHOT', 'Se necesita un snapshot Dux válido y no vacío.');
      }
      throw error;
    }
    if (snapshot.itemCount === 0) {
      throw new HttpError(409, 'DUX_CATALOG_PUBLIC_REQUIRES_SNAPSHOT', 'Se necesita un snapshot Dux válido y no vacío.');
    }
    if (nextCutover) {
      if (snapshot.items.some((item) => item.priceStatus !== 'usable')) {
        throw new HttpError(409, 'DUX_CATALOG_CUTOVER_PRICE_INVALID', 'Los precios no disponibles bloquean el corte comercial.');
      }
      throw new HttpError(409, 'DUX_ORDER_LIFECYCLE_UNAVAILABLE', 'El comercio requiere unidad y ciclo de reservas Dux verificados.');
    }
  }
  const safeActor = normalizeActor(actor);
  const now = new Date().toISOString();
  try {
    const result = await database
      .prepare(
        `UPDATE dux_catalog_control
         SET snapshot_collection_enabled = COALESCE(?1, snapshot_collection_enabled),
             public_cutover_enabled = COALESCE(?2, public_cutover_enabled),
             public_catalog_enabled = COALESCE(?6, public_catalog_enabled),
             updated_by = ?3,
             updated_at = ?4
         WHERE company_id = ?5`,
      )
      .bind(
        requested.snapshotCollectionEnabled === undefined ? null : requested.snapshotCollectionEnabled ? 1 : 0,
        requested.publicCutoverEnabled === undefined ? null : requested.publicCutoverEnabled ? 1 : 0,
        safeActor,
        now,
        DUX_CATALOG_COMPANY_ID,
        requested.publicCatalogEnabled === undefined ? null : requested.publicCatalogEnabled ? 1 : 0,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1) throw controlProjectionInvalid();
  } catch (error: unknown) {
    if (isMissingControlTable(error)) throw controlMigrationRequired();
    if (hasErrorCode(error, 'DUX_CATALOG_CUTOVER_REQUIRES_SNAPSHOT')) {
      throw new HttpError(
        409,
        'DUX_CATALOG_CUTOVER_REQUIRES_SNAPSHOT',
        'El cutover público requiere un snapshot Dux válido.',
      );
    }
    if (hasErrorCode(error, 'DUX_CATALOG_CUTOVER_PRICE_INVALID')) {
      throw new HttpError(
        409,
        'DUX_CATALOG_CUTOVER_PRICE_INVALID',
        'El snapshot Dux contiene precios que bloquean el cutover público.',
      );
    }
    throw error;
  }
  return readDuxCatalogControl(database);
}

export async function requireVerifiedDuxCatalogTenant(database: D1Database): Promise<void> {
  const tenant = await database.prepare('SELECT company_id FROM dux_tenant_context WHERE id = 1')
    .first<Readonly<{ company_id: unknown }>>();
  if (tenant?.company_id !== DUX_CATALOG_COMPANY_ID) {
    throw new HttpError(409, 'DUX_CATALOG_TENANT_MISMATCH', 'La empresa Dux no coincide con el tenant verificado.');
  }
}

export async function persistDuxCatalogSnapshotWhenEnabled(
  database: D1Database,
  env: Env,
  inventoryRunId: string,
  sourceItems: readonly DuxCatalogSourceItem[],
  syncedAt: string,
): Promise<ControlledDuxCatalogSnapshotResult> {
  const control = await readDuxCatalogControl(database);
  if (!control.migrationApplied || !control.snapshotCollectionEnabled) {
    return Object.freeze({ status: 'disabled' as const });
  }
  requireExpectedDuxCompany(env);
  try {
    const summary = await persistDuxCatalogSnapshot(
      database,
      inventoryRunId,
      sourceItems,
      syncedAt,
    );
    return Object.freeze({ status: 'persisted' as const, summary });
  } catch (error: unknown) {
    if (isDuxCatalogMigrationRequiredError(error)) throw error;
    if (hasErrorCode(error, 'DUX_CATALOG_SNAPSHOT_COLLECTION_DISABLED')) {
      return Object.freeze({ status: 'disabled' as const });
    }
    if (hasErrorCode(error, 'DUX_CATALOG_PUBLIC_PRICE_INVALID')) {
      throw new HttpError(
        409,
        'DUX_CATALOG_PUBLIC_PRICE_INVALID',
        'El nuevo snapshot Dux contiene precios incompatibles con el cutover activo.',
      );
    }
    throw error;
  }
}

function databaseFlag(value: unknown): boolean {
  if (value === 0) return false;
  if (value === 1) return true;
  throw controlProjectionInvalid();
}

function normalizeActor(actor: string): string {
  const normalized = actor.trim();
  if (normalized.length === 0 || normalized.length > 512) {
    throw new HttpError(400, 'ADMIN_ACTOR_INVALID', 'La identidad administrativa no es válida.');
  }
  return normalized;
}

function isMissingControlTable(error: unknown): boolean {
  return hasErrorCode(error, 'no such table: dux_catalog_control') ||
    hasErrorCode(error, 'no such column: public_catalog_enabled');
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && error.message.includes(code);
}

function controlMigrationRequired(): HttpError {
  return new HttpError(
    503,
    'DUX_CATALOG_CONTROL_MIGRATION_REQUIRED',
    `Falta aplicar la migración ${DUX_CATALOG_CONTROL_MIGRATION}.`,
  );
}

function controlProjectionInvalid(): HttpError {
  return new HttpError(
    503,
    'DUX_CATALOG_CONTROL_INVALID',
    'El control persistido del catálogo Dux no es válido.',
  );
}
