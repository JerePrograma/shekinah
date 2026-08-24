import { isProductEffectivelyAvailable } from '../src/catalog/model';
import {
  MAX_CART_LINES,
  MAX_CART_QUANTITY,
  WHATSAPP_RESERVATION_WINDOW_MS,
} from '../src/commerce/contracts';
import {
  calculateShippingQuote,
  fulfillmentCanonicalValue,
} from '../src/commerce/fulfillment';
import type {
  CheckoutFulfillment,
  ShippingTier,
} from '../src/commerce/fulfillment';
import { getAdminOrderWithFulfillment } from './admin-fulfillment';
import type { AdminOrderDetail } from './admin-fulfillment';
import { getRuntimeCatalogProductDetail } from './catalog-store';
import type { RecalculatedLine, ServerCatalogProduct } from './catalog';
import { randomToken, sha256Hex } from './crypto';
import { requireCheckoutFulfillment } from './fulfillment';
import { HttpError } from './http';
import {
  reconcileExpiredMercadoLibreReservations,
  reserveMercadoLibreInventory,
} from './mercado-libre-inventory';
import { cartFingerprint } from './orders';
import type { D1Database, D1PreparedStatement, Env } from './platform';
import { expireWhatsappReservations } from './stock-reservations';
import {
  assertExactKeys,
  assertUuid,
  isRecord,
  readInteger,
  readSafeText,
} from './validation';

type OnlineShippingTier = Exclude<
  ShippingTier,
  'manual_unknown_weight' | 'manual_over_5kg'
>;

export type WhatsappCart = Readonly<{
  lines: readonly RecalculatedLine[];
  currency: 'ARS';
  itemCount: number;
  productsTotalMinor: number;
  shippingMinor: number;
  shippingTier: OnlineShippingTier | null;
  totalWeightGrams: number | null;
  fulfillment: CheckoutFulfillment;
  totalMinor: number;
}>;

export type WhatsappOrderResponse = Readonly<{
  orderId: string;
  status: 'pending';
  currency: 'ARS';
  totalMinor: number;
  itemCount: number;
  createdAt: string;
  items: readonly Readonly<{
    productId: string;
    name: string;
    presentation?: string;
    quantity: number;
    unitPriceMinor: number;
    subtotalMinor: number;
  }>[];
}>;

export type CreatedWhatsappOrder = Readonly<{
  response: WhatsappOrderResponse;
  created: boolean;
}>;

type WhatsappOrderRow = Readonly<{
  id: string;
  channel: string;
  status: string;
  currency: string;
  total_minor: number;
  item_count: number;
  cart_fingerprint: string;
  whatsapp_fulfillment_fingerprint: string | null;
  created_at: string;
}>;

type WhatsappOrderItemRow = Readonly<{
  product_id: string;
  name: string;
  presentation: string | null;
  quantity: number;
  unit_price_minor: number;
  subtotal_minor: number;
}>;

type ParsedWhatsappOrderInput = Readonly<{
  idempotencyKey: string;
  fulfillment: CheckoutFulfillment;
  items: readonly Readonly<{ productId: string; quantity: number; catalogVersion?: string }>[];
}>;

type PersistedFulfillmentRow = Readonly<{
  delivery_method: string;
  full_name: string;
  phone: string;
  address: string;
  locality: string;
  province: string;
  postal_code: string;
}>;

