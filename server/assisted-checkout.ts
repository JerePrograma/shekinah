import { fulfillmentCanonicalValue } from '../src/commerce/fulfillment';
import { parseAdminWebRequestDetail } from '../src/commerce/web-order-contracts';
import type { AdminWebRequestDetail } from '../src/commerce/web-order-contracts';
import { readDuxSnapshotMaxAgeSeconds } from './config';
import { randomToken, sha256Hex } from './crypto';
import { readDuxCatalogSnapshot } from './dux-catalog';
import { readDuxCatalogControl, requireExpectedDuxCompany, requireVerifiedDuxCatalogTenant } from './dux-catalog-control';
import { HttpError } from './http';
import type { D1Database, Env } from './platform';
import { getAdminWebOrderRequest } from './web-order-requests';
import { readInteger, readOptionalSafeText, readSafeText } from './validation';

const ASSISTED_ORDER_NUMBER_INDEX = 'idx_dux_assisted_order_number_unique';
const MAX_SHIPPING_MINOR = 2_000_000_000;

export type AssistedCheckoutInput = Readonly<{
  duxOrderNumber: string;
  duxOrderId: string | null;
  shippingMinor: number;
  confirmedExactReservation: true;
}>;

export type AssistedCheckoutLinePreview = Readonly<{
  productId: string;
  duxCode: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  subtotalMinor: number;
}>;

export type AssistedCheckoutPreview = Readonly<{
  requestId: string;
  catalogVersion: string;
  catalogObservedAt: string;
  lines: readonly AssistedCheckoutLinePreview[];
  itemCount: number;
  productsTotalMinor: number;
  deliveryMethod: 'coordinated_pickup' | 'correo_argentino';
  shippingMinor: number | null;
  totalMinor: number | null;
}>;

export type AssistedCheckoutPrepared = Readonly<{
  orderId: string;
  requestId: string;
  duxOrderNumber: string;
  duxOrderId: string | null;
  catalogVersion: string;
  itemCount: number;
  productsTotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  reservationState: 'confirmed';
  paymentStatus: 'not_requested';
  created: boolean;
}>;

type RequestIdentityRow = Readonly<{
  checkout_idempotency_key: string;
  web_request_token_hash: string;
  web_request_status: string;
}>;

type TenantRow = Readonly<{
  company_id: string;
  branch_id: string;
  deposit_id: string;
}>;

type PreparedRow = Readonly<{
  order_id: string;
  request_id: string;
  cart_fingerprint: string;
  total_minor: number;
  item_count: number;
  dux_order_number: string;
  dux_order_id: string | null;
  reservation_state: string;
  verification_method: string;
  shipping_minor: number;
  products_total_minor: number;
  provider_catalog_version: string | null;
  provider_catalog_version_count: number;
  line_count: number;
  item_quantity_count: number;
  item_subtotal_total: number;
  reserve_count: number;
  payment_count: number;
}>;

export function parseAssistedCheckoutInput(value: Record<string, unknown>): AssistedCheckoutInput {
  const duxOrderNumber = readSafeText(value.duxOrderNumber, 'duxOrderNumber', 120);
  const duxOrderId = readOptionalSafeText(value.duxOrderId, 'duxOrderId', 120);
  const shippingMinor = readInteger(value.shippingMinor, 'shippingMinor', 0, MAX_SHIPPING_MINOR);
  if (value.confirmedExactReservation !== true) {
    throw new HttpError(
      400,
      'ASSISTED_RESERVATION_CONFIRMATION_REQUIRED',
      'Confirmá que el pedido y la reserva exacta fueron verificados en Dux.',
    );
  }
  return Object.freeze({ duxOrderNumber, duxOrderId, shippingMinor, confirmedExactReservation: true });
}

