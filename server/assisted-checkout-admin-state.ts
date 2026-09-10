import { previewAssistedCheckout } from './assisted-checkout';
import type { AssistedCheckoutPreview } from './assisted-checkout';
import { HttpError } from './http';
import { getOrderPaymentState } from './order-payment-state';
import type { D1Database, Env } from './platform';

export type AssistedCheckoutAdminPrepared = Readonly<{
  orderId: string;
  requestId: string;
  duxOrderNumber: string;
  duxOrderId: string | null;
  catalogVersion: string;
  itemCount: number;
  productsTotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  reservationStatus: 'confirmed' | 'released' | 'finalized' | 'requires_review';
  paymentStatus: 'none' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded';
  paymentRequiresReview: boolean;
}>;

export type AssistedCheckoutAdminState =
  | Readonly<{ state: 'preview'; preview: AssistedCheckoutPreview }>
  | Readonly<{ state: 'prepared'; prepared: AssistedCheckoutAdminPrepared }>;

type PreparedRow = Readonly<{
  order_id: string;
  request_id: string;
  total_minor: number;
  item_count: number;
  dux_order_number: string | null;
  dux_order_id: string | null;
  verification_method: string | null;
  reservation_state: string | null;
  products_total_minor: number;
  shipping_minor: number;
  provider_catalog_version: string | null;
  provider_catalog_version_count: number;
  line_count: number;
  item_quantity_count: number;
  item_subtotal_total: number;
  reserve_count: number;
  release_count: number;
  finalize_count: number;
}>;

export async function readAssistedCheckoutAdminState(
  database: D1Database,
  env: Env,
  requestId: string,
): Promise<AssistedCheckoutAdminState> {
  if (!/^req_[A-Za-z0-9_-]{20,128}$/u.test(requestId)) throw notFound();
  const prepared = await readPrepared(database, requestId);
  if (prepared === null) {
    return Object.freeze({ state: 'preview', preview: await previewAssistedCheckout(database, env, requestId) });
  }
  assertPreparedProjection(prepared);
  const payment = await getOrderPaymentState(database, prepared.order_id);
  const reservationStatus = reservationStatusFor(prepared);
  return Object.freeze({
    state: 'prepared',
    prepared: Object.freeze({
      orderId: prepared.order_id,
      requestId: prepared.request_id,
      duxOrderNumber: prepared.dux_order_number ?? '',
      duxOrderId: prepared.dux_order_id,
      catalogVersion: prepared.provider_catalog_version ?? '',
      itemCount: prepared.item_count,
      productsTotalMinor: prepared.products_total_minor,
      shippingMinor: prepared.shipping_minor,
      totalMinor: prepared.total_minor,
      reservationStatus,
      paymentStatus: payment.status,
      paymentRequiresReview: payment.requiresReview ||
        (payment.status === 'approved' && reservationStatus !== 'confirmed' && reservationStatus !== 'finalized') ||
        (payment.status === 'refunded' && reservationStatus !== 'released'),
    }),
  });
}

async function readPrepared(database: D1Database, requestId: string): Promise<PreparedRow | null> {
  try {
    const result = await database.prepare(`SELECT
      o.id AS order_id, o.web_request_id AS request_id, o.total_minor, o.item_count,
      link.dux_order_number, link.dux_order_id, link.verification_method, link.reservation_state,
      fulfillment.products_total_minor, fulfillment.shipping_minor,
      (SELECT MIN(provider_catalog_version) FROM order_items WHERE order_id = o.id) AS provider_catalog_version,
      (SELECT COUNT(DISTINCT provider_catalog_version) FROM order_items WHERE order_id = o.id) AS provider_catalog_version_count,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS line_count,
      (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id) AS item_quantity_count,
      (SELECT COALESCE(SUM(subtotal_minor), 0) FROM order_items WHERE order_id = o.id) AS item_subtotal_total,
      (SELECT COUNT(*) FROM dux_order_operations op WHERE op.order_id = o.id AND op.action = 'reserve'
        AND op.status = 'confirmed' AND op.idempotency_key = 'assisted-reserve:' || o.id) AS reserve_count,
      (SELECT COUNT(*) FROM dux_order_operations op WHERE op.order_id = o.id AND op.action = 'release'
        AND op.status = 'confirmed' AND op.idempotency_key = 'assisted-release:' || o.id) AS release_count,
      (SELECT COUNT(*) FROM dux_order_operations op WHERE op.order_id = o.id AND op.action = 'finalize'
        AND op.status = 'confirmed' AND op.idempotency_key = 'assisted-finalize:' || o.id) AS finalize_count
      FROM orders o
      INNER JOIN dux_order_links link ON link.order_id = o.id
      INNER JOIN order_fulfillment fulfillment ON fulfillment.order_id = o.id
      WHERE o.web_request_id = ? AND o.channel = 'checkout_pro' LIMIT 2`)
      .bind(requestId).all<PreparedRow>();
    const rows = result.results ?? [];
    if (rows.length > 1) throw invalidProjection();
    return rows[0] ?? null;
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error;
    const message = error instanceof Error ? error.message : '';
    if (/no such (?:table|column):/iu.test(message)) {
      throw new HttpError(503, 'ASSISTED_CHECKOUT_MIGRATION_REQUIRED', 'Faltan migraciones del checkout asistido.');
    }
    throw new HttpError(503, 'ASSISTED_CHECKOUT_STORAGE_UNAVAILABLE', 'No se pudo consultar el checkout asistido.', false);
  }
}

function assertPreparedProjection(row: PreparedRow): void {
  if (
    row.request_id === '' || row.verification_method !== 'assisted_admin' ||
    row.dux_order_number === null || row.dux_order_number.trim() === '' ||
    row.provider_catalog_version === null || !/^[a-f0-9]{64}$/u.test(row.provider_catalog_version) ||
    row.provider_catalog_version_count !== 1 || row.line_count < 1 || row.reserve_count !== 1 ||
    !positive(row.item_count) || !positive(row.products_total_minor) || !positive(row.total_minor) ||
    !nonNegative(row.shipping_minor) || row.item_quantity_count !== row.item_count ||
    row.item_subtotal_total !== row.products_total_minor ||
    row.total_minor !== row.products_total_minor + row.shipping_minor
  ) throw invalidProjection();
}

function reservationStatusFor(row: PreparedRow): AssistedCheckoutAdminPrepared['reservationStatus'] {
  if (row.reservation_state === 'confirmed' && row.release_count === 0 && row.finalize_count === 0) return 'confirmed';
  if (row.reservation_state === 'released' && row.release_count === 1 && row.finalize_count === 0) return 'released';
  if (row.reservation_state === 'finalized' && row.finalize_count === 1 && row.release_count === 0) return 'finalized';
  return 'requires_review';
}
function positive(value: number): boolean { return Number.isSafeInteger(value) && value > 0; }
function nonNegative(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }
function invalidProjection(): HttpError {
  return new HttpError(503, 'ASSISTED_CHECKOUT_PROJECTION_INVALID', 'El pedido asistido requiere revisión.', false);
}
function notFound(): HttpError { return new HttpError(404, 'WEB_REQUEST_NOT_FOUND', 'No se encontró la solicitud.'); }