export async function createWhatsappOrder(
  database: D1Database,
  value: unknown,
  env: Env = {},
): Promise<CreatedWhatsappOrder> {
  const input = parseWhatsappOrderInput(value);
  if (env.MERCADO_LIBRE_CATALOG_ENABLED === 'true') {
    await reconcileExpiredMercadoLibreReservations(database, env);
  } else {
    await expireWhatsappReservations(database);
  }
  const existing = await replayWhatsappOrder(database, input);
  if (existing !== null) {
    if (env.MERCADO_LIBRE_CATALOG_ENABLED === 'true') {
      await reserveMercadoLibreInventory(
        database,
        env,
        existing.response.orderId,
        input.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          expectedCatalogVersion: item.catalogVersion ?? '',
        })),
      );
    }
    return existing;
  }

  let cart: WhatsappCart;
  try {
    cart = await calculateWhatsappCart(input, database, env);
  } catch (error: unknown) {
    const raced = await replayWhatsappOrder(database, input);
    if (raced !== null) return raced;
    throw error;
  }
  const { idempotencyKey } = input;
  const baseFingerprint = await cartFingerprint(cart);
  const fulfillmentFingerprint = await sha256Hex(
    fulfillmentCanonicalValue(cart.fulfillment),
  );
  const fingerprint = await sha256Hex(
    `${baseFingerprint}:${fulfillmentCanonicalValue(cart.fulfillment)}`,
  );
  const orderId = `ord_${randomToken(18)}`;
  const publicTokenHash = await sha256Hex(randomToken(32));
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const reservationExpiresAt = new Date(
    nowDate.getTime() + WHATSAPP_RESERVATION_WINDOW_MS,
  ).toISOString();

  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT OR IGNORE INTO orders (
          id, public_token_hash, checkout_idempotency_key, cart_fingerprint,
          status, currency, total_minor, item_count, created_at, updated_at, channel,
          whatsapp_fulfillment_fingerprint, stock_reserved_at, stock_reservation_expires_at
        ) VALUES (?, ?, ?, ?, 'pending', 'ARS', ?, ?, ?, ?, 'whatsapp', ?, ?, ?)`,
      )
      .bind(
        orderId,
        publicTokenHash,
        idempotencyKey,
        fingerprint,
        cart.totalMinor,
        cart.itemCount,
        now,
        now,
        fulfillmentFingerprint,
        now,
        reservationExpiresAt,
      ),
    ...cart.lines.map(({ product, quantity, subtotalMinor }) =>
      product.providerCatalogVersion === undefined
        ? database
          .prepare(
            `INSERT INTO order_items (
              order_id, product_id, name, presentation, sku,
              quantity, unit_price_minor, subtotal_minor, stock_controlled
            )
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?)`,
          )
          .bind(
            orderId,
            product.id,
            product.name,
            product.presentation ?? null,
            product.sku ?? null,
            quantity,
            product.unitPriceMinor,
            subtotalMinor,
            product.stockControlled === true ? 1 : 0,
            orderId,
          )
        : database
          .prepare(
          `INSERT INTO order_items (
            order_id, product_id, name, presentation, sku,
            quantity, unit_price_minor, subtotal_minor, stock_controlled,
            provider_catalog_version
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?)`,
        )
          .bind(
          orderId,
          product.id,
          product.name,
          product.presentation ?? null,
          product.sku ?? null,
          quantity,
          product.unitPriceMinor,
          subtotalMinor,
          product.stockControlled === true ? 1 : 0,
          product.providerCatalogVersion ?? null,
          orderId,
          ),
    ),
  ];
  const shippingTier = cart.shippingTier;
  if (shippingTier !== null) {
    statements.push(
      prepareFulfillmentInsert(
        database,
        orderId,
        cart,
        cart.fulfillment,
        shippingTier,
        now,
      ),
    );
  }

  try {
    await database.batch(statements);
  } catch (error: unknown) {
    throwWhatsappStorageError(error);
  }

  const order = await database
    .prepare(
      `SELECT id, channel, status, currency, total_minor, item_count,
              cart_fingerprint, whatsapp_fulfillment_fingerprint, created_at
       FROM orders WHERE checkout_idempotency_key = ? LIMIT 1`,
    )
    .bind(idempotencyKey)
    .first<WhatsappOrderRow>();
  if (order === null) {
    throw new HttpError(500, 'ORDER_CREATE_FAILED', 'No se pudo registrar el pedido.', false);
  }
  if (
    order.channel !== 'whatsapp' ||
    order.cart_fingerprint !== fingerprint ||
    order.whatsapp_fulfillment_fingerprint !== fulfillmentFingerprint ||
    order.total_minor !== cart.totalMinor ||
    order.item_count !== cart.itemCount ||
    order.currency !== cart.currency
  ) {
    throw new HttpError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'La clave de idempotencia ya fue usada para otro pedido.',
    );
  }
  if (order.status !== 'pending') {
    throw new HttpError(
      409,
      'ORDER_ALREADY_RESOLVED',
      'El pedido asociado a esta solicitud ya fue resuelto.',
    );
  }

  if (env.MERCADO_LIBRE_CATALOG_ENABLED === 'true') {
    try {
      await reserveMercadoLibreInventory(
        database,
        env,
        order.id,
        input.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          expectedCatalogVersion: item.catalogVersion ?? '',
        })),
      );
    } catch (error: unknown) {
      await resolveWhatsappOrder(database, order.id, 'rejected', 'system:mercadolibre-reservation-failed');
      throw error;
    }
  }

  return Object.freeze({
    created: order.id === orderId,
    response: await buildWhatsappOrderResponse(database, order, cart.lines.length),
  });
}

export async function resolveWhatsappOrder(
  database: D1Database,
  orderId: string,
  targetStatus: 'approved' | 'rejected',
  actor: string,
): Promise<AdminOrderDetail & Readonly<{ changed: boolean }>> {
  assertOrderId(orderId);
  const resolvedAtDate = new Date();
  await expireWhatsappReservations(database, resolvedAtDate);
  const resolvedAt = resolvedAtDate.toISOString();
  let transitioned: Readonly<{ id: string }> | null;
  try {
    transitioned = await database
      .prepare(
        `UPDATE orders
         SET status = ?, resolved_at = ?, resolved_by = ?, updated_at = ?,
             approved_at = CASE WHEN ? = 'approved' THEN ? ELSE approved_at END
         WHERE id = ? AND channel = 'whatsapp' AND status = 'pending'
           AND (
             ? <> 'approved'
             OR stock_reservation_expires_at IS NULL
             OR unixepoch(stock_reservation_expires_at) > unixepoch(?)
           )
         RETURNING id`,
      )
      .bind(
        targetStatus,
        resolvedAt,
        actor,
        resolvedAt,
        targetStatus,
        resolvedAt,
        orderId,
        targetStatus,
        resolvedAt,
      )
      .first<Readonly<{ id: string }>>();
  } catch (error: unknown) {
    throwWhatsappStorageError(error);
  }

  const detail = await getAdminOrderWithFulfillment(database, orderId);
  if (detail === null) {
    throw new HttpError(404, 'ORDER_NOT_FOUND', 'No se encontró el pedido.');
  }
  const channel = detail.order.channel;
  const currentStatus = detail.order.status;
  if (channel !== 'whatsapp') {
    throw new HttpError(
      409,
      'ORDER_CHANNEL_CONFLICT',
      'Este pedido no pertenece al canal WhatsApp.',
    );
  }
  if (currentStatus !== targetStatus) {
    throw new HttpError(
      409,
      'ORDER_STATE_CONFLICT',
      'El pedido ya fue resuelto con otro estado.',
    );
  }
  return Object.freeze({ ...detail, changed: transitioned !== null });
}

export async function recalculateWhatsappCart(
  value: unknown,
  database: D1Database,
  env: Env = {},
): Promise<Readonly<{ idempotencyKey: string; cart: WhatsappCart }>> {
  const input = parseWhatsappOrderInput(value);
  return Object.freeze({
    idempotencyKey: input.idempotencyKey,
    cart: await calculateWhatsappCart(input, database, env),
  });
}

function parseWhatsappOrderInput(value: unknown): ParsedWhatsappOrderInput {
  if (!isRecord(value)) {
    throw new HttpError(400, 'INVALID_ORDER', 'La solicitud de pedido no es válida.');
  }
  assertExactKeys(
    value,
    ['idempotencyKey', 'items', 'fulfillment', 'whatsappConsent'],
    'INVALID_ORDER',
    'La solicitud contiene campos no permitidos.',
  );
  if (value.whatsappConsent !== true) {
    throw new HttpError(
      400,
      'WHATSAPP_CONSENT_REQUIRED',
      'Aceptá compartir estos datos por WhatsApp para gestionar el pedido.',
    );
  }
  const idempotencyKey = assertUuid(value.idempotencyKey, 'idempotencyKey');
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > MAX_CART_LINES) {
    throw new HttpError(400, 'INVALID_CART', 'El carrito no contiene una cantidad válida de productos.');
  }
  const fulfillment = requireCheckoutFulfillment(value.fulfillment);
  const seen = new Set<string>();
  const items = value.items.map((rawLine) => {
    if (!isRecord(rawLine)) {
      throw new HttpError(400, 'INVALID_CART_LINE', 'Una línea del carrito no es válida.');
    }
    assertExactKeys(
      rawLine,
      ['productId', 'quantity', 'catalogVersion'],
      'INVALID_CART_LINE',
      'Una línea del carrito contiene campos no permitidos.',
    );
    const productId = readSafeText(rawLine.productId, 'productId', 180);
    const quantity = readInteger(rawLine.quantity, 'quantity', 1, MAX_CART_QUANTITY);
    const catalogVersion = rawLine.catalogVersion === undefined
      ? undefined
      : readSafeText(rawLine.catalogVersion, 'catalogVersion', 64);
    if (seen.has(productId)) {
      throw new HttpError(400, 'DUPLICATE_PRODUCT', 'El carrito contiene un producto duplicado.');
    }
    seen.add(productId);
    return Object.freeze({ productId, quantity, ...(catalogVersion === undefined ? {} : { catalogVersion }) });
  });
  return Object.freeze({
    idempotencyKey,
    fulfillment,
    items: Object.freeze(items),
  });
}

async function calculateWhatsappCart(
  input: ParsedWhatsappOrderInput,
  database: D1Database,
  env: Env,
): Promise<WhatsappCart> {
  const lines: RecalculatedLine[] = [];
  let productsTotalMinor = 0;
  let itemCount = 0;
  for (const { productId, quantity, catalogVersion } of input.items) {
    const detail = await getRuntimeCatalogProductDetail(database, env, productId);
    if (detail === null) {
      throw new HttpError(400, 'PRODUCT_NOT_FOUND', 'Uno de los productos ya no existe.');
    }
    if (!isProductEffectivelyAvailable(detail)) {
      throw new HttpError(409, 'PRODUCT_UNAVAILABLE', `${detail.name} ya no está disponible.`);
    }
    if (env.MERCADO_LIBRE_CATALOG_ENABLED === 'true') {
      if (
        detail.commerce === undefined ||
        catalogVersion === undefined ||
        !/^[a-f0-9]{64}$/u.test(catalogVersion)
      ) {
        throw new HttpError(409, 'CATALOG_VERSION_REQUIRED', 'Actualizá el carrito antes de continuar.');
      }
      if (catalogVersion !== detail.commerce.catalogVersion) {
        throw new HttpError(409, 'CATALOG_VERSION_CONFLICT', `${detail.name} cambió desde que se agregó al carrito.`);
      }
      if (!detail.commerce.checkoutEligible) {
        throw new HttpError(409, 'MERCADO_LIBRE_STOCK_UNPROTECTED', `${detail.name} requiere confirmación de disponibilidad.`);
      }
    }
    const availableQuantity = detail.availableQuantity ?? detail.stockQuantity;
    if (availableQuantity !== undefined && quantity > availableQuantity) {
      throw new HttpError(
        409,
        'INSUFFICIENT_STOCK',
        `No hay stock suficiente para ${detail.name}.`,
      );
    }
    const unitPriceMinor = Math.round((detail.salePrice ?? detail.price).amount * 100);
    if (!Number.isSafeInteger(unitPriceMinor) || unitPriceMinor <= 0) {
      throw new HttpError(500, 'CATALOG_PRICE_INVALID', 'El catálogo contiene un precio no válido.', false);
    }
    const product: ServerCatalogProduct = Object.freeze({
      id: detail.id,
      name: detail.name,
      ...(detail.presentation === undefined ? {} : { presentation: detail.presentation }),
      ...(detail.sku === undefined ? {} : { sku: detail.sku }),
      unitPriceMinor,
      available: true,
      stockControlled: detail.commerce === undefined && detail.stockQuantity !== undefined,
      ...(detail.commerce === undefined ? {} : { providerCatalogVersion: detail.commerce.catalogVersion }),
    });
    const subtotalMinor = unitPriceMinor * quantity;
    productsTotalMinor += subtotalMinor;
    itemCount += quantity;
    if (
      !Number.isSafeInteger(subtotalMinor) ||
      subtotalMinor <= 0 ||
      !Number.isSafeInteger(productsTotalMinor) ||
      !Number.isSafeInteger(itemCount)
    ) {
      throw new HttpError(400, 'CART_TOTAL_OUT_OF_RANGE', 'El carrito excede los límites permitidos.');
    }
    lines.push(Object.freeze({ product, quantity, subtotalMinor }));
  }

  let shippingMinor = 0;
  let shippingTier: OnlineShippingTier | null = null;
  const quote = calculateShippingQuote(
    lines.map(({ product, quantity }) => ({
      name: product.name,
      ...(product.presentation === undefined ? {} : { presentation: product.presentation }),
      quantity,
    })),
    input.fulfillment.method,
  );
  const totalWeightGrams = quote.totalWeightGrams;
  if (quote.kind === 'online') {
    shippingMinor = quote.shippingMinor;
    shippingTier = quote.tier;
  }
  const totalMinor = productsTotalMinor + shippingMinor;
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
    throw new HttpError(400, 'CART_TOTAL_OUT_OF_RANGE', 'El total del pedido excede los límites permitidos.');
  }

  return Object.freeze({
    lines: Object.freeze(lines),
    currency: 'ARS',
    itemCount,
    productsTotalMinor,
    shippingMinor,
    shippingTier,
    totalWeightGrams,
    fulfillment: input.fulfillment,
    totalMinor,
  });
}

async function replayWhatsappOrder(
  database: D1Database,
  input: ParsedWhatsappOrderInput,
): Promise<CreatedWhatsappOrder | null> {
  let order: WhatsappOrderRow | null;
  try {
    order = await database
      .prepare(
        `SELECT id, channel, status, currency, total_minor, item_count,
                cart_fingerprint, whatsapp_fulfillment_fingerprint, created_at
         FROM orders WHERE checkout_idempotency_key = ? LIMIT 1`,
      )
      .bind(input.idempotencyKey)
      .first<WhatsappOrderRow>();
  } catch (error: unknown) {
    throwWhatsappStorageError(error);
  }
  if (order === null) return null;
  if (order.channel !== 'whatsapp') {
    throw new HttpError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'La clave de idempotencia ya fue usada para otro pedido.',
    );
  }
  let persistedItems;
  try {
    persistedItems = await database
      .prepare(
        `SELECT product_id, quantity, provider_catalog_version
         FROM order_items WHERE order_id = ? ORDER BY product_id`,
      )
      .bind(order.id)
      .all<Readonly<{ product_id: string; quantity: number; provider_catalog_version: string | null }>>();
  } catch (error: unknown) {
    if (!(error instanceof Error) || !/no such column:\s*provider_catalog_version/iu.test(error.message)) {
      throw error;
    }
    persistedItems = await database
      .prepare(
        `SELECT product_id, quantity, NULL AS provider_catalog_version
         FROM order_items WHERE order_id = ? ORDER BY product_id`,
      )
      .bind(order.id)
      .all<Readonly<{ product_id: string; quantity: number; provider_catalog_version: string | null }>>();
  }
  const requestedItems = [...input.items]
    .sort((left, right) => left.productId.localeCompare(right.productId));
  if (
    persistedItems.results?.length !== requestedItems.length ||
    requestedItems.some((item, index) => {
      const persisted = persistedItems.results?.[index];
      return persisted?.product_id !== item.productId ||
        persisted.quantity !== item.quantity ||
        (item.catalogVersion !== undefined && persisted.provider_catalog_version !== item.catalogVersion);
    }) ||
    !await fulfillmentMatches(database, order, input.fulfillment)
  ) {
    throw new HttpError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'La clave de idempotencia ya fue usada para otro pedido.',
    );
  }
  if (order.status !== 'pending') {
    throw new HttpError(
      409,
      'ORDER_ALREADY_RESOLVED',
      'El pedido asociado a esta solicitud ya fue resuelto.',
    );
  }
  return Object.freeze({
    created: false,
    response: await buildWhatsappOrderResponse(database, order, requestedItems.length),
  });
}

async function fulfillmentMatches(
  database: D1Database,
  order: WhatsappOrderRow,
  fulfillment: CheckoutFulfillment,
): Promise<boolean> {
  const fingerprint = await sha256Hex(fulfillmentCanonicalValue(fulfillment));
  if (order.whatsapp_fulfillment_fingerprint !== null) {
    return order.whatsapp_fulfillment_fingerprint === fingerprint;
  }
  const persisted = await database
    .prepare(
      `SELECT delivery_method, full_name, phone, address, locality, province, postal_code
       FROM order_fulfillment WHERE order_id = ? LIMIT 1`,
    )
    .bind(order.id)
    .first<PersistedFulfillmentRow>();
  return persisted !== null &&
    persisted.delivery_method === fulfillment.method &&
    persisted.full_name === fulfillment.fullName &&
    persisted.phone === fulfillment.phone &&
    persisted.address === fulfillment.address &&
    persisted.locality === fulfillment.locality &&
    persisted.province === fulfillment.province &&
    persisted.postal_code === fulfillment.postalCode;
}

async function buildWhatsappOrderResponse(
  database: D1Database,
  order: WhatsappOrderRow,
  expectedLineCount: number,
): Promise<WhatsappOrderResponse> {
  const items = await database
    .prepare(
      `SELECT product_id, name, presentation, quantity,
              unit_price_minor, subtotal_minor
       FROM order_items WHERE order_id = ? ORDER BY rowid`,
    )
    .bind(order.id)
    .all<WhatsappOrderItemRow>();
  const responseItems = Object.freeze(
    (items.results ?? []).map((item) => Object.freeze({
      productId: item.product_id,
      name: item.name,
      ...(item.presentation === null ? {} : { presentation: item.presentation }),
      quantity: item.quantity,
      unitPriceMinor: item.unit_price_minor,
      subtotalMinor: item.subtotal_minor,
    })),
  );
  if (
    responseItems.length !== expectedLineCount ||
    responseItems.reduce((total, item) => total + item.quantity, 0) !== order.item_count
  ) {
    throw new HttpError(500, 'ORDER_SNAPSHOT_INVALID', 'No se pudo verificar el pedido.', false);
  }
  return Object.freeze({
    orderId: order.id,
    status: 'pending',
    currency: 'ARS',
    totalMinor: order.total_minor,
    itemCount: order.item_count,
    createdAt: order.created_at,
    items: responseItems,
  });
}

function prepareFulfillmentInsert(
  database: D1Database,
  orderId: string,
  cart: WhatsappCart,
  fulfillment: CheckoutFulfillment,
  shippingTier: OnlineShippingTier,
  now: string,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO order_fulfillment (
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
      shippingTier,
      cart.productsTotalMinor,
      cart.shippingMinor,
      now,
      now,
      orderId,
    );
}

function assertOrderId(orderId: string): void {
  if (!/^ord_[A-Za-z0-9_-]{20,128}$/u.test(orderId)) {
    throw new HttpError(400, 'INVALID_ORDER_ID', 'El identificador de pedido no es válido.');
  }
}

function throwWhatsappStorageError(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  if (
    message.includes('WHATSAPP_INSUFFICIENT_STOCK') ||
    message.includes('STOCK_RESERVATION_INSUFFICIENT')
  ) {
    throw new HttpError(
      409,
      'INSUFFICIENT_STOCK',
      'Algunos productos ya no tienen la cantidad solicitada.',
    );
  }
  if (
    message.includes('WHATSAPP_PRODUCT_DELETED') ||
    message.includes('WHATSAPP_PRODUCT_UNAVAILABLE') ||
    message.includes('STOCK_PRODUCT_DELETED') ||
    message.includes('STOCK_PRODUCT_UNAVAILABLE')
  ) {
    throw new HttpError(
      409,
      'PRODUCT_UNAVAILABLE',
      'Uno de los productos ya no está disponible.',
    );
  }
  if (
    message.includes('WHATSAPP_RESERVATION_INCONSISTENT') ||
    message.includes('STOCK_CONTROL_SNAPSHOT_INCONSISTENT')
  ) {
    throw new HttpError(
      409,
      'RESERVATION_INCONSISTENT',
      'La reserva del pedido ya no es consistente con el inventario.',
    );
  }
  if (
    message.includes('WHATSAPP_STATE_TRANSITION_INVALID') ||
    message.includes('WHATSAPP_RESOLUTION_METADATA_REQUIRED')
  ) {
    throw new HttpError(409, 'ORDER_STATE_CONFLICT', 'El pedido no admite esa transición.');
  }
  if (
    /no such column:\s*(?:\w+\.)?(?:channel|resolved_at|resolved_by|whatsapp_fulfillment_fingerprint|stock_controlled)/iu.test(message) ||
    /table orders has no column named channel/iu.test(message) ||
    /no such table:\s*(?:orders|order_items|catalog_product_mutations)/iu.test(message)
  ) {
    throw new HttpError(
      503,
      'WHATSAPP_MIGRATION_REQUIRED',
      'La migración de pedidos por WhatsApp todavía no fue aplicada.',
    );
  }
  throw error;
}
