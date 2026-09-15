import { fulfillmentCanonicalValue } from '../src/commerce/fulfillment';
import { parseAdminWebRequestDetail } from '../src/commerce/web-order-contracts';
import type { AdminWebRequestDetail } from '../src/commerce/web-order-contracts';
import { hmacSha256Hex, randomToken, sha256Hex } from './crypto';
import { readDuxCatalogSnapshot } from './dux-catalog';
import { readDuxCatalogControl, requireExpectedDuxCompany } from './dux-catalog-control';
import { readDuxInventoryConfig } from './dux-inventory';
import { DuxOrderApiClient, duxOrderMatchesRequest } from './dux-order-api';
import { createDuxRequestGate } from './dux-request-gate';
import { directProviderRequest, hasPhysicalReservation, parseDirectProgress, parseStoredProviderRequest } from './direct-checkout-progress';
import type { DirectProgress } from './direct-checkout-progress';
import { requireDirectCheckoutSchema } from './direct-checkout-schema';
import { HttpError, requireSecret } from './http';
import type { D1Database, Env } from './platform';
import { getAdminWebOrderRequest } from './web-order-requests';

const LEASE_MS = 60_000;
const MAX_QUOTE_AGE_MS = 900_000;
type State = 'preparing' | 'uncertain' | 'prepared' | 'failed' | 'requires_review';
type Identity = Readonly<{
  web_request_id: string; web_request_status: string; web_request_token_hash: string;
  checkout_idempotency_key: string; direct_checkout_state: State | null;
  direct_checkout_progress_json: string | null;
}>;
type Operation = Readonly<{
  order_id: string; status: string; attempted_at: string | null; request_json: string;
}>;
type Tenant = Readonly<{ companyId: number; branchId: number; depositId: number; personalId: number; customerId: number }>;
export type DirectGateway = Pick<DuxOrderApiClient, 'readItem' | 'createOrder' | 'findOrder'>;

/** Sólo para el endpoint administrativo autenticado. Recupera la identidad
 * existente; no cambia su clave ni habilita otro POST ante incertidumbre. */
export async function resumeDirectCheckout(database:D1Database,env:Env,requestId:string):Promise<void> {
  if (!/^req_[A-Za-z0-9_-]{20,128}$/u.test(requestId)) throw notFound();
  await requireDirectCheckoutSchema(database);
  const row=await database.prepare(`SELECT checkout_idempotency_key,web_request_owner_hash,web_request_token_hash
    FROM checkout_intents WHERE web_request_id = ? AND intent_kind = 'web_request' AND direct_checkout_state IS NOT NULL`)
    .bind(requestId).first<{checkout_idempotency_key:string;web_request_owner_hash:string;web_request_token_hash:string}>();
  if(row===null) throw notFound();
  const secret=requireSecret(env.ORDER_TOKEN_SECRET,'ORDER_TOKEN_SECRET_MISSING','Falta la protección de pedidos.',32);
  const publicToken=await hmacSha256Hex(secret,`web-request:${row.checkout_idempotency_key}:${row.web_request_owner_hash}`);
  if(await sha256Hex(publicToken)!==row.web_request_token_hash) throw evidenceInvalid();
  await advanceDirectCheckout(database,env,publicToken);
}

/** Una petición avanza como máximo una llamada Dux; el POST de pedido se reclama
 * persistentemente justo antes de enviarlo. GET de estado no llama a este flujo. */