export async function previewAssistedCheckout(
  database: D1Database,
  env: Env,
  requestId: string,
  nowMilliseconds = Date.now(),
): Promise<AssistedCheckoutPreview> {
  await requireAssistedSchema(database);
  const detail = await readAcceptedRequest(database, requestId);
  await requireAssistedAuthority(database, env);
  const snapshot = await readDuxCatalogSnapshot(database);
  const observedAt = snapshot.stockReadAt ?? snapshot.syncedAt;
  assertSnapshotFresh(observedAt, env, nowMilliseconds);

  const items = new Map(snapshot.items.map((item) => [item.slug, item]));
  const lines: AssistedCheckoutLinePreview[] = [];
  let itemCount = 0;
  let productsTotalMinor = 0;
  for (const requested of detail.snapshot.lines) {
    const current = items.get(requested.productId);
    if (current === undefined || current.code !== requested.duxCode) {
      throw new HttpError(409, 'DUX_ASSISTED_PRODUCT_CHANGED', `${requested.name} ya no coincide con su identidad Dux.`);
    }
    if (current.priceStatus !== 'usable' || current.priceAmount === null) {
      throw new HttpError(409, 'DUX_ASSISTED_PRICE_UNAVAILABLE', `${current.name} no tiene un precio Dux utilizable.`);
    }
    const unitPriceMinor = Math.round(current.priceAmount * 100);
    const subtotalMinor = unitPriceMinor * requested.requestedQuantity;
    if (
      !Number.isSafeInteger(unitPriceMinor) || unitPriceMinor <= 0 ||
      !Number.isSafeInteger(subtotalMinor) || subtotalMinor <= 0
    ) {
      throw new HttpError(503, 'DUX_ASSISTED_PRICE_INVALID', 'El precio Dux no puede materializarse con seguridad.');
    }
    productsTotalMinor += subtotalMinor;
    itemCount += requested.requestedQuantity;
    if (!Number.isSafeInteger(productsTotalMinor) || !Number.isSafeInteger(itemCount)) {
      throw new HttpError(409, 'ASSISTED_CHECKOUT_TOTAL_OUT_OF_RANGE', 'La solicitud excede los límites admitidos.');
    }
    lines.push(Object.freeze({
      productId: requested.productId,
      duxCode: current.code,
      name: current.name,
      quantity: requested.requestedQuantity,
      unitPriceMinor,
      subtotalMinor,
    }));
  }
  if (lines.length === 0 || itemCount <= 0 || productsTotalMinor <= 0) {
    throw new HttpError(409, 'ASSISTED_CHECKOUT_EMPTY', 'La solicitud no contiene productos cobrables.');
  }
  const pickup = detail.snapshot.fulfillment.method === 'coordinated_pickup';
  return Object.freeze({
    requestId,
    catalogVersion: snapshot.catalogVersion,
    catalogObservedAt: observedAt,
    lines: Object.freeze(lines),
    itemCount,
    productsTotalMinor,
    deliveryMethod: detail.snapshot.fulfillment.method,
    shippingMinor: pickup ? 0 : null,
    totalMinor: pickup ? productsTotalMinor : null,
  });
}

