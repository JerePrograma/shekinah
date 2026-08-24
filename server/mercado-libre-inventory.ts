import { HttpError } from './http';
import { getMercadoLibreAccess, mercadoLibreApiJson } from './mercado-libre';
import type { MercadoLibreCatalogUnit } from './mercado-libre-catalog';
import { getMappedCatalogUnit } from './mercado-libre-catalog';
import type { D1Database, Env } from './platform';

type InventoryLine = Readonly<{
  productId: string;
  quantity: number;
  expectedCatalogVersion: string;
}>;

type WarehouseLocation = Readonly<{
  id: string;
  quantity: number;
}>;

type WarehouseSnapshot = Readonly<{
  version: string;
  locations: readonly WarehouseLocation[];
  total: number;
}>;

type OperationRow = Readonly<{
  id: string;
  inventory_key: string;
  quantity: number;
  status: string;
  before_snapshot_json: string | null;
  after_snapshot_json: string | null;
}>;

export async function hasMercadoLibreInventoryReservation(
  database: D1Database,
  orderId: string,
): Promise<boolean> {
  let row: Readonly<{ present: number }> | null;
  try {
    row = await database.prepare(
      `SELECT 1 AS present FROM mercadolibre_inventory_operations
       WHERE order_id = ? AND action = 'reserve' LIMIT 1`,
    )
    .bind(orderId)
    .first<Readonly<{ present: number }>>();
  } catch (error: unknown) {
    if (error instanceof Error && /no such table:\s*mercadolibre_inventory_operations/iu.test(error.message)) {
      return false;
    }
    throw error;
  }
  return row !== null;
}

export async function reserveMercadoLibreInventory(
  database: D1Database,
  env: Env,
  orderId: string,
  lines: readonly InventoryLine[],
): Promise<void> {
  const { accessToken } = await getMercadoLibreAccess(database, env);
  const reserved: MercadoLibreCatalogUnit[] = [];
  try {
    const sorted = [...lines].sort((left, right) => left.productId.localeCompare(right.productId));
    for (const line of sorted) {
      const unit = await getMappedCatalogUnit(database, env, line.productId);
      if (unit.catalogVersion !== line.expectedCatalogVersion) {
        throw new HttpError(409, 'CATALOG_VERSION_CONFLICT', `${unit.title} cambió desde que se agregó al carrito.`);
      }
      if (!unit.sellable || !unit.checkoutEligible) {
        throw new HttpError(
          409,
          unit.availableQuantity < line.quantity ? 'INSUFFICIENT_STOCK' : 'MERCADO_LIBRE_STOCK_UNPROTECTED',
          unit.availableQuantity < line.quantity
            ? `No hay stock suficiente para ${unit.title}.`
            : `${unit.title} requiere confirmación de disponibilidad.`,
        );
      }
      await reserveUnit(database, accessToken, orderId, unit, line.quantity);
      reserved.push(unit);
    }
  } catch (error: unknown) {
    for (const unit of reserved.reverse()) {
      try {
        await releaseUnit(database, accessToken, orderId, unit);
      } catch {
        await markCompensationPending(database, orderId, unit.inventoryKey);
      }
    }
    throw error;
  }
}

export async function releaseMercadoLibreInventory(
  database: D1Database,
  env: Env,
  orderId: string,
): Promise<void> {
  const { accessToken } = await getMercadoLibreAccess(database, env);
  const operations = await database
    .prepare(
      `SELECT id, inventory_key, quantity, status,
              before_snapshot_json, after_snapshot_json
       FROM mercadolibre_inventory_operations
       WHERE order_id = ? AND action = 'reserve'
         AND status IN ('applied', 'confirmed', 'compensation_pending', 'uncertain')
       ORDER BY inventory_key`,
    )
    .bind(orderId)
    .all<OperationRow>();
  for (const operation of operations.results ?? []) {
    const unit = await readUnitByInventoryKey(database, operation.inventory_key);
    if (unit === null) {
      await markCompensationPending(database, orderId, operation.inventory_key);
      continue;
    }
    await releaseUnit(database, accessToken, orderId, unit);
  }
}

