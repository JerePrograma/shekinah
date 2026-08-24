import type { AdminRange } from './admin';
import { toCsv } from './admin';
import { HttpError } from './http';
import type { D1Database } from './platform';
import { expireWhatsappReservations } from './stock-reservations';

const orderColumns = `
  o.id, o.status, o.channel, o.currency, o.total_minor, o.item_count,
  o.created_at, o.updated_at, o.approved_at, o.resolved_at, o.resolved_by,
  o.stock_reserved_at, o.stock_reservation_expires_at, o.stock_consumed_at,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM order_items AS controlled_items
      WHERE controlled_items.order_id = o.id AND controlled_items.stock_controlled = 1
    ) THEN 'not_controlled'
    WHEN o.channel = 'whatsapp' AND o.status = 'approved' THEN 'consumed'
    WHEN o.stock_consumed_at IS NOT NULL THEN 'consumed'
    WHEN o.channel = 'whatsapp'
      AND o.status = 'pending'
      AND (
        o.stock_reservation_expires_at IS NULL
        OR unixepoch(o.stock_reservation_expires_at) > unixepoch()
      ) THEN 'reserved'
    WHEN o.channel = 'checkout_pro'
      AND o.stock_reserved_at IS NOT NULL
      AND o.stock_consumed_at IS NULL
      AND o.status NOT IN ('approved', 'refunded')
      AND (
        unixepoch(o.stock_reservation_expires_at) > unixepoch()
        OR EXISTS (
          SELECT 1 FROM payments AS pending_payments
          WHERE pending_payments.order_id = o.id
            AND pending_payments.mapped_status = 'pending'
        )
      ) THEN 'reserved'
    ELSE 'released'
  END AS stock_reservation_state,
  f.delivery_method, f.full_name, f.phone, f.address, f.locality,
  f.province, f.postal_code, f.total_weight_grams, f.shipping_tier,
  COALESCE(f.products_total_minor, o.total_minor) AS products_total_minor,
  COALESCE(f.shipping_minor, 0) AS shipping_minor`;

export type AdminOrderDetail = Readonly<{
  order: Readonly<Record<string, unknown>>;
  items: readonly Readonly<Record<string, unknown>>[];
  payments: readonly Readonly<Record<string, unknown>>[];
}>;

export async function listAdminOrdersWithFulfillment(
  database: D1Database,
  range: AdminRange,
): Promise<unknown> {
  await expireWhatsappReservations(database);
  const result = await database
    .prepare(
      `SELECT ${orderColumns}, o.last_error_code
       FROM orders o
       LEFT JOIN order_fulfillment f ON f.order_id = o.id
       WHERE (
           (o.channel = 'whatsapp' AND o.status = 'pending')
           OR o.created_at BETWEEN ? AND ?
         )
         AND (? IS NULL OR o.status = ?)
       ORDER BY CASE
         WHEN o.channel = 'whatsapp' AND o.status = 'pending' THEN 0
         ELSE 1
       END, o.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(range.from, range.to, range.status, range.status, range.limit, range.offset)
    .all<Record<string, unknown>>();
  return Object.freeze({ rows: result.results ?? [], limit: range.limit, offset: range.offset });
}

export async function getAdminOrderWithFulfillment(
  database: D1Database,
  id: string,
): Promise<AdminOrderDetail | null> {
  if (!/^ord_[A-Za-z0-9_-]{20,128}$/u.test(id)) {
    throw new HttpError(400, 'INVALID_ORDER_ID', 'El identificador de pedido no es válido.');
  }
  await expireWhatsappReservations(database);
  const order = await database
    .prepare(
      `SELECT ${orderColumns}, o.mp_preference_id, o.last_error_code
       FROM orders o
       LEFT JOIN order_fulfillment f ON f.order_id = o.id
       WHERE o.id = ? LIMIT 1`,
    )
    .bind(id)
    .first<Record<string, unknown>>();
  if (order === null) return null;
  const items = await database
    .prepare(
      `SELECT product_id, name, presentation, sku, quantity,
              unit_price_minor, subtotal_minor, stock_controlled
       FROM order_items WHERE order_id = ? ORDER BY name`,
    )
    .bind(id)
    .all<Record<string, unknown>>();
  const payments = await database
    .prepare(
      `SELECT 'mercadopago' AS provider, provider_payment_id, mapped_status, provider_status, status_detail,
              amount_minor, currency, approved_at, provider_updated_at, updated_at
       FROM payments WHERE order_id = ? ORDER BY updated_at DESC`,
    )
    .bind(id)
    .all<Record<string, unknown>>();
  return Object.freeze({
    order,
    items: items.results ?? [],
    payments: payments.results ?? [],
  });
}

export async function exportOrdersWithFulfillmentCsv(
  database: D1Database,
  range: AdminRange,
): Promise<string> {
  await expireWhatsappReservations(database);
  const result = await database
    .prepare(
      `SELECT ${orderColumns}
       FROM orders o
       LEFT JOIN order_fulfillment f ON f.order_id = o.id
       WHERE o.created_at BETWEEN ? AND ?
         AND (? IS NULL OR o.status = ?)
       ORDER BY o.created_at DESC LIMIT ?`,
    )
    .bind(range.from, range.to, range.status, range.status, range.limit)
    .all<Record<string, unknown>>();
  return toCsv(
    [
      'pedido', 'estado', 'moneda', 'productos_minor', 'envio_minor', 'total_minor',
      'cantidad', 'modalidad', 'cliente', 'celular', 'direccion', 'localidad',
      'provincia', 'codigo_postal', 'peso_gramos', 'tarifa', 'creado',
      'actualizado', 'aprobado',
    ],
    (result.results ?? []).map((row) => [
      row.id,
      row.status,
      row.currency,
      row.products_total_minor,
      row.shipping_minor,
      row.total_minor,
      row.item_count,
      row.delivery_method,
      row.full_name,
      row.phone,
      row.address,
      row.locality,
      row.province,
      row.postal_code,
      row.total_weight_grams,
      row.shipping_tier,
      row.created_at,
      row.updated_at,
      row.approved_at,
    ]),
  );
}