export async function advanceDirectCheckout(database: D1Database, env: Env, publicToken: string,
  options: Readonly<{ gateway?: DirectGateway; now?: () => number }> = {}): Promise<void> {
  if (env.DIRECT_CHECKOUT_ENABLED !== 'true' || env.WEB_ORDERS_ENABLED !== 'true') {
    throw new HttpError(503, 'DIRECT_CHECKOUT_DISABLED', 'La compra directa no está disponible temporalmente.');
  }
  const now = options.now ?? Date.now;
  await requireDirectCheckoutSchema(database);
  const config = readDirectCheckoutConfig(env);
  await requireTenant(database, env, config);
  if (!/^[a-f0-9]{64}$/u.test(publicToken)) throw notFound();
  let identity = await database.prepare(`SELECT checkout_idempotency_key, web_request_id,
    web_request_token_hash, web_request_status, direct_checkout_state, direct_checkout_progress_json
    FROM checkout_intents WHERE intent_kind = 'web_request' AND web_request_token_hash = ?`)
    .bind(await sha256Hex(publicToken)).first<Identity>();
  if (identity === null) throw notFound();
  if (identity.web_request_status === 'rejected' || ['prepared', 'failed', 'requires_review'].includes(identity.direct_checkout_state ?? '')) return;
  const detail = parseAdminWebRequestDetail(await getAdminWebOrderRequest(database, identity.web_request_id));
  // Sin peso logístico estructurado no se inventa un flete. Esa excepción
  // conserva el circuito asistido; el retiro tiene un importe final de cero.
  if (detail.snapshot.fulfillment.method !== 'coordinated_pickup') return;
  const token = await sha256Hex(randomToken(32));
  const timestamp = validNow(now);
  const lease = await database.prepare(`UPDATE checkout_intents SET direct_checkout_state = COALESCE(direct_checkout_state, 'preparing'),
    direct_checkout_claim_token = ?, direct_checkout_lease_until_ms = ?, direct_checkout_updated_at = ?
    WHERE web_request_id = ? AND web_request_status <> 'rejected'
      AND (direct_checkout_state IN ('preparing', 'uncertain') OR (direct_checkout_state IS NULL AND web_request_status = 'submitted'))
      AND direct_checkout_lease_until_ms <= ? RETURNING checkout_idempotency_key, web_request_id,
        web_request_token_hash, web_request_status, direct_checkout_state, direct_checkout_progress_json`)
    .bind(token, timestamp + LEASE_MS, new Date(timestamp).toISOString(), identity.web_request_id, timestamp).first<Identity>();
  if (lease === null) return;
  identity = lease;
  const gateway = options.gateway ?? new DuxOrderApiClient({ accessToken: config.accessToken, beforeRequest: createDuxRequestGate(database) });
  try {
    let progress = identity.direct_checkout_progress_json === null
      ? { version: 1 as const, catalogVersion: detail.snapshot.catalogVersion, lines: [], order: null, stockAfter: [], stockObservedAt: null }
      : parseDirectProgress(identity.direct_checkout_progress_json);
    const operation = await readOperation(database, identity.web_request_id);
    if (operation !== null) {
      await advanceReservation(database, identity, token, progress, operation, config, gateway, now);
      return;
    }
    if (progress.lines.some(line => timestamp - Date.parse(line.observedAt) > MAX_QUOTE_AGE_MS || Date.parse(line.observedAt) > timestamp)) {
      progress = { ...progress, lines: [], order: null, stockAfter: [], stockObservedAt: null };
    }
    const requested = detail.snapshot.lines[progress.lines.length];
    if (requested !== undefined) {
      const snapshot = await readDuxCatalogSnapshot(database);
      const product = snapshot.items.find(item => item.slug === requested.productId && item.code === requested.duxCode);
      if (product === undefined) throw new HttpError(409, 'DIRECT_PRODUCT_CHANGED', 'Un producto ya no está disponible. Revisá tu carrito.');
      const item = await gateway.readItem(product.code, config.depositId);
      if (item.code !== product.code || Math.floor(item.availableStock) < requested.requestedQuantity) {
        throw new HttpError(409, 'DIRECT_STOCK_INSUFFICIENT', `No hay suficientes unidades disponibles de ${product.name}. Revisá la cantidad.`);
      }
      progress = { ...progress, catalogVersion: snapshot.catalogVersion, lines: [...progress.lines, {
        productId: requested.productId, code: item.code, name: item.name, quantity: requested.requestedQuantity,
        unitPriceMinor: item.priceMinor, stockBefore: item, observedAt: new Date(validNow(now)).toISOString(),
      }] };
      // Valida también las respuestas de gateways inyectados y la representación persistida.
      progress = parseDirectProgress(JSON.stringify(progress));
      await saveProgress(database, identity.web_request_id, token, progress, now);
      return;
    }
    await createDraft(database, identity, detail, token, progress, config, now);
    // La siguiente petición reclama el POST: si esta respuesta se pierde el
    // ledger permanece recuperable y no se genera una segunda orden local.
  } catch (error: unknown) {
    const code = error instanceof HttpError ? error.code : 'DIRECT_CHECKOUT_STORAGE_UNAVAILABLE';
    const terminal = code === 'DIRECT_STOCK_INSUFFICIENT' || code === 'DIRECT_PRODUCT_CHANGED';
    await database.prepare(`UPDATE checkout_intents SET direct_checkout_error_code = ?,
      direct_checkout_state = CASE WHEN ? = 1 THEN 'failed' ELSE direct_checkout_state END,
      direct_checkout_updated_at = ? WHERE web_request_id = ? AND direct_checkout_claim_token = ?`)
      .bind(code, terminal ? 1 : 0, new Date(validNow(now)).toISOString(), identity.web_request_id, token).run();
    throw error;
  } finally {
    await database.prepare(`UPDATE checkout_intents SET direct_checkout_lease_until_ms = 0
      WHERE web_request_id = ? AND direct_checkout_claim_token = ?`).bind(identity.web_request_id, token).run();
  }
}