export async function consumeMercadoLibreInventoryReservation(
  database: D1Database,
  orderId: string,
  env?: Env,
): Promise<void> {
  const compensated = await database
    .prepare(
      `SELECT inventory_key, quantity
       FROM mercadolibre_inventory_operations
       WHERE order_id = ? AND action = 'reserve' AND status = 'compensated'`,
    )
    .bind(orderId)
    .all<Readonly<{ inventory_key: string; quantity: number }>>();
  if ((compensated.results?.length ?? 0) > 0) {
    if (env === undefined) {
      throw new HttpError(409, 'PAYMENT_APPROVED_STOCK_CONFLICT', 'El pago fue aprobado después de liberar la reserva.');
    }
    const lines: InventoryLine[] = [];
    for (const reservation of compensated.results ?? []) {
      const unit = await readUnitByInventoryKey(database, reservation.inventory_key);
      if (unit?.localProductId === null || unit?.localProductId === undefined) {
        await markCompensationPending(database, orderId, reservation.inventory_key);
        throw new HttpError(409, 'PAYMENT_APPROVED_STOCK_CONFLICT', 'El pago aprobado no tiene stock conciliable.');
      }
      lines.push(Object.freeze({
        productId: unit.localProductId,
        quantity: reservation.quantity,
        expectedCatalogVersion: unit.catalogVersion,
      }));
    }
    try {
      await reserveMercadoLibreInventory(database, env, orderId, lines);
    } catch {
      throw new HttpError(409, 'PAYMENT_APPROVED_STOCK_CONFLICT', 'El pago fue aprobado, pero el stock ya no está disponible.');
    }
  }
  const now = new Date().toISOString();
  const reservations = await database
    .prepare(
      `SELECT inventory_key, quantity
       FROM mercadolibre_inventory_operations
       WHERE order_id = ? AND action = 'reserve' AND status = 'confirmed'`,
    )
    .bind(orderId)
    .all<Readonly<{ inventory_key: string; quantity: number }>>();
  const statements = (reservations.results ?? []).map((reservation) => database
    .prepare(
      `INSERT INTO mercadolibre_inventory_operations (
        id, idempotency_key, order_id, inventory_key, action, quantity,
        status, attempted_at, applied_at, confirmed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'consume', ?, 'confirmed', ?, ?, ?, ?, ?)
      ON CONFLICT(idempotency_key) DO NOTHING`,
    )
    .bind(
      crypto.randomUUID(), `${orderId}:consume:${reservation.inventory_key}`,
      orderId, reservation.inventory_key, reservation.quantity,
      now, now, now, now, now,
    ));
  if (statements.length > 0) await database.batch(statements);
}

export async function markRefundForInventoryReview(
  database: D1Database,
  orderId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const reservations = await database
    .prepare(
      `SELECT inventory_key, quantity
       FROM mercadolibre_inventory_operations
       WHERE order_id = ? AND action = 'reserve' AND status IN ('confirmed', 'compensated')`,
    )
    .bind(orderId)
    .all<Readonly<{ inventory_key: string; quantity: number }>>();
  const statements = (reservations.results ?? []).map((reservation) => database
    .prepare(
      `INSERT INTO mercadolibre_inventory_operations (
        id, idempotency_key, order_id, inventory_key, action, quantity,
        status, error_code, attempted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'reconcile', ?, 'compensation_pending',
                'REFUND_REQUIRES_MANUAL_STOCK_POLICY', ?, ?, ?)
      ON CONFLICT(idempotency_key) DO NOTHING`,
    )
    .bind(
      crypto.randomUUID(), `${orderId}:refund-review:${reservation.inventory_key}`,
      orderId, reservation.inventory_key, reservation.quantity, now, now, now,
    ));
  if (statements.length > 0) await database.batch(statements);
}