export async function prepareAssistedCheckout(
  database: D1Database,
  env: Env,
  requestId: string,
  input: AssistedCheckoutInput,
  actor: string,
  now = new Date(),
): Promise<AssistedCheckoutPrepared> {
  await requireAssistedSchema(database);
  const replay = await readPrepared(database, requestId);
  if (replay !== null) return validateReplay(replay, input);

  const detail = await readAcceptedRequest(database, requestId);
  const identity = await readRequestIdentity(database, requestId);
  const preview = await previewAssistedCheckout(database, env, requestId, now.getTime());
  const tenant = await readVerifiedTenant(database, env);
  const shippingMinor = validateShipping(preview.deliveryMethod, input.shippingMinor);
  const totalMinor = preview.productsTotalMinor + shippingMinor;
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
    throw new HttpError(409, 'ASSISTED_CHECKOUT_TOTAL_OUT_OF_RANGE', 'El total final excede los límites admitidos.');
  }
  const safeActor = readSafeText(actor, 'actor', 512);
  const fingerprint = await sha256Hex(JSON.stringify([
    1,
    requestId,
    input.duxOrderNumber,
    input.duxOrderId,
    preview.catalogVersion,
    preview.lines.map((line) => [line.productId, line.duxCode, line.quantity, line.unitPriceMinor]),
    fulfillmentCanonicalValue(detail.snapshot.fulfillment),
    shippingMinor,
  ]));
  const orderId = `ord_${randomToken(18)}`;
  const operationId = `duxop_${randomToken(18)}`;
  const timestamp = now.toISOString();
  const shippingTier = preview.deliveryMethod === 'coordinated_pickup'
    ? 'coordinated_pickup'
    : 'correo_manual_quote';
  const evidenceNote = 'El administrador confirmó que el pedido y la reserva exacta existen en Dux antes de habilitar el cobro.';

  const statements = [
    database.prepare(`INSERT INTO orders (
      id, public_token_hash, checkout_idempotency_key, cart_fingerprint, status,
      currency, total_minor, item_count, created_at, updated_at, channel,
      web_request_id, assisted_checkout_fingerprint
    ) VALUES (?, ?, ?, ?, 'preference_pending', 'ARS', ?, ?, ?, ?, 'checkout_pro', ?, ?)`)
      .bind(orderId, identity.web_request_token_hash, identity.checkout_idempotency_key, fingerprint,
        totalMinor, preview.itemCount, timestamp, timestamp, requestId, fingerprint),
    ...preview.lines.map((line) => database.prepare(`INSERT INTO order_items (
      order_id, product_id, name, presentation, sku, quantity, unit_price_minor,
      subtotal_minor, stock_controlled, provider_inventory_key, provider_catalog_version
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 0, NULL, ?)`)
      .bind(orderId, line.productId, line.name, line.duxCode, line.quantity,
        line.unitPriceMinor, line.subtotalMinor, preview.catalogVersion)),
    database.prepare(`INSERT INTO order_fulfillment (
      order_id, delivery_method, full_name, phone, address, locality, province,
      postal_code, total_weight_grams, shipping_tier, products_total_minor,
      shipping_minor, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`)
      .bind(orderId, detail.snapshot.fulfillment.method, detail.snapshot.fulfillment.fullName,
        detail.snapshot.fulfillment.phone, detail.snapshot.fulfillment.address,
        detail.snapshot.fulfillment.locality, detail.snapshot.fulfillment.province,
        detail.snapshot.fulfillment.postalCode, shippingTier, preview.productsTotalMinor,
        shippingMinor, timestamp, timestamp),
    database.prepare(`INSERT INTO dux_order_links (
      order_id, dux_reference, dux_order_id, dux_order_number, company_id, branch_id,
      deposit_id, reservation_state, request_fingerprint, last_error_code,
      attempted_at, confirmed_at, released_at, finalized_at, created_at, updated_at,
      verification_method, verification_actor, verification_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, NULL, ?, ?, NULL, NULL, ?, ?,
      'assisted_admin', ?, ?)`)
      .bind(orderId, `shekinah:web:${requestId}`, input.duxOrderId, input.duxOrderNumber,
        tenant.company_id, tenant.branch_id, tenant.deposit_id, fingerprint,
        timestamp, timestamp, timestamp, timestamp, safeActor, evidenceNote),
    database.prepare(`INSERT INTO dux_order_operations (
      id, idempotency_key, order_id, action, status, request_json, response_json,
      provider_operation_id, error_code, attempted_at, confirmed_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'reserve', 'confirmed', ?, ?, ?, NULL, ?, ?, ?, ?)`)
      .bind(operationId, `assisted-reserve:${orderId}`, orderId,
        JSON.stringify({ method: 'assisted_admin', orderId, requestId, action: 'reserve' }),
        JSON.stringify({ verification: 'manual', confirmedExactReservation: true }),
        input.duxOrderNumber, timestamp, timestamp, timestamp, timestamp),
  ];

  try {
    await database.batch(statements);
  } catch (error: unknown) {
    const raced = await readPrepared(database, requestId).catch(() => null);
    if (raced !== null) return validateReplay(raced, input);
    throw preparationStorageError(error);
  }
  const persisted = await readPrepared(database, requestId);
  if (persisted === null) {
    throw new HttpError(503, 'ASSISTED_CHECKOUT_RECONCILIATION_REQUIRED', 'La preparación no pudo verificarse después de persistirla.');
  }
  const result = validateReplay(persisted, input);
  return Object.freeze({ ...result, created: persisted.order_id === orderId });
}

async function readAcceptedRequest(database: D1Database, requestId: string): Promise<AdminWebRequestDetail> {
  let raw: unknown;
  try { raw = await getAdminWebOrderRequest(database, requestId); }
  catch (error: unknown) { throw normalizeMigrationError(error); }
  let detail: AdminWebRequestDetail;
  try { detail = parseAdminWebRequestDetail(raw); }
  catch {
    throw new HttpError(503, 'WEB_REQUEST_SNAPSHOT_INVALID', 'La solicitud guardada no puede verificarse.', false);
  }
  if (detail.status !== 'accepted') {
    throw new HttpError(409, 'WEB_REQUEST_NOT_ACCEPTED', 'La solicitud debe estar aceptada antes de preparar el cobro.');
  }
  return detail;
}

