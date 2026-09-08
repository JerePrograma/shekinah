import { orderPaymentJoin, orderPaymentReviewSql, orderPaymentStatusSql } from './order-payment-state';
import type { D1Database } from './platform';

export async function listCommerceAttention(database: D1Database, offset = 0) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) {
    throw new RangeError('Paginación fuera de rango.');
  }
  const limit = 25;
  const result = await database.prepare(`SELECT * FROM (
    SELECT o.id, o.status AS order_status, o.currency, o.total_minor, o.created_at,
      ${orderPaymentStatusSql} AS payment_status,
      ${orderPaymentReviewSql} AS payment_requires_review,
      d.dux_reference, d.dux_order_id, d.reservation_state,
      CASE
        WHEN financial.approved_count > 1 THEN 'duplicate_payment'
        WHEN (${orderPaymentReviewSql}) = 1 THEN 'payment_review'
        WHEN d.reservation_state IN ('pending', 'uncertain') THEN 'reconcile'
        WHEN d.reservation_state = 'compensation_pending' THEN 'release_review'
        WHEN financial.approved_count > 0 AND d.reservation_state = 'confirmed' THEN 'finalize'
        WHEN d.reservation_state IN ('not_attempted', 'blocked') THEN 'reservation_review'
        ELSE NULL END AS next_action
    FROM orders o ${orderPaymentJoin}
    LEFT JOIN dux_order_links d ON d.order_id = o.id
  ) WHERE next_action IS NOT NULL
  ORDER BY CASE WHEN payment_status = 'approved' THEN 0 ELSE 1 END, created_at, id
  LIMIT ? OFFSET ?`).bind(limit + 1, offset).all<Record<string, unknown>>();
  const rows = result.results ?? [];
  return Object.freeze({ rows: Object.freeze(rows.slice(0, limit)), offset, limit, hasMore: rows.length > limit });
}
