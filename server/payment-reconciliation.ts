import { getAdminOrderWithFulfillment } from './admin-fulfillment';
import { sha256Hex } from './crypto';
import { HttpError } from './http';
import {
  assertMercadoPagoPaymentContext,
  mapPaymentStatus,
  searchMercadoPagoPayments,
} from './mercado-pago';
import { getOrderById, updateOrderFromPayment } from './orders';
import {
  consumeMercadoLibreInventoryReservation,
  hasMercadoLibreInventoryReservation,
  markRefundForInventoryReview,
  releaseMercadoLibreInventory,
} from './mercado-libre-inventory';
import type { CommerceMode, D1Database, Env } from './platform';

export async function reconcileMercadoPagoOrder(
  database: D1Database,
  orderId: string,
  accessToken: string,
  mode: CommerceMode,
  env?: Env,
): Promise<unknown> {
  if (!/^ord_[A-Za-z0-9_-]{20,128}$/u.test(orderId)) {
    throw new HttpError(400, 'INVALID_ORDER_ID', 'El identificador de pedido no es válido.');
  }
  const order = await getOrderById(database, orderId);
  if (order === null) {
    throw new HttpError(404, 'ORDER_NOT_FOUND', 'No se encontró el pedido.');
  }
  if (order.channel !== 'checkout_pro') {
    throw new HttpError(
      409,
      'ORDER_CHANNEL_CONFLICT',
      'La conciliación con Mercado Pago sólo admite pedidos de Checkout Pro.',
    );
  }

  const payments = await searchMercadoPagoPayments(orderId, accessToken);
  for (const payment of payments) {
    assertMercadoPagoPaymentContext(payment, { mode, orderId });
    if (
      payment.externalReference !== order.id ||
      payment.currency !== order.currency ||
      payment.amountMinor !== order.total_minor
    ) {
      throw new HttpError(409, 'PAYMENT_ORDER_MISMATCH', 'El pago no coincide con el pedido.');
    }
  }

  const orderedPayments = [...payments].sort((left, right) =>
    (left.updatedAt ?? '').localeCompare(right.updatedAt ?? '') || left.id.localeCompare(right.id),
  );
  for (const payment of orderedPayments) {
    const current = await getOrderById(database, orderId);
    if (current === null) {
      throw new HttpError(404, 'ORDER_NOT_FOUND', 'No se encontró el pedido.');
    }
    const eventKey = await sha256Hex([
      'admin-reconciliation',
      orderId,
      payment.id,
      payment.status,
      payment.updatedAt ?? '',
    ].join('|'));
    const mappedStatus = mapPaymentStatus(payment.status);
    await updateOrderFromPayment(
      database,
      current,
      payment,
      mappedStatus,
      eventKey,
    );
    if (await hasMercadoLibreInventoryReservation(database, orderId)) {
      if (mappedStatus === 'approved') {
        await consumeMercadoLibreInventoryReservation(database, orderId, env);
      } else if ((mappedStatus === 'rejected' || mappedStatus === 'cancelled') && env !== undefined) {
        await releaseMercadoLibreInventory(database, env, orderId);
      } else if (mappedStatus === 'refunded') {
        await markRefundForInventoryReview(database, orderId);
      }
    }
  }

  const detail = await getAdminOrderWithFulfillment(database, orderId);
  if (detail === null) {
    throw new HttpError(404, 'ORDER_NOT_FOUND', 'No se encontró el pedido.');
  }
  return Object.freeze({
    ...detail,
    reconciliation: Object.freeze({
      checkedPayments: payments.length,
      reconciledAt: new Date().toISOString(),
    }),
  });
}