async function readRequestIdentity(database: D1Database, requestId: string): Promise<RequestIdentityRow> {
  try {
    const row = await database.prepare(`SELECT checkout_idempotency_key, web_request_token_hash,
      web_request_status FROM checkout_intents
      WHERE intent_kind = 'web_request' AND web_request_id = ? LIMIT 1`)
      .bind(requestId).first<RequestIdentityRow>();
    if (row === null) throw new HttpError(404, 'WEB_REQUEST_NOT_FOUND', 'No se encontró la solicitud.');
    if (row.web_request_status !== 'accepted' || !/^[a-f0-9]{64}$/u.test(row.web_request_token_hash)) {
      throw new HttpError(409, 'WEB_REQUEST_NOT_ACCEPTED', 'La solicitud no está lista para preparar el cobro.');
    }
    return row;
  } catch (error: unknown) { throw normalizeMigrationError(error); }
}

async function requireAssistedAuthority(database: D1Database, env: Env): Promise<void> {
  requireExpectedDuxCompany(env);
  await requireVerifiedDuxCatalogTenant(database);
  const control = await readDuxCatalogControl(database);
  if (!control.migrationApplied || !control.publicCatalogEnabled) {
    throw new HttpError(409, 'DUX_PUBLIC_CATALOG_REQUIRED', 'El catálogo público Dux debe estar activo para preparar el cobro.');
  }
}

async function readVerifiedTenant(database: D1Database, env: Env): Promise<TenantRow> {
  requireExpectedDuxCompany(env);
  const row = await database.prepare(`SELECT company_id, branch_id, deposit_id
    FROM dux_tenant_context WHERE id = 1`).first<TenantRow>();
  if (row === null || row.company_id !== env.DUX_COMPANY_ID || row.branch_id !== env.DUX_BRANCH_ID || row.deposit_id !== env.DUX_DEPOSIT_ID) {
    throw new HttpError(409, 'DUX_ASSISTED_TENANT_MISMATCH', 'Empresa, sucursal o depósito Dux no coinciden con el contexto verificado.');
  }
  return row;
}

function assertSnapshotFresh(observedAt: string, env: Env, nowMilliseconds: number): void {
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(nowMilliseconds) || !Number.isFinite(observed) || observed > nowMilliseconds ||
      nowMilliseconds - observed > readDuxSnapshotMaxAgeSeconds(env) * 1000) {
    throw new HttpError(409, 'DUX_CATALOG_SNAPSHOT_STALE', 'Actualizá Dux antes de preparar el cobro.');
  }
}

function validateShipping(method: 'coordinated_pickup' | 'correo_argentino', shippingMinor: number): number {
  if (method === 'coordinated_pickup' && shippingMinor === 0) return 0;
  if (method === 'correo_argentino' && shippingMinor > 0) return shippingMinor;
  throw new HttpError(400, 'ASSISTED_SHIPPING_INVALID', method === 'correo_argentino'
    ? 'Ingresá la cotización final del envío antes de preparar el cobro.'
    : 'El retiro coordinado no debe agregar costo de envío.');
}

async function requireAssistedSchema(database: D1Database): Promise<void> {
  try {
    const [orders, links, index] = await Promise.all([
      database.prepare('PRAGMA table_info(orders)').all<Readonly<{ name: string }>>(),
      database.prepare('PRAGMA table_info(dux_order_links)').all<Readonly<{ name: string }>>(),
      database.prepare(`SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?`)
        .bind(ASSISTED_ORDER_NUMBER_INDEX).first<Readonly<{ name: string }>>(),
    ]);
    const orderColumns = new Set((orders.results ?? []).map((row) => row.name));
    const linkColumns = new Set((links.results ?? []).map((row) => row.name));
    if (!orderColumns.has('web_request_id') || !orderColumns.has('assisted_checkout_fingerprint') ||
        !linkColumns.has('verification_method') || index?.name !== ASSISTED_ORDER_NUMBER_INDEX) {
      throw migrationRequired();
    }
  } catch (error: unknown) { throw normalizeMigrationError(error); }
}

