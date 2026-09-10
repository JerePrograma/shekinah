import { validateFulfillment } from '../src/commerce/fulfillment';
import type { ShippingTier } from '../src/commerce/fulfillment';
import type { RecalculatedCart, RecalculatedLine } from './catalog';
import { createPaymentCart } from './fulfillment';
import { HttpError } from './http';
import {
  assertMercadoPagoPreferenceActive,
  createMercadoPagoPreference,
  recoverMercadoPagoPreference,
} from './mercado-pago';
import {
  claimPreferenceAttempt,
  getOrderById,
  markOrderFailed,
  markPreferenceCreated,
  resetRetrySafeFailedOrder,
} from './orders';
import { sha256Hex } from './crypto';
import type { CommerceMode, D1Database } from './platform';

export type AssistedPaymentDependencies = Readonly<{
  accessToken: string;
  mode: CommerceMode;
  siteUrl: URL;
}>;

export type AssistedPaymentResult = Readonly<{
  checkoutUrl: string;
  orderId: string;
  totalMinor: number;
  created: boolean;
}>;

type AssistedAccessRow = Readonly<{
  id: string;
  status: string;
  total_minor: number;
  item_count: number;
  created_at: string;
  mp_preference_id: string | null;
  mp_checkout_url: string | null;
  mp_preference_attempted_at: string | null;
  verification_method: string;
  reservation_state: string;
  reserve_count: number;
}>;

type ItemRow = Readonly<{
  product_id: string;
  name: string;
  presentation: string | null;
  sku: string | null;
  quantity: number;
  unit_price_minor: number;
  subtotal_minor: number;
  stock_controlled: number;
  provider_catalog_version: string | null;
}>;

type FulfillmentRow = Readonly<{
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
}>;

type PreferenceGateway = Readonly<{
  create: typeof createMercadoPagoPreference;
  recover: typeof recoverMercadoPagoPreference;
}>;

const defaultGateway: PreferenceGateway = Object.freeze({
  create: createMercadoPagoPreference,
  recover: recoverMercadoPagoPreference,
});

export async function createOrRecoverAssistedPreference(
  database: D1Database,
  publicToken: string,
  dependencies: AssistedPaymentDependencies,
  gateway: PreferenceGateway = defaultGateway,
): Promise<AssistedPaymentResult> {
  if (!/^[a-f0-9]{64}$/u.test(publicToken)) throw notFound();
  const access = await readAssistedAccess(database, await sha256Hex(publicToken));
  if (access === null) throw notFound();
  assertAssistedReservation(access);
  const order = await getOrderById(database, access.id);
  if (order === null) throw notFound();
  if (order.status === 'approved' || order.status === 'refunded') {
    throw new HttpError(409, 'ORDER_ALREADY_FINALIZED', 'Este pedido ya tiene un estado financiero final.');
  }
  assertMercadoPagoPreferenceActive(order.created_at);
  if ((order.mp_preference_id === null) !== (order.mp_checkout_url === null)) {
    throw new HttpError(503, 'PREFERENCE_STATE_INVALID', 'El estado de la preferencia requiere revisión.', false);
  }
  if (order.mp_preference_id !== null && order.mp_checkout_url !== null) {
    return Object.freeze({ checkoutUrl: order.mp_checkout_url, orderId: order.id, totalMinor: order.total_minor, created: false });
  }

  const cart = createPaymentCart(await readPaymentCart(database, order.id, order.total_minor, order.item_count));
  if (order.mp_preference_attempted_at !== null) {
    const recovered = await gateway.recover({
      accessToken: dependencies.accessToken,
      cart,
      createdAt: order.created_at,
      mode: dependencies.mode,
      orderId: order.id,
    });
    if (recovered === null) {
      throw new HttpError(409, 'PREFERENCE_RECOVERY_PENDING', 'Existe un intento de pago previo que todavía no puede confirmarse.');
    }
    await markPreferenceCreated(database, order.id, recovered.id, recovered.checkoutUrl);
    return Object.freeze({ checkoutUrl: recovered.checkoutUrl, orderId: order.id, totalMinor: order.total_minor, created: false });
  }

  if (order.status === 'failed') await resetRetrySafeFailedOrder(database, order.id);
  const attemptToken = await claimPreferenceAttempt(database, order.id);
  if (attemptToken === null) {
    const current = await getOrderById(database, order.id);
    if (current?.mp_preference_id !== null && current?.mp_checkout_url !== null) {
      return Object.freeze({ checkoutUrl: current.mp_checkout_url, orderId: current.id, totalMinor: current.total_minor, created: false });
    }
    throw new HttpError(409, 'PREFERENCE_ATTEMPT_IN_PROGRESS', 'Ya existe un intento de pago en curso para este pedido.');
  }
  try {
    const preference = await gateway.create({
      accessToken: dependencies.accessToken,
      cart,
      createdAt: order.created_at,
      mode: dependencies.mode,
      orderId: order.id,
      publicToken,
      siteUrl: dependencies.siteUrl,
    });
    await markPreferenceCreated(database, order.id, preference.id, preference.checkoutUrl, attemptToken);
    return Object.freeze({ checkoutUrl: preference.checkoutUrl, orderId: order.id, totalMinor: order.total_minor, created: true });
  } catch (error: unknown) {
    const code = error instanceof HttpError ? error.code : 'PREFERENCE_PERSIST_FAILED';
    const retrySafe = code === 'PAYMENT_PROVIDER_REJECTED';
    try {
      await markOrderFailed(database, order.id, attemptToken, code, retrySafe);
    } catch (persistenceError: unknown) {
      console.error('Could not persist assisted checkout failure', {
        name: persistenceError instanceof Error ? persistenceError.name : 'UnknownError',
      });
    }
    throw error;
  }
}

