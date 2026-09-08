import type { PublicOrderStatusResponse } from '../src/commerce/contracts';
import type { OrderPaymentState } from '../src/commerce/payment-state';
import { parseOrderPaymentState } from '../src/commerce/payment-state';
import { HttpError } from './http';
import type { D1Database } from './platform';

// Las filas incompatibles no acreditan cobertura financiera. Se usa la misma
// prioridad que la proyección de orders, sin confundir approved manual con pago.
function paymentJoin(source: 'orders' | 'target'): string {
  return `LEFT JOIN (
  SELECT p.order_id,
    SUM(CASE WHEN p.mapped_status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
    SUM(CASE WHEN p.mapped_status = 'refunded' THEN 1 ELSE 0 END) AS refunded_count,
    SUM(CASE WHEN p.mapped_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
    SUM(CASE WHEN p.mapped_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
    SUM(CASE WHEN p.mapped_status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
    MAX(p.updated_at) AS payment_updated_at
  FROM payments p INNER JOIN ${source} expected ON expected.id = p.order_id
  WHERE p.amount_minor = expected.total_minor AND p.currency = expected.currency
    AND p.external_reference = expected.id
  GROUP BY p.order_id
) financial ON financial.order_id = o.id`;
}

export const orderPaymentJoin = paymentJoin('orders');

export const orderPaymentStatusSql = `CASE
  WHEN financial.approved_count > 0 THEN 'approved'
  WHEN financial.refunded_count > 0 THEN 'refunded'
  WHEN financial.pending_count > 0 THEN 'pending'
  WHEN financial.rejected_count > 0 THEN 'rejected'
  WHEN financial.cancelled_count > 0 THEN 'cancelled'
  ELSE 'none' END`;

export const orderPaymentReviewSql = `CASE
  WHEN financial.approved_count > 1 THEN 1
  WHEN financial.approved_count > 0 AND o.status <> 'approved' THEN 1
  WHEN COALESCE(financial.approved_count, 0) = 0
    AND financial.refunded_count > 0 AND o.status <> 'refunded' THEN 1
  ELSE 0 END`;

type PaymentSummaryRow = Readonly<{
  payment_status: unknown; requires_review: unknown; payment_updated_at: unknown;
}>;

const paymentColumns = `${orderPaymentStatusSql} AS payment_status,
  ${orderPaymentReviewSql} AS requires_review, financial.payment_updated_at`;

export async function getOrderPaymentState(database: D1Database, orderId: string): Promise<OrderPaymentState> {
  const row = await database.prepare(`WITH target AS (SELECT * FROM orders WHERE id = ?)
    SELECT ${paymentColumns} FROM target o ${paymentJoin('target')}`)
    .bind(orderId).first<PaymentSummaryRow>();
  if (row === null) throw new HttpError(404, 'ORDER_NOT_FOUND', 'No se encontró el estado solicitado.');
  return readPayment(row);
}

/** Una sola lectura mantiene coherentes el pedido y su evidencia financiera. */
export async function getPublicOrderState(database: D1Database, tokenHash: string): Promise<PublicOrderStatusResponse | null> {
  const row = await database.prepare(`WITH target AS (SELECT * FROM orders WHERE public_token_hash = ?)
    SELECT o.status, o.currency, o.total_minor, o.item_count, o.updated_at, ${paymentColumns}
    FROM target o ${paymentJoin('target')}`)
    .bind(tokenHash).first<PaymentSummaryRow & Readonly<{
      status: PublicOrderStatusResponse['status']; currency: 'ARS';
      total_minor: number; item_count: number; updated_at: string;
    }>>();
  if (row === null) return null;
  return Object.freeze({
    status: row.status, currency: row.currency, totalMinor: row.total_minor,
    itemCount: row.item_count, updatedAt: row.updated_at, payment: readPayment(row),
  });
}

function readPayment(row: PaymentSummaryRow): OrderPaymentState {
  if (row.requires_review !== 0 && row.requires_review !== 1) {
    throw new HttpError(503, 'PAYMENT_STATE_UNAVAILABLE', 'No se pudo verificar el estado financiero.');
  }
  return parseOrderPaymentState({
    status: row.payment_status, requiresReview: row.requires_review === 1, updatedAt: row.payment_updated_at,
  });
}