async function readPrepared(database: D1Database, requestId: string): Promise<PreparedRow | null> {
  try {
    return await database.prepare(`SELECT
      o.id AS order_id, o.web_request_id AS request_id, o.cart_fingerprint,
      o.total_minor, o.item_count, link.dux_order_number, link.dux_order_id,
      link.reservation_state, link.verification_method,
      fulfillment.shipping_minor, fulfillment.products_total_minor,
      (SELECT MIN(provider_catalog_version) FROM order_items WHERE order_id = o.id) AS provider_catalog_version,
      (SELECT COUNT(DISTINCT provider_catalog_version) FROM order_items WHERE order_id = o.id) AS provider_catalog_version_count,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS line_count,
      (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id) AS item_quantity_count,
      (SELECT COALESCE(SUM(subtotal_minor), 0) FROM order_items WHERE order_id = o.id) AS item_subtotal_total,
      (SELECT COUNT(*) FROM dux_order_operations operation
        WHERE operation.order_id = o.id AND operation.action = 'reserve'
          AND operation.status = 'confirmed'
          AND operation.idempotency_key = 'assisted-reserve:' || o.id) AS reserve_count,
      (SELECT COUNT(*) FROM payments WHERE order_id = o.id) AS payment_count
    FROM orders o
    INNER JOIN dux_order_links link ON link.order_id = o.id
    INNER JOIN order_fulfillment fulfillment ON fulfillment.order_id = o.id
    WHERE o.web_request_id = ?
    LIMIT 1`).bind(requestId).first<PreparedRow>();
  } catch (error: unknown) { throw normalizeMigrationError(error); }
}

function validateReplay(row: PreparedRow, input: AssistedCheckoutInput): AssistedCheckoutPrepared {
  if (
    row.verification_method !== 'assisted_admin' || row.reservation_state !== 'confirmed' ||
    row.dux_order_number !== input.duxOrderNumber || row.dux_order_id !== input.duxOrderId ||
    row.shipping_minor !== input.shippingMinor || row.payment_count !== 0 ||
    row.reserve_count !== 1 || row.line_count < 1 || row.provider_catalog_version === null ||
    row.provider_catalog_version_count !== 1 || row.item_quantity_count !== row.item_count ||
    row.item_subtotal_total !== row.products_total_minor ||
    row.total_minor !== row.products_total_minor + row.shipping_minor
  ) {
    throw new HttpError(409, 'ASSISTED_CHECKOUT_CONFLICT', 'La solicitud ya fue preparada con otros datos o requiere conciliación.');
  }
  return Object.freeze({
    orderId: row.order_id,
    requestId: row.request_id,
    duxOrderNumber: row.dux_order_number,
    duxOrderId: row.dux_order_id,
    catalogVersion: row.provider_catalog_version,
    itemCount: row.item_count,
    productsTotalMinor: row.products_total_minor,
    shippingMinor: row.shipping_minor,
    totalMinor: row.total_minor,
    reservationState: 'confirmed',
    paymentStatus: 'not_requested',
    created: false,
  });
}

function preparationStorageError(error: unknown): HttpError {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('idx_dux_assisted_order_number_unique') || message.includes('UNIQUE constraint failed: dux_order_links.company_id')) {
    return new HttpError(409, 'DUX_ORDER_NUMBER_ALREADY_LINKED', 'Ese pedido Dux ya está asociado a otra solicitud.');
  }
  if (message.includes('UNIQUE constraint failed') || message.includes('WEB_REQUEST_CONVERSION')) {
    return new HttpError(409, 'ASSISTED_CHECKOUT_CONFLICT', 'La solicitud ya fue preparada o cambió durante la operación.');
  }
  if (message.includes('DUX_') || message.includes('WEB_REQUEST_')) {
    return new HttpError(409, 'ASSISTED_CHECKOUT_VALIDATION_FAILED', 'La evidencia no cumple las reglas de preparación asistida.');
  }
  return normalizeMigrationError(error);
}

function normalizeMigrationError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  const message = error instanceof Error ? error.message : '';
  if (/no such (?:table|column)|ASSISTED_CHECKOUT_MIGRATION/u.test(message)) return migrationRequired();
  return new HttpError(503, 'ASSISTED_CHECKOUT_STORAGE_UNAVAILABLE', 'No se pudo verificar el checkout asistido.', false);
}

function migrationRequired(): HttpError {
  return new HttpError(503, 'ASSISTED_CHECKOUT_MIGRATION_REQUIRED', 'Falta aplicar las migraciones del checkout Dux asistido.');
}