export async function reconcileExpiredMercadoLibreReservations(
  database: D1Database,
  env: Env,
  limit = 10,
): Promise<Readonly<{ released: number; failed: number }>> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Límite de conciliación inválido.');
  }
  const now = new Date().toISOString();
  const result = await database
    .prepare(
      `SELECT DISTINCT orders.id, orders.channel
       FROM orders
       INNER JOIN mercadolibre_inventory_operations AS operations
         ON operations.order_id = orders.id AND operations.action = 'reserve'
       WHERE orders.stock_consumed_at IS NULL
         AND orders.stock_reservation_expires_at IS NOT NULL
         AND unixepoch(orders.stock_reservation_expires_at) <= unixepoch(?)
         AND operations.status IN (
           'pending', 'applied', 'confirmed', 'compensation_pending', 'uncertain'
         )
         AND NOT EXISTS (
           SELECT 1 FROM payments
           WHERE payments.order_id = orders.id AND payments.mapped_status = 'pending'
         )
       ORDER BY orders.id LIMIT ?`,
    )
    .bind(now, limit)
    .all<Readonly<{ id: string; channel: string }>>();
  let released = 0;
  let failed = 0;
  for (const order of result.results ?? []) {
    try {
      await releaseMercadoLibreInventory(database, env, order.id);
      if (order.channel === 'whatsapp') {
        await database
          .prepare(
            `UPDATE orders SET status = 'rejected', last_error_code = ?,
              resolved_at = ?, resolved_by = 'system:reservation-expiry', updated_at = ?
             WHERE id = ? AND channel = 'whatsapp' AND status = 'pending'`,
          )
          .bind('WHATSAPP_RESERVATION_EXPIRED', now, now, order.id)
          .run();
      } else {
        await database
          .prepare(
            `UPDATE orders SET status = 'failed', last_error_code = ?, updated_at = ?,
              stock_reservation_expires_at = ?
             WHERE id = ? AND channel = 'checkout_pro'
               AND status NOT IN ('approved', 'refunded')`,
          )
          .bind('CHECKOUT_RESERVATION_EXPIRED', now, now, order.id)
          .run();
      }
      released += 1;
    } catch {
      failed += 1;
    }
  }
  return Object.freeze({ released, failed });
}

