import type { RecalculatedCart } from './catalog';
import { hmacSha256Hex, randomToken, sha256Hex } from './crypto';
import { HttpError } from './http';
import type { D1Database } from './platform';

export type OrderStatus =
  | 'preference_pending'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'failed';

export type OrderRow = Readonly<{
  id: string;
  public_token_hash: string;
  checkout_idempotency_key: string;
  cart_fingerprint: string;
  status: OrderStatus;
  currency: 'ARS';
  total_minor: number;
  item_count: number;
  mp_preference_id: string | null;
  mp_checkout_url: string | null;
  mp_preference_attempted_at: string | null;
  mp_preference_attempt_token: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
}>;

export type PreparedOrder = Readonly<{
  order: OrderRow;
  created: boolean;
  publicToken: string;
}>;

export async function prepareOrder({
  cart,
  database,
  idempotencyKey,
  tokenSecret,
}: Readonly<{
  cart: RecalculatedCart;
  database: D1Database;
  idempotencyKey: string;
  tokenSecret: string;
}>): Promise<PreparedOrder> {
  const publicToken = await derivePublicToken(tokenSecret, idempotencyKey);
  const publicTokenHash = await sha256Hex(publicToken);
  const fingerprint = await cartFingerprint(cart);
  const orderId = `ord_${randomToken(18)}`;
  const now = new Date().toISOString();

  const statements = [
    database
      .prepare(
        `INSERT OR IGNORE INTO orders (
          id, public_token_hash, checkout_idempotency_key, cart_fingerprint,
          status, currency, total_minor, item_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'preference_pending', 'ARS', ?, ?, ?, ?)`,
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
      ),
    ...cart.lines.map(({ product, quantity, subtotalMinor }) =>
      database
        .prepare(
          `INSERT INTO order_items (
            order_id, product_id, name, presentation, sku,
            quantity, unit_price_minor, subtotal_minor
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?
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
          orderId,
        ),
    ),
  ];
  await database.batch(statements);

  const order = await getOrderByIdempotencyKey(database, idempotencyKey);
  if (order === null) {
    throw new HttpError(500, 'ORDER_CREATE_FAILED', 'No se pudo registrar el pedido.', false);
  }
  if (
    order.cart_fingerprint !== fingerprint ||
    order.total_minor !== cart.totalMinor ||
    order.item_count !== cart.itemCount ||
    order.currency !== cart.currency
  ) {
    throw new HttpError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'La clave de idempotencia ya fue usada para otro carrito.',
    );
  }
  if (order.public_token_hash !== publicTokenHash) {
    throw new HttpError(500, 'ORDER_TOKEN_CONFLICT', 'No se pudo verificar el pedido.', false);
  }
  return Object.freeze({ order, created: order.id === orderId, publicToken });
}

export async function getOrderByIdempotencyKey(
  database: D1Database,
  key: string,
): Promise<OrderRow | null> {
  return database
    .prepare('SELECT * FROM orders WHERE checkout_idempotency_key = ? LIMIT 1')
    .bind(key)
    .first<OrderRow>();
}

export async function getOrderByPublicTokenHash(
  database: D1Database,
  tokenHash: string,
): Promise<OrderRow | null> {
  return database
    .prepare('SELECT * FROM orders WHERE public_token_hash = ? LIMIT 1')
    .bind(tokenHash)
    .first<OrderRow>();
}

export async function getOrderById(
  database: D1Database,
  orderId: string,
): Promise<OrderRow | null> {
  return database
    .prepare('SELECT * FROM orders WHERE id = ? LIMIT 1')
    .bind(orderId)
    .first<OrderRow>();
}

export async function claimPreferenceAttempt(
  database: D1Database,
  orderId: string,
): Promise<string | null> {
  const owner = randomToken(18);
  const now = new Date().toISOString();
  const result = await database
    .prepare(
      `UPDATE orders
       SET mp_preference_attempted_at = ?, mp_preference_attempt_token = ?,
           last_error_code = NULL, updated_at = ?
       WHERE id = ?
         AND mp_preference_id IS NULL
         AND mp_preference_attempted_at IS NULL
         AND status IN ('preference_pending', 'failed')`,
    )
    .bind(now, owner, now, orderId)
    .run();
  return (result.meta.changes ?? 0) === 1 ? owner : null;
}

export async function markPreferenceCreated(
  database: D1Database,
  orderId: string,
  preferenceId: string,
  checkoutUrl: string,
  attemptToken?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const result = await database
    .prepare(
      `UPDATE orders
       SET status = 'pending', mp_preference_id = ?, mp_checkout_url = ?,
           mp_preference_attempt_token = NULL, last_error_code = NULL,
           updated_at = ?
       WHERE id = ?
         AND mp_preference_id IS NULL
         AND status IN ('preference_pending', 'failed')
         AND (? IS NULL OR mp_preference_attempt_token = ?)` ,
    )
    .bind(
      preferenceId,
      checkoutUrl,
      now,
      orderId,
      attemptToken ?? null,
      attemptToken ?? null,
    )
    .run();
  if ((result.meta.changes ?? 0) === 1) return;
  const current = await getOrderById(database, orderId);
  if (
    current?.mp_preference_id === preferenceId &&
    current.mp_checkout_url === checkoutUrl
  ) {
    return;
  }
  throw new HttpError(
    409,
    'PREFERENCE_PERSIST_CONFLICT',
    'El pedido ya quedó asociado a otra preferencia.',
  );
}

export async function markOrderFailed(
  database: D1Database,
  orderId: string,
  attemptToken: string,
  errorCode: string,
  retrySafe: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  await database
    .prepare(
      `UPDATE orders
       SET status = 'failed', last_error_code = ?,
           mp_preference_attempted_at = CASE WHEN ? = 1 THEN NULL ELSE mp_preference_attempted_at END,
           mp_preference_attempt_token = CASE WHEN ? = 1 THEN NULL ELSE mp_preference_attempt_token END,
           updated_at = ?
       WHERE id = ?
         AND mp_preference_id IS NULL
         AND mp_preference_attempt_token = ?
         AND status IN ('preference_pending', 'failed')`,
    )
    .bind(errorCode, retrySafe ? 1 : 0, retrySafe ? 1 : 0, now, orderId, attemptToken)
    .run();
}

export async function resetRetrySafeFailedOrder(
  database: D1Database,
  orderId: string,
): Promise<void> {
  await database
    .prepare(
      `UPDATE orders
       SET status = 'preference_pending', last_error_code = NULL, updated_at = ?
       WHERE id = ?
         AND status = 'failed'
         AND mp_preference_id IS NULL
         AND mp_preference_attempted_at IS NULL
         AND mp_preference_attempt_token IS NULL`,
    )
    .bind(new Date().toISOString(), orderId)
    .run();
}

export async function updateOrderFromPayment(
  database: D1Database,
  order: OrderRow,
  payment: Readonly<{
    id: string;
    status: string;
    statusDetail: string | null;
    amountMinor: number;
    currency: string;
    externalReference: string;
    approvedAt: string | null;
    updatedAt: string | null;
  }>,
  mappedStatus: Exclude<OrderStatus, 'preference_pending' | 'failed'>,
  eventKey: string,
): Promise<void> {
  if (
    payment.externalReference !== order.id ||
    payment.currency !== order.currency ||
    payment.amountMinor !== order.total_minor
  ) {
    throw new HttpError(
      409,
      'PAYMENT_ORDER_MISMATCH',
      'El pago verificado no coincide con el pedido.',
    );
  }

  const now = new Date().toISOString();
  await database.batch([
    database
      .prepare(
        `INSERT INTO payments (
          provider_payment_id, order_id, mapped_status, provider_status,
          status_detail, amount_minor, currency, external_reference,
          approved_at, provider_updated_at, last_event_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider_payment_id) DO UPDATE SET
          mapped_status = CASE
            WHEN payments.mapped_status = 'refunded' THEN 'refunded'
            WHEN excluded.mapped_status = 'refunded' THEN 'refunded'
            WHEN payments.mapped_status = 'approved' THEN 'approved'
            WHEN excluded.mapped_status = 'approved' THEN 'approved'
            ELSE excluded.mapped_status
          END,
          provider_status = excluded.provider_status,
          status_detail = excluded.status_detail,
          approved_at = COALESCE(excluded.approved_at, payments.approved_at),
          provider_updated_at = excluded.provider_updated_at,
          last_event_key = excluded.last_event_key,
          updated_at = excluded.updated_at
        WHERE payments.order_id = excluded.order_id
          AND payments.amount_minor = excluded.amount_minor
          AND payments.currency = excluded.currency
          AND payments.external_reference = excluded.external_reference`,
      )
      .bind(
        payment.id,
        order.id,
        mappedStatus,
        payment.status,
        payment.statusDetail,
        payment.amountMinor,
        payment.currency,
        payment.externalReference,
        payment.approvedAt,
        payment.updatedAt,
        eventKey,
        now,
        now,
      ),
    database
      .prepare(
        `UPDATE orders
         SET status = CASE
           WHEN status = 'refunded' THEN 'refunded'
           WHEN ? = 'refunded' THEN 'refunded'
           WHEN status = 'approved' THEN 'approved'
           WHEN ? = 'approved' THEN 'approved'
           ELSE ?
         END,
         approved_at = CASE
           WHEN ? = 'approved' THEN COALESCE(approved_at, ?, ?)
           ELSE approved_at
         END,
         last_error_code = NULL,
         updated_at = ?
         WHERE id = ?
           AND EXISTS (
             SELECT 1
             FROM payments
             WHERE provider_payment_id = ?
               AND order_id = ?
               AND amount_minor = ?
               AND currency = ?
               AND external_reference = ?
           )`,
      )
      .bind(
        mappedStatus,
        mappedStatus,
        mappedStatus,
        mappedStatus,
        payment.approvedAt,
        now,
        now,
        order.id,
        payment.id,
        order.id,
        payment.amountMinor,
        payment.currency,
        payment.externalReference,
      ),
  ]);

  const persisted = await database
    .prepare(
      `SELECT order_id, amount_minor, currency, external_reference
       FROM payments
       WHERE provider_payment_id = ?
       LIMIT 1`,
    )
    .bind(payment.id)
    .first<Readonly<{
      order_id: string;
      amount_minor: number;
      currency: string;
      external_reference: string;
    }>>();
  if (
    persisted === null ||
    persisted.order_id !== order.id ||
    persisted.amount_minor !== payment.amountMinor ||
    persisted.currency !== payment.currency ||
    persisted.external_reference !== payment.externalReference
  ) {
    throw new HttpError(
      409,
      'PAYMENT_IDENTITY_CONFLICT',
      'El identificador del pago ya está asociado a otro pedido.',
    );
  }
}

export async function derivePublicToken(secret: string, key: string): Promise<string> {
  return hmacSha256Hex(secret, `order-public:${key}`);
}

export async function cartFingerprint(
  cart: Pick<RecalculatedCart, 'lines' | 'currency' | 'totalMinor' | 'itemCount'>,
): Promise<string> {
  const canonical = cart.lines
    .map(({ product, quantity }) => `${product.id}:${quantity}:${product.unitPriceMinor}`)
    .sort()
    .join('|');
  return sha256Hex(`${cart.currency}:${cart.totalMinor}:${cart.itemCount}:${canonical}`);
}