export function readDirectCheckoutConfig(env: Env) {
  return { ...readDuxInventoryConfig(env), personalId: identifier(env.DUX_ORDER_PERSONAL_ID), customerId: identifier(env.DUX_ORDER_CUSTOMER_ID) };
}

async function advanceReservation(database: D1Database, identity: Identity, token: string, progress: DirectProgress,
  operation: Operation, tenant: Tenant, gateway: DirectGateway, now: () => number): Promise<void> {
  const request = parseStoredProviderRequest(operation.request_json);
  if (request.id_empresa !== tenant.companyId || request.id_sucursal !== tenant.branchId || request.id_deposito !== tenant.depositId ||
      request.referencia !== `shekinah:web:${identity.web_request_id}`) throw evidenceInvalid();
  const quote: unknown = JSON.parse(operation.request_json);
  if (typeof quote !== 'object' || quote === null || !('quote' in quote) ||
      JSON.stringify(quote.quote) !== JSON.stringify({ catalogVersion: progress.catalogVersion, lines: progress.lines })) throw evidenceInvalid();
  if (operation.status === 'confirmed') return;
  if (operation.attempted_at === null) {
    if (progress.lines.some(line => validNow(now) - Date.parse(line.observedAt) > MAX_QUOTE_AGE_MS)) {
      // Sólo se cierra un borrador que jamás reclamó el POST. Un intento
      // incierto no pasa por esta rama y nunca se reenvía por antigüedad.
      const expiredAt = new Date(validNow(now)).toISOString();
      await database.batch([
        database.prepare(`UPDATE orders SET status = 'failed', updated_at = ? WHERE id = ?
          AND mp_preference_attempted_at IS NULL AND mp_preference_id IS NULL
          AND EXISTS (SELECT 1 FROM dux_order_operations WHERE order_id = ? AND action = 'reserve' AND attempted_at IS NULL)`)
          .bind(expiredAt, operation.order_id, operation.order_id),
        database.prepare(`UPDATE checkout_intents SET direct_checkout_state = 'failed', direct_checkout_error_code = 'DIRECT_QUOTE_EXPIRED',
          direct_checkout_updated_at = ? WHERE web_request_id = ? AND direct_checkout_claim_token = ?
          AND EXISTS (SELECT 1 FROM orders o JOIN dux_order_operations op ON op.order_id = o.id
            WHERE o.id = ? AND o.status = 'failed' AND op.action = 'reserve' AND op.attempted_at IS NULL)`)
          .bind(expiredAt, identity.web_request_id, token, operation.order_id),
      ]);
      return;
    }
    let sent = false;
    try {
      await gateway.createOrder(request, async () => {
        const attempted = new Date(validNow(now)).toISOString();
        const results = await database.batch([
          database.prepare(`UPDATE dux_order_operations SET attempted_at = ?, updated_at = ?
            WHERE order_id = ? AND action = 'reserve' AND attempted_at IS NULL
              AND EXISTS (SELECT 1 FROM checkout_intents WHERE web_request_id = ? AND direct_checkout_claim_token = ? AND direct_checkout_lease_until_ms > ?)`)
            .bind(attempted, attempted, operation.order_id, identity.web_request_id, token, validNow(now)),
          database.prepare(`UPDATE dux_order_links SET reservation_state = 'pending', attempted_at = ?, updated_at = ?
            WHERE order_id = ? AND reservation_state = 'not_attempted'
              AND EXISTS (SELECT 1 FROM dux_order_operations WHERE order_id = ? AND attempted_at = ?)`)
            .bind(attempted, attempted, operation.order_id, operation.order_id, attempted),
        ]);
        if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1) throw busy();
        sent = true;
      });
    } catch (error: unknown) {
      if (!sent) throw error;
      await markUncertain(database, identity.web_request_id, operation.order_id, token, now);
    }
    return;
  }
  if (progress.order === null) {
    const order = await gateway.findOrder({ companyId: tenant.companyId, branchId: tenant.branchId,
      reference: request.referencia, dateFrom: request.fecha, dateTo: new Date(validNow(now)).toISOString().slice(0, 10) });
    if (order === null) { await markUncertain(database, identity.web_request_id, operation.order_id, token, now); return; }
    const productsTotal = progress.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
    if (!duxOrderMatchesRequest(order, request) || order.totalMinor !== productsTotal) throw evidenceInvalid();
    await saveProgress(database, identity.web_request_id, token, { ...progress, order }, now);
    return;
  }
  if (progress.stockObservedAt !== null && (validNow(now) - Date.parse(progress.stockObservedAt) > MAX_QUOTE_AGE_MS || Date.parse(progress.stockObservedAt) > validNow(now))) {
    await saveProgress(database, identity.web_request_id, token, { ...progress, stockAfter: [], stockObservedAt: null }, now);
    return;
  }
  const line = progress.lines[progress.stockAfter.length];
  if (line !== undefined) {
    const item = await gateway.readItem(line.code, tenant.depositId);
    if (!hasPhysicalReservation(line, item)) throw new HttpError(409, 'DIRECT_RESERVATION_UNVERIFIED', 'Dux todavía no acredita la reserva exacta. No se iniciará el cobro.');
    await saveProgress(database, identity.web_request_id, token, { ...progress, stockAfter: [...progress.stockAfter, item],
      stockObservedAt: progress.stockObservedAt ?? new Date(validNow(now)).toISOString() }, now);
    return;
  }
  // La lectura inicial puede preceder a una pausa del comprador. Antes de
  // habilitar Mercado Pago se coteja otra vez que el mismo pedido siga activo.
  const confirmedOrder = await gateway.findOrder({ companyId: tenant.companyId, branchId: tenant.branchId,
    reference: request.referencia, dateFrom: request.fecha, dateTo: new Date(validNow(now)).toISOString().slice(0, 10) });
  if (confirmedOrder === null || confirmedOrder.id !== progress.order.id || confirmedOrder.number !== progress.order.number ||
      !duxOrderMatchesRequest(confirmedOrder, request) || confirmedOrder.totalMinor !== progress.order.totalMinor) throw evidenceInvalid();
  const confirmedAt = validNow(now);
  const timestamp = new Date(confirmedAt).toISOString();
  const results = await database.batch([
    database.prepare(`UPDATE dux_order_operations SET status = 'confirmed', response_json = ?, provider_operation_id = ?,
      error_code = NULL, confirmed_at = ?, updated_at = ? WHERE order_id = ? AND action = 'reserve' AND status IN ('pending','uncertain')
      AND EXISTS (SELECT 1 FROM checkout_intents WHERE web_request_id = ? AND direct_checkout_claim_token = ? AND direct_checkout_lease_until_ms > ?)`)
      .bind(JSON.stringify({ order: confirmedOrder, stockAfter: progress.stockAfter }), String(confirmedOrder.id), timestamp, timestamp, operation.order_id,
        identity.web_request_id, token, confirmedAt),
    database.prepare(`UPDATE dux_order_links SET reservation_state = 'confirmed', dux_order_id = ?, dux_order_number = ?,
      confirmed_at = ?, last_error_code = NULL, updated_at = ? WHERE order_id = ? AND reservation_state IN ('pending','uncertain')
      AND EXISTS (SELECT 1 FROM checkout_intents WHERE web_request_id = ? AND direct_checkout_claim_token = ? AND direct_checkout_lease_until_ms > ?)`)
      .bind(String(progress.order.id), String(progress.order.number), timestamp, timestamp, operation.order_id, identity.web_request_id, token, confirmedAt),
    database.prepare(`UPDATE checkout_intents SET direct_checkout_state = 'prepared', direct_checkout_error_code = NULL,
      direct_checkout_updated_at = ? WHERE web_request_id = ? AND direct_checkout_claim_token = ? AND direct_checkout_lease_until_ms > ?`)
      .bind(timestamp, identity.web_request_id, token, confirmedAt),
  ]);
  if (results.some(result => result.meta.changes !== 1)) throw busy();
}