async function reserveUnit(
  database: D1Database,
  accessToken: string,
  orderId: string,
  unit: MercadoLibreCatalogUnit,
  quantity: number,
): Promise<void> {
  if (unit.userProductId === null || unit.stockModel !== 'seller_warehouse_versioned') {
    throw new HttpError(409, 'MERCADO_LIBRE_STOCK_UNPROTECTED', `${unit.title} no admite una reserva segura.`);
  }
  const idempotencyKey = `${orderId}:reserve:${unit.inventoryKey}`;
  const existing = await database
    .prepare(
      `SELECT id, inventory_key, quantity, status,
              before_snapshot_json, after_snapshot_json
       FROM mercadolibre_inventory_operations WHERE idempotency_key = ? LIMIT 1`,
    )
    .bind(idempotencyKey)
    .first<OperationRow>();
  if (existing !== null) {
    if (existing.quantity !== quantity) throw idempotencyConflict();
    if (existing.status === 'confirmed') return;
    if (['pending', 'applied', 'uncertain', 'compensation_pending'].includes(existing.status)) {
      throw new HttpError(409, 'MERCADO_LIBRE_OPERATION_UNCERTAIN', 'La reserva requiere conciliación antes de continuar.');
    }
  }
  const now = new Date().toISOString();
  const operationId = existing?.id ?? crypto.randomUUID();
  if (existing === null) {
    await database
      .prepare(
        `INSERT INTO mercadolibre_inventory_operations (
          id, idempotency_key, order_id, inventory_key, action, quantity,
          status, attempted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'reserve', ?, 'pending', ?, ?, ?)`,
      )
      .bind(operationId, idempotencyKey, orderId, unit.inventoryKey, quantity, now, now, now)
      .run();
  } else {
    await database
      .prepare(
        `UPDATE mercadolibre_inventory_operations
         SET status = 'pending', before_quantity = NULL, after_quantity = NULL,
             upstream_version_before = NULL, upstream_version_after = NULL,
             before_snapshot_json = NULL, after_snapshot_json = NULL,
             error_code = NULL, attempted_at = ?, applied_at = NULL,
             confirmed_at = NULL, updated_at = ? WHERE id = ?`,
      )
      .bind(now, now, operationId)
      .run();
  }
  const before = await readWarehouseSnapshot(accessToken, unit.userProductId);
  if (before.total < quantity) {
    await failOperation(database, operationId, 'INSUFFICIENT_STOCK');
    throw new HttpError(409, 'INSUFFICIENT_STOCK', `No hay stock suficiente para ${unit.title}.`);
  }
  const afterLocations = decrementLocations(before.locations, quantity);
  await database
    .prepare(
      `UPDATE mercadolibre_inventory_operations
       SET before_quantity = ?, after_quantity = ?, upstream_version_before = ?,
           before_snapshot_json = ?, after_snapshot_json = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(
      before.total, before.total - quantity, before.version,
      JSON.stringify(before.locations), JSON.stringify(afterLocations), now, operationId,
    )
    .run();
  try {
    await writeWarehouseSnapshot(accessToken, unit.userProductId, before.version, afterLocations);
  } catch (error: unknown) {
    await database
      .prepare(
        `UPDATE mercadolibre_inventory_operations
         SET status = 'uncertain', error_code = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(errorCode(error), new Date().toISOString(), operationId)
      .run();
    throw new HttpError(409, 'MERCADO_LIBRE_OPERATION_UNCERTAIN', 'No se pudo confirmar la reserva de stock.');
  }
  await database
    .prepare(
      `UPDATE mercadolibre_inventory_operations
       SET status = 'applied', applied_at = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(new Date().toISOString(), new Date().toISOString(), operationId)
    .run();
  const confirmed = await readWarehouseSnapshot(accessToken, unit.userProductId);
  if (confirmed.total !== before.total - quantity) {
    await markCompensationPending(database, orderId, unit.inventoryKey);
    throw new HttpError(409, 'MERCADO_LIBRE_OPERATION_UNCERTAIN', 'La reserva de stock requiere conciliación.');
  }
  const confirmedAt = new Date().toISOString();
  await database.batch([
    database
      .prepare(
        `UPDATE mercadolibre_inventory_operations
         SET status = 'confirmed', after_quantity = ?, upstream_version_after = ?,
             confirmed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(confirmed.total, confirmed.version, confirmedAt, confirmedAt, operationId),
    database
      .prepare(
        `UPDATE mercadolibre_catalog_units
         SET available_quantity = ?, upstream_version = ?, stock_snapshot_json = ?,
             last_synced_at = ?, updated_at = ? WHERE inventory_key = ?`,
      )
      .bind(
        confirmed.total, confirmed.version, serializeCatalogLocations(confirmed.locations),
        confirmedAt, confirmedAt, unit.inventoryKey,
      ),
  ]);
}