async function readAssistedAccess(database: D1Database, tokenHash: string): Promise<AssistedAccessRow | null> {
  try {
    return await database.prepare(`SELECT o.id, o.status, o.total_minor, o.item_count, o.created_at,
      o.mp_preference_id, o.mp_checkout_url, o.mp_preference_attempted_at,
      d.verification_method, d.reservation_state,
      (SELECT COUNT(*) FROM dux_order_operations op
        WHERE op.order_id = o.id AND op.action = 'reserve' AND op.status = 'confirmed'
          AND op.idempotency_key = 'assisted-reserve:' || o.id) AS reserve_count
      FROM orders o INNER JOIN dux_order_links d ON d.order_id = o.id
      WHERE o.public_token_hash = ? AND o.channel = 'checkout_pro'
        AND o.web_request_id IS NOT NULL LIMIT 1`)
      .bind(tokenHash).first<AssistedAccessRow>();
  } catch (error: unknown) {
    if (error instanceof Error && /no such (?:table|column):/iu.test(error.message)) {
      throw new HttpError(503, 'ASSISTED_CHECKOUT_MIGRATION_REQUIRED', 'Faltan migraciones del checkout asistido.');
    }
    throw error;
  }
}

function assertAssistedReservation(row: AssistedAccessRow): void {
  if (row.verification_method !== 'assisted_admin' || row.reservation_state !== 'confirmed' || row.reserve_count !== 1) {
    throw new HttpError(409, 'ASSISTED_RESERVATION_REQUIRED', 'La reserva Dux debe estar confirmada antes de iniciar el pago.');
  }
}