async function createDraft(database: D1Database, identity: Identity, detail: AdminWebRequestDetail, token: string,
  progress: DirectProgress, tenant: Tenant, now: () => number): Promise<void> {
  if (progress.lines.length !== detail.snapshot.lines.length || progress.lines.length === 0 ||
      progress.lines.some((line, i) => line.productId !== detail.snapshot.lines[i]?.productId || line.code !== detail.snapshot.lines[i]?.duxCode || line.quantity !== detail.snapshot.lines[i]?.requestedQuantity)) throw evidenceInvalid();
  const total = progress.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
  const count = progress.lines.reduce((sum, line) => sum + line.quantity, 0);
  if (!Number.isSafeInteger(total) || total <= 0) throw evidenceInvalid();
  const timestamp = new Date(validNow(now)).toISOString();
  const orderId = `ord_${randomToken(18)}`;
  const fingerprint = await sha256Hex(JSON.stringify([2, identity.web_request_id, progress.lines, fulfillmentCanonicalValue(detail.snapshot.fulfillment)]));
  const providerRequest = directProviderRequest(progress, tenant, `shekinah:web:${identity.web_request_id}`, timestamp.slice(0, 10));
  await database.batch([
    database.prepare(`UPDATE checkout_intents SET web_request_status = 'accepted', web_request_resolved_by = 'system:direct_checkout',
      web_request_resolved_at = ?, web_request_updated_at = ? WHERE web_request_id = ? AND web_request_status = 'submitted'
      AND direct_checkout_claim_token = ? AND direct_checkout_lease_until_ms > ?`)
      .bind(timestamp, timestamp, identity.web_request_id, token, validNow(now)),
    database.prepare(`INSERT INTO orders (id, public_token_hash, checkout_idempotency_key, cart_fingerprint, status,
      currency, total_minor, item_count, created_at, updated_at, channel, web_request_id, assisted_checkout_fingerprint)
      SELECT ?, ?, ?, ?, 'preference_pending', 'ARS', ?, ?, ?, ?, 'checkout_pro', ?, ?
      FROM checkout_intents WHERE web_request_id = ? AND direct_checkout_claim_token = ? AND direct_checkout_lease_until_ms > ?`)
      .bind(orderId, identity.web_request_token_hash, identity.checkout_idempotency_key, fingerprint, total, count, timestamp, timestamp, identity.web_request_id, fingerprint,
        identity.web_request_id, token, validNow(now)),
    database.prepare(`INSERT INTO dux_order_links (order_id, dux_reference, company_id, branch_id, deposit_id,
      reservation_state, request_fingerprint, created_at, updated_at, verification_method, verification_actor, verification_note)
      VALUES (?, ?, ?, ?, ?, 'not_attempted', ?, ?, ?, 'automatic_api', 'system:direct_checkout', 'Preparación automática; reserva pendiente de verificación autoritativa.')`)
      .bind(orderId, providerRequest.referencia, String(tenant.companyId), String(tenant.branchId), String(tenant.depositId), fingerprint, timestamp, timestamp),
    database.prepare(`INSERT INTO dux_order_operations (id, idempotency_key, order_id, action, status, request_json, created_at, updated_at)
      VALUES (?, ?, ?, 'reserve', 'pending', ?, ?, ?)`)
      .bind(`duxop_${randomToken(18)}`, `automatic-reserve:${orderId}`, orderId,
        JSON.stringify({ method: 'automatic_api', orderId, requestId: identity.web_request_id, action: 'reserve', providerRequest,
          quote: { catalogVersion: progress.catalogVersion, lines: progress.lines } }), timestamp, timestamp),
    database.prepare(`INSERT INTO order_items (order_id, product_id, name, presentation, sku, quantity, unit_price_minor,
      subtotal_minor, stock_controlled, provider_inventory_key, provider_catalog_version)
      SELECT ?, json_extract(value,'$.productId'), json_extract(value,'$.name'), NULL, json_extract(value,'$.code'),
        json_extract(value,'$.quantity'), json_extract(value,'$.unitPriceMinor'),
        json_extract(value,'$.quantity') * json_extract(value,'$.unitPriceMinor'), 0, NULL, ? FROM json_each(?)`)
      .bind(orderId, progress.catalogVersion, JSON.stringify(progress.lines)),
    database.prepare(`INSERT INTO order_fulfillment (order_id, delivery_method, full_name, phone, address, locality, province,
      postal_code, total_weight_grams, shipping_tier, products_total_minor, shipping_minor, created_at, updated_at)
      VALUES (?, 'coordinated_pickup', ?, ?, '', '', '', '', NULL, 'coordinated_pickup', ?, 0, ?, ?)`)
      .bind(orderId, detail.snapshot.fulfillment.fullName, detail.snapshot.fulfillment.phone, total, timestamp, timestamp),
  ]);
}