async function releaseUnit(
  database: D1Database,
  accessToken: string,
  orderId: string,
  unit: MercadoLibreCatalogUnit,
): Promise<void> {
  if (unit.userProductId === null) {
    await markCompensationPending(database, orderId, unit.inventoryKey);
    throw reconciliationRequired();
  }
  const reserve = await database
    .prepare(
      `SELECT id, inventory_key, quantity, status,
              before_snapshot_json, after_snapshot_json
       FROM mercadolibre_inventory_operations
       WHERE idempotency_key = ? LIMIT 1`,
    )
    .bind(`${orderId}:reserve:${unit.inventoryKey}`)
    .first<OperationRow>();
  if (reserve === null || reserve.status === 'compensated') return;
  if (reserve.status === 'uncertain' || reserve.status === 'compensation_pending') {
    await markCompensationPending(database, orderId, unit.inventoryKey);
    throw reconciliationRequired();
  }
  const releaseKey = `${orderId}:release:${unit.inventoryKey}`;
  const existingRelease = await database
    .prepare('SELECT status FROM mercadolibre_inventory_operations WHERE idempotency_key = ? LIMIT 1')
    .bind(releaseKey)
    .first<Readonly<{ status: string }>>();
  if (existingRelease?.status === 'confirmed') return;
  if (existingRelease !== null) {
    await markCompensationPending(database, orderId, unit.inventoryKey);
    throw reconciliationRequired();
  }
  const beforeReservation = parseLocations(reserve.before_snapshot_json);
  const afterReservation = parseLocations(reserve.after_snapshot_json);
  if (beforeReservation === null || afterReservation === null) {
    await markCompensationPending(database, orderId, unit.inventoryKey);
    throw reconciliationRequired();
  }
  const deltas = locationDeltas(beforeReservation, afterReservation);
  if (deltas.reduce((sum, delta) => sum + delta.quantity, 0) !== reserve.quantity) {
    await markCompensationPending(database, orderId, unit.inventoryKey);
    throw reconciliationRequired();
  }
  const current = await readWarehouseSnapshot(accessToken, unit.userProductId);
  const restored = incrementLocations(current.locations, deltas);
  const now = new Date().toISOString();
  const operationId = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO mercadolibre_inventory_operations (
        id, idempotency_key, order_id, inventory_key, action, quantity, status,
        before_quantity, after_quantity, upstream_version_before,
        before_snapshot_json, after_snapshot_json, attempted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'release', ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(idempotency_key) DO NOTHING`,
    )
    .bind(
      operationId, releaseKey, orderId, unit.inventoryKey, reserve.quantity,
      current.total, current.total + reserve.quantity, current.version,
      JSON.stringify(current.locations), JSON.stringify(restored), now, now, now,
    )
    .run();
  try {
    await writeWarehouseSnapshot(accessToken, unit.userProductId, current.version, restored);
    const confirmed = await readWarehouseSnapshot(accessToken, unit.userProductId);
    if (confirmed.total !== current.total + reserve.quantity) {
      throw new HttpError(409, 'MERCADO_LIBRE_RELEASE_MISMATCH', 'La liberación requiere conciliación.');
    }
    const confirmedAt = new Date().toISOString();
    await database.batch([
      database
        .prepare(
          `UPDATE mercadolibre_inventory_operations
           SET status = 'confirmed', applied_at = ?, confirmed_at = ?,
               upstream_version_after = ?, updated_at = ?
           WHERE idempotency_key = ?`,
        )
        .bind(confirmedAt, confirmedAt, confirmed.version, confirmedAt, releaseKey),
      database
        .prepare(
          `UPDATE mercadolibre_inventory_operations
           SET status = 'compensated', updated_at = ? WHERE id = ?`,
        )
        .bind(confirmedAt, reserve.id),
      database
        .prepare(
          `UPDATE mercadolibre_catalog_units
           SET available_quantity = ?, upstream_version = ?, stock_snapshot_json = ?,
               last_synced_at = ?, updated_at = ? WHERE inventory_key = ?`,
        )
        .bind(
          confirmed.total, confirmed.version, serializeCatalogLocations(confirmed.locations),
          confirmedAt, confirmedAt, unit.inventoryKey,
        ),
    ]);
  } catch (error: unknown) {
    await database
      .prepare(
        `UPDATE mercadolibre_inventory_operations
         SET status = 'uncertain', error_code = ?, updated_at = ?
         WHERE idempotency_key = ?`,
      )
      .bind(errorCode(error), new Date().toISOString(), releaseKey)
      .run();
    await markCompensationPending(database, orderId, unit.inventoryKey);
    throw error;
  }
}

async function readWarehouseSnapshot(
  accessToken: string,
  userProductId: string,
): Promise<WarehouseSnapshot> {
  const response = await mercadoLibreApiJson(`/user-products/${encodeURIComponent(userProductId)}/stock`, accessToken);
  if (!isRecord(response.body) || !Array.isArray(response.body.locations)) throw providerShapeError();
  const version = response.headers.get('x-version')?.trim() ?? '';
  if (version === '') throw new HttpError(409, 'MERCADO_LIBRE_STOCK_VERSION_MISSING', 'El stock no admite una reserva segura.');
  const locations = Object.freeze(response.body.locations.map((candidate) => {
    if (!isRecord(candidate) || candidate.type !== 'seller_warehouse') {
      throw new HttpError(409, 'MERCADO_LIBRE_STOCK_UNPROTECTED', 'El stock utiliza una modalidad no reservable.');
    }
    const id = safeId(candidate.store_id ?? candidate.location_id ?? candidate.id);
    const quantity = candidate.quantity;
    if (id === null || typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 0) {
      throw providerShapeError();
    }
    return Object.freeze({ id, quantity });
  }));
  return Object.freeze({
    version,
    locations,
    total: locations.reduce((sum, location) => sum + location.quantity, 0),
  });
}

async function writeWarehouseSnapshot(
  accessToken: string,
  userProductId: string,
  version: string,
  locations: readonly WarehouseLocation[],
): Promise<void> {
  await mercadoLibreApiJson(
    `/user-products/${encodeURIComponent(userProductId)}/stock/type/seller_warehouse`,
    accessToken,
    {
      method: 'PUT',
      headers: { 'x-version': version },
      body: { locations: locations.map((location) => ({ store_id: location.id, quantity: location.quantity })) },
    },
  );
}

async function readUnitByInventoryKey(
  database: D1Database,
  inventoryKey: string,
): Promise<MercadoLibreCatalogUnit | null> {
  const row = await database
    .prepare('SELECT local_product_id FROM mercadolibre_catalog_units WHERE inventory_key = ? LIMIT 1')
    .bind(inventoryKey)
    .first<Readonly<{ local_product_id: string | null }>>();
  if (row?.local_product_id === null || row?.local_product_id === undefined) return null;
  const units = await database
    .prepare(
      `SELECT inventory_key FROM mercadolibre_catalog_units
       WHERE local_product_id = ? AND inventory_key = ? LIMIT 1`,
    )
    .bind(row.local_product_id, inventoryKey)
    .first<Readonly<{ inventory_key: string }>>();
  if (units === null) return null;
  // La lectura operativa no requiere frescura para compensar; se reconstruye con la fila.
  const full = await database
    .prepare('SELECT * FROM mercadolibre_catalog_units WHERE inventory_key = ? LIMIT 1')
    .bind(inventoryKey)
    .first<Record<string, unknown>>();
  return full === null ? null : rowToUnit(full);
}

function rowToUnit(row: Record<string, unknown>): MercadoLibreCatalogUnit {
  const locations = parseLocations(typeof row.stock_snapshot_json === 'string' ? row.stock_snapshot_json : null) ?? [];
  return Object.freeze({
    inventoryKey: String(row.inventory_key), sellerId: String(row.seller_id),
    itemId: String(row.item_id), variationId: nullableString(row.variation_id),
    userProductId: nullableString(row.user_product_id), sellerSku: nullableString(row.seller_sku),
    localProductId: nullableString(row.local_product_id), title: String(row.title),
    priceMinor: Number(row.price_minor), currency: String(row.currency),
    itemStatus: String(row.item_status), availableQuantity: Number(row.available_quantity),
    stockModel: String(row.stock_model) as MercadoLibreCatalogUnit['stockModel'],
    stockLocationId: nullableString(row.stock_location_id),
    upstreamVersion: nullableString(row.upstream_version), stockLocations: locations.map((location) => ({ type: 'seller_warehouse', ...location })),
    primaryImageUrl: nullableString(row.primary_image_url), permalink: nullableString(row.permalink),
    providerUpdatedAt: nullableString(row.provider_updated_at), catalogVersion: String(row.catalog_version),
    mappingStatus: String(row.mapping_status) as MercadoLibreCatalogUnit['mappingStatus'],
    sellable: row.sellable === 1, checkoutEligible: row.checkout_eligible === 1,
    lastSyncStatus: String(row.last_sync_status) as MercadoLibreCatalogUnit['lastSyncStatus'],
    lastSyncErrorCode: nullableString(row.last_sync_error_code), lastSyncedAt: String(row.last_synced_at),
  });
}

async function markCompensationPending(
  database: D1Database,
  orderId: string,
  inventoryKey: string,
): Promise<void> {
  await database
    .prepare(
      `UPDATE mercadolibre_inventory_operations
       SET status = 'compensation_pending', updated_at = ?
       WHERE order_id = ? AND inventory_key = ? AND action = 'reserve'
         AND status NOT IN ('compensated', 'failed')`,
    )
    .bind(new Date().toISOString(), orderId, inventoryKey)
    .run();
}

async function failOperation(database: D1Database, id: string, code: string): Promise<void> {
  await database
    .prepare(
      `UPDATE mercadolibre_inventory_operations
       SET status = 'failed', error_code = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(code, new Date().toISOString(), id)
    .run();
}

function decrementLocations(
  locations: readonly WarehouseLocation[],
  quantity: number,
): readonly WarehouseLocation[] {
  let remaining = quantity;
  const sorted = [...locations].sort((left, right) => left.id.localeCompare(right.id));
  const result = sorted.map((location) => {
    const consumed = Math.min(location.quantity, remaining);
    remaining -= consumed;
    return Object.freeze({ id: location.id, quantity: location.quantity - consumed });
  });
  if (remaining !== 0) throw new Error('Stock insuficiente para reservar.');
  return Object.freeze(result);
}

function locationDeltas(
  before: readonly WarehouseLocation[],
  after: readonly WarehouseLocation[],
): readonly WarehouseLocation[] {
  const afterById = new Map(after.map((location) => [location.id, location.quantity]));
  return Object.freeze(before.map((location) => Object.freeze({
    id: location.id,
    quantity: location.quantity - (afterById.get(location.id) ?? location.quantity),
  })).filter((location) => location.quantity > 0));
}

function incrementLocations(
  current: readonly WarehouseLocation[],
  deltas: readonly WarehouseLocation[],
): readonly WarehouseLocation[] {
  const deltaById = new Map(deltas.map((delta) => [delta.id, delta.quantity]));
  const ids = new Set(current.map((location) => location.id));
  if (deltas.some((delta) => !ids.has(delta.id))) {
    throw new HttpError(409, 'MERCADO_LIBRE_LOCATION_CHANGED', 'La ubicación de stock cambió y requiere conciliación.');
  }
  return Object.freeze(current.map((location) => Object.freeze({
    id: location.id,
    quantity: location.quantity + (deltaById.get(location.id) ?? 0),
  })));
}

function parseLocations(value: string | null): readonly WarehouseLocation[] | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    return Object.freeze(parsed.map((candidate) => {
      if (!isRecord(candidate)) throw new Error('Snapshot inválido.');
      const id = safeId(candidate.id);
      if (id === null || typeof candidate.quantity !== 'number' || !Number.isSafeInteger(candidate.quantity) || candidate.quantity < 0) {
        throw new Error('Snapshot inválido.');
      }
      return Object.freeze({ id, quantity: candidate.quantity });
    }));
  } catch {
    return null;
  }
}

function serializeCatalogLocations(locations: readonly WarehouseLocation[]): string {
  return JSON.stringify(locations.map((location) => ({
    type: 'seller_warehouse',
    id: location.id,
    quantity: location.quantity,
  })));
}

function safeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text !== '' && text.length <= 120 && /^[A-Za-z0-9._:-]+$/u.test(text) ? text : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function errorCode(error: unknown): string {
  return error instanceof HttpError ? error.code : 'MERCADO_LIBRE_OPERATION_FAILED';
}

function providerShapeError(): HttpError {
  return new HttpError(502, 'MERCADO_LIBRE_RESPONSE_INVALID', 'Mercado Libre devolvió una respuesta no válida.');
}

function idempotencyConflict(): HttpError {
  return new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'La operación idempotente no coincide con la reserva original.');
}

function reconciliationRequired(): HttpError {
  return new HttpError(
    409,
    'MERCADO_LIBRE_OPERATION_UNCERTAIN',
    'La operación de stock requiere conciliación antes de continuar.',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