async function readPaymentCart(
  database: D1Database,
  orderId: string,
  expectedTotalMinor: number,
  expectedItemCount: number,
): Promise<RecalculatedCart> {
  const [itemsResult, fulfillment] = await Promise.all([
    database.prepare(`SELECT product_id, name, presentation, sku, quantity, unit_price_minor,
      subtotal_minor, stock_controlled, provider_catalog_version
      FROM order_items WHERE order_id = ? ORDER BY product_id`).bind(orderId).all<ItemRow>(),
    database.prepare(`SELECT delivery_method, full_name, phone, address, locality, province,
      postal_code, total_weight_grams, shipping_tier, products_total_minor, shipping_minor
      FROM order_fulfillment WHERE order_id = ? LIMIT 1`).bind(orderId).first<FulfillmentRow>(),
  ]);
  if (fulfillment === null) throw invalidProjection();
  const validatedFulfillment = validateFulfillment({
    method: fulfillment.delivery_method,
    fullName: fulfillment.full_name,
    phone: fulfillment.phone,
    address: fulfillment.address,
    locality: fulfillment.locality,
    province: fulfillment.province,
    postalCode: fulfillment.postal_code,
  });
  if (validatedFulfillment.value === null) throw invalidProjection();
  const shippingTier = readShippingTier(fulfillment);
  const lines: RecalculatedLine[] = [];
  let productsTotalMinor = 0;
  let itemCount = 0;
  for (const item of itemsResult.results ?? []) {
    if (
      typeof item.product_id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,179}$/u.test(item.product_id) ||
      typeof item.name !== 'string' || item.name.trim() === '' || item.name.length > 500 ||
      item.presentation !== null ||
      typeof item.sku !== 'string' || item.sku.trim() === '' || item.sku.length > 300 ||
      !Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
      !Number.isSafeInteger(item.unit_price_minor) || item.unit_price_minor <= 0 ||
      !Number.isSafeInteger(item.subtotal_minor) || item.subtotal_minor !== item.quantity * item.unit_price_minor ||
      item.stock_controlled !== 0 ||
      typeof item.provider_catalog_version !== 'string' || !/^[a-f0-9]{64}$/u.test(item.provider_catalog_version)
    ) throw invalidProjection();
    productsTotalMinor += item.subtotal_minor;
    itemCount += item.quantity;
    if (!Number.isSafeInteger(productsTotalMinor) || !Number.isSafeInteger(itemCount)) throw invalidProjection();
    lines.push(Object.freeze({
      product: Object.freeze({
        id: item.product_id,
        name: item.name,
        sku: item.sku,
        unitPriceMinor: item.unit_price_minor,
        available: true,
        stockControlled: false,
        inventoryProvider: 'dux',
        providerCatalogVersion: item.provider_catalog_version,
      }),
      quantity: item.quantity,
      subtotalMinor: item.subtotal_minor,
    }));
  }
  if (
    lines.length === 0 ||
    productsTotalMinor !== fulfillment.products_total_minor ||
    itemCount !== expectedItemCount ||
    productsTotalMinor + fulfillment.shipping_minor !== expectedTotalMinor
  ) throw invalidProjection();
  return Object.freeze({
    lines: Object.freeze(lines),
    currency: 'ARS',
    itemCount,
    productsTotalMinor,
    shippingMinor: fulfillment.shipping_minor,
    shippingTier,
    totalWeightGrams: fulfillment.total_weight_grams,
    fulfillment: validatedFulfillment.value,
    totalMinor: expectedTotalMinor,
  });
}

function readShippingTier(row: FulfillmentRow): Exclude<ShippingTier, 'manual_unknown_weight' | 'manual_over_5kg'> {
  if (
    row.delivery_method === 'coordinated_pickup' &&
    row.shipping_tier === 'coordinated_pickup' && row.shipping_minor === 0
  ) return 'coordinated_pickup';
  if (
    row.delivery_method === 'correo_argentino' && row.shipping_tier === 'correo_manual_quote' &&
    row.shipping_minor > 0 && row.total_weight_grams === null
  ) return 'correo_manual_quote';
  if (
    row.delivery_method === 'correo_argentino' &&
    (row.shipping_tier === 'correo_up_to_1kg' || row.shipping_tier === 'correo_up_to_5kg') &&
    row.shipping_minor > 0 && row.total_weight_grams !== null
  ) return row.shipping_tier;
  throw invalidProjection();
}

function invalidProjection(): HttpError {
  return new HttpError(503, 'ASSISTED_CHECKOUT_PROJECTION_INVALID', 'El pedido preparado no puede reconstruirse con seguridad.', false);
}

function notFound(): HttpError {
  return new HttpError(404, 'ORDER_NOT_FOUND', 'No se encontró el pedido.');
}