async function saveProgress(database: D1Database, requestId: string, token: string, progress: DirectProgress, now: () => number): Promise<void> {
  const timestamp = validNow(now);
  const result = await database.prepare(`UPDATE checkout_intents SET direct_checkout_progress_json = ?, direct_checkout_updated_at = ?,
    direct_checkout_error_code = NULL WHERE web_request_id = ? AND direct_checkout_claim_token = ? AND direct_checkout_lease_until_ms > ?`)
    .bind(JSON.stringify(progress), new Date(timestamp).toISOString(), requestId, token, timestamp).run();
  if (result.meta.changes !== 1) throw busy();
}
async function readOperation(database: D1Database, requestId: string): Promise<Operation | null> {
  return database.prepare(`SELECT op.order_id, op.status, op.attempted_at, op.request_json FROM dux_order_operations op
    JOIN orders o ON o.id = op.order_id WHERE o.web_request_id = ? AND op.idempotency_key = 'automatic-reserve:' || o.id`)
    .bind(requestId).first<Operation>();
}
async function markUncertain(database: D1Database, requestId: string, orderId: string, token: string, now: () => number): Promise<void> {
  const timestamp = new Date(validNow(now)).toISOString();
  await database.batch([
    database.prepare(`UPDATE dux_order_operations SET status = 'uncertain', error_code = 'DUX_ORDER_RESULT_UNCERTAIN', updated_at = ?
      WHERE order_id = ? AND action = 'reserve' AND status = 'pending'`).bind(timestamp, orderId),
    database.prepare(`UPDATE dux_order_links SET reservation_state = 'uncertain', last_error_code = 'DUX_ORDER_RESULT_UNCERTAIN', updated_at = ?
      WHERE order_id = ? AND reservation_state = 'pending'`).bind(timestamp, orderId),
    database.prepare(`UPDATE checkout_intents SET direct_checkout_state = 'uncertain', direct_checkout_updated_at = ?
      WHERE web_request_id = ? AND direct_checkout_claim_token = ?`).bind(timestamp, requestId, token),
  ]);
}
async function requireTenant(database: D1Database, env: Env, config: Tenant): Promise<void> {
  requireExpectedDuxCompany(env);
  const tenant = await database.prepare('SELECT company_id, branch_id, deposit_id FROM dux_tenant_context WHERE id = 1')
    .first<{ company_id: string; branch_id: string; deposit_id: string }>();
  if (tenant === null || tenant.company_id !== String(config.companyId) || tenant.branch_id !== String(config.branchId) ||
      tenant.deposit_id !== String(config.depositId) || !(await readDuxCatalogControl(database)).publicCatalogEnabled) {
    throw new HttpError(503, 'DIRECT_CHECKOUT_TENANT_INVALID', 'No se pudo verificar el catálogo y depósito Dux.');
  }
}
function identifier(value: string | undefined): number {
  if (value === undefined || !/^[1-9]\d*$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new HttpError(503, 'DIRECT_CHECKOUT_IDENTITY_MISSING', 'La compra directa todavía no está configurada.');
  }
  return Number(value);
}
function validNow(now: () => number): number { const value = now(); if (!Number.isSafeInteger(value) || value < 0) throw evidenceInvalid(); return value; }
function evidenceInvalid(): HttpError { return new HttpError(409, 'DIRECT_CHECKOUT_EVIDENCE_INVALID', 'No se pudo confirmar el pedido exacto. Tu compra se conserva sin habilitar un cobro.'); }
function busy(): HttpError { return new HttpError(409, 'DIRECT_CHECKOUT_IN_PROGRESS', 'Tu pedido ya se está preparando.'); }
function notFound(): HttpError { return new HttpError(404, 'WEB_REQUEST_NOT_FOUND', 'No se encontró la compra.'); }
