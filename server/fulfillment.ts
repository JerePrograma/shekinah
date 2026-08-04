import type { RecalculatedCart } from './catalog';
import { sha256Hex } from './crypto';
import { HttpError } from './http';
import { cartFingerprint } from './orders';
import type { D1Database } from './platform';
import {
  fulfillmentCanonicalValue,
  validateFulfillment,
} from '../src/commerce/fulfillment';
import type { CheckoutFulfillment } from '../src/commerce/fulfillment';

export function requireCheckoutFulfillment(value: unknown): CheckoutFulfillment {
  const validation = validateFulfillment(value);
  if (validation.value !== null) return validation.value;
  const message = Object.values(validation.errors)[0] ?? 'Los datos de entrega no son válidos.';
  throw new HttpError(400, 'INVALID_FULFILLMENT', message);
}

export async function reserveCheckoutIntent(
  database: D1Database,
  idempotencyKey: string,
  cart: RecalculatedCart,
): Promise<void> {
  const fulfillmentFingerprint = await sha256Hex(fulfillmentCanonicalValue(cart.fulfillment));
  const authoritativeCartFingerprint = await cartFingerprint(cart);
  const now = new Date().toISOString();
  await database
    .prepare(
      `INSERT OR IGNORE INTO checkout_intents (
        checkout_idempotency_key, fulfillment_fingerprint, cart_fingerprint, created_at
      ) VALUES (?, ?, ?, ?)`,
    )
    .bind(idempotencyKey, fulfillmentFingerprint, authoritativeCartFingerprint, now)
    .run();
  let persisted = await database
    .prepare(
      `SELECT fulfillment_fingerprint, cart_fingerprint
       FROM checkout_intents
       WHERE checkout_idempotency_key = ?
       LIMIT 1`,
    )
    .bind(idempotencyKey)
    .first<Readonly<{ fulfillment_fingerprint: string; cart_fingerprint: string | null }>>();
  if (persisted?.fulfillment_fingerprint !== fulfillmentFingerprint) {
    throw new HttpError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'La clave de idempotencia ya fue usada con otra intención de compra.',
    );
  }
  if (persisted.cart_fingerprint === null) {
    await database
      .prepare(
        `UPDATE checkout_intents SET cart_fingerprint = ?
         WHERE checkout_idempotency_key = ? AND cart_fingerprint IS NULL`,
      )
      .bind(authoritativeCartFingerprint, idempotencyKey)
      .run();
    persisted = await database
      .prepare(
        `SELECT fulfillment_fingerprint, cart_fingerprint
         FROM checkout_intents
         WHERE checkout_idempotency_key = ?
         LIMIT 1`,
      )
      .bind(idempotencyKey)
      .first<Readonly<{ fulfillment_fingerprint: string; cart_fingerprint: string | null }>>();
  }
  if (persisted?.cart_fingerprint !== authoritativeCartFingerprint) {
    throw new HttpError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'La clave de idempotencia ya fue usada con otra intención de compra.',
    );
  }
}

export async function persistOrderFulfillment(
  database: D1Database,
  orderId: string,
  cart: RecalculatedCart,
): Promise<void> {
  const { fulfillment } = cart;
  const now = new Date().toISOString();
  await database
    .prepare(
      `INSERT OR IGNORE INTO order_fulfillment (
        order_id, delivery_method, full_name, phone, address, locality,
        province, postal_code, total_weight_grams, shipping_tier,
        products_total_minor, shipping_minor, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?)`,
    )
    .bind(
      orderId,
      fulfillment.method,
      fulfillment.fullName,
      fulfillment.phone,
      fulfillment.address,
      fulfillment.locality,
      fulfillment.province,
      fulfillment.postalCode,
      cart.totalWeightGrams,
      cart.shippingTier,
      cart.productsTotalMinor,
      cart.shippingMinor,
      now,
      now,
      orderId,
    )
    .run();

  const persisted = await database
    .prepare(
      `SELECT delivery_method, full_name, phone, address, locality, province,
              postal_code, total_weight_grams, shipping_tier,
              products_total_minor, shipping_minor
       FROM order_fulfillment
       WHERE order_id = ?
       LIMIT 1`,
    )
    .bind(orderId)
    .first<Readonly<{
      delivery_method: string;
      full_name: string;
      phone: string;
      address: string;
      locality: string;
      province: string;
      postal_code: string;
      total_weight_grams: number | null;
      shipping_tier: string;
      products_total_minor: number;
      shipping_minor: number;
    }>>();

  if (
    persisted === null ||
    persisted.delivery_method !== fulfillment.method ||
    persisted.full_name !== fulfillment.fullName ||
    persisted.phone !== fulfillment.phone ||
    persisted.address !== fulfillment.address ||
    persisted.locality !== fulfillment.locality ||
    persisted.province !== fulfillment.province ||
    persisted.postal_code !== fulfillment.postalCode ||
    persisted.total_weight_grams !== cart.totalWeightGrams ||
    persisted.shipping_tier !== cart.shippingTier ||
    persisted.products_total_minor !== cart.productsTotalMinor ||
    persisted.shipping_minor !== cart.shippingMinor
  ) {
    throw new HttpError(
      409,
      'FULFILLMENT_PERSIST_CONFLICT',
      'Los datos de entrega no coinciden con el pedido existente.',
    );
  }
}

export function createPaymentCart(cart: RecalculatedCart): RecalculatedCart {
  if (cart.shippingMinor === 0) return cart;
  const shippingLine = Object.freeze({
    product: Object.freeze({
      id: 'shipping-correo-argentino',
      name: 'Envío por Correo Argentino',
      unitPriceMinor: cart.shippingMinor,
      available: true,
    }),
    quantity: 1,
    subtotalMinor: cart.shippingMinor,
  });
  return Object.freeze({
    ...cart,
    lines: Object.freeze([...cart.lines, shippingLine]),
  });
}
