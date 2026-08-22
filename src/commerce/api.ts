import type { CartItem } from '../cart/model';
import type {
  CheckoutResponse,
  PublicOrderStatusResponse,
  WhatsappOrderItem,
  WhatsappOrderRequest,
  WhatsappOrderResponse,
} from './contracts';
import { MAX_CART_LINES, MAX_CART_QUANTITY } from './contracts';
import type { CheckoutFulfillment } from './fulfillment';

export async function createCheckoutPreference(
  items: readonly CartItem[],
  idempotencyKey: string,
  fulfillment: CheckoutFulfillment,
): Promise<CheckoutResponse> {
  const response = await fetch('/api/checkout/preferences', {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey,
      items: items.map(({ product, quantity }) => ({
        productId: product.id,
        quantity,
      })),
      fulfillment,
    }),
  });
  const payload = await readJson(response);
  if (!response.ok) throw apiError(payload, 'No se pudo iniciar el pago.');
  if (
    !isRecord(payload) ||
    typeof payload.checkoutUrl !== 'string' ||
    typeof payload.publicToken !== 'string' ||
    !/^[a-f0-9]{64}$/iu.test(payload.publicToken)
  ) {
    throw new Error('El servidor devolvió una respuesta de checkout inválida.');
  }
  let checkoutUrl: URL;
  try {
    checkoutUrl = new URL(payload.checkoutUrl);
  } catch {
    throw new Error('El servidor devolvió una URL de pago inválida.');
  }
  if (checkoutUrl.protocol !== 'https:' || !isMercadoPagoHost(checkoutUrl.hostname)) {
    throw new Error('El servidor devolvió una URL de pago no autorizada.');
  }
  return Object.freeze({
    checkoutUrl: checkoutUrl.toString(),
    publicToken: payload.publicToken.toLocaleLowerCase('en'),
  });
}

export async function createWhatsappOrder(
  items: readonly CartItem[],
  idempotencyKey: string,
  fulfillment: CheckoutFulfillment,
): Promise<WhatsappOrderResponse> {
  const request: WhatsappOrderRequest = Object.freeze({
    idempotencyKey,
    items: Object.freeze(items.map(({ product, quantity }) => Object.freeze({
      productId: product.id,
      quantity,
    }))),
    fulfillment,
  });
  const response = await fetch('/api/orders/whatsapp', {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response);
  if (response.status !== 200 && response.status !== 201) {
    throw apiError(
      payload,
      'No pudimos registrar el pedido. Revisá el carrito e intentá nuevamente.',
    );
  }
  return parseWhatsappOrderResponse(payload);
}

export async function getPublicOrderStatus(
  publicToken: string,
  signal?: AbortSignal,
): Promise<PublicOrderStatusResponse> {
  if (!/^[a-f0-9]{64}$/iu.test(publicToken)) {
    throw new Error('El identificador del pedido no es válido.');
  }
  const requestInit: RequestInit = {
    credentials: 'same-origin',
    ...(signal === undefined ? {} : { signal }),
  };
  const response = await fetch(
    `/api/orders/${encodeURIComponent(publicToken)}/status`,
    requestInit,
  );
  const payload = await readJson(response);
  if (!response.ok) throw apiError(payload, 'No se pudo consultar el pedido.');
  if (
    !isRecord(payload) ||
    ![
      'preference_pending',
      'pending',
      'approved',
      'rejected',
      'cancelled',
      'refunded',
      'failed',
    ].includes(String(payload.status)) ||
    payload.currency !== 'ARS' ||
    typeof payload.totalMinor !== 'number' ||
    !Number.isSafeInteger(payload.totalMinor) ||
    payload.totalMinor <= 0 ||
    typeof payload.itemCount !== 'number' ||
    !Number.isSafeInteger(payload.itemCount) ||
    payload.itemCount <= 0 ||
    typeof payload.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(payload.updatedAt))
  ) {
    throw new Error('El servidor devolvió un estado de pedido inválido.');
  }
  return payload as unknown as PublicOrderStatusResponse;
}

export async function deleteAnalyticsSessionRemote(sessionId: string): Promise<void> {
  const response = await fetch('/api/privacy/delete-session', {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  const payload = await readJson(response);
  if (!response.ok) throw apiError(payload, 'No se pudo confirmar la eliminación remota.');
  if (!isRecord(payload) || payload.deleted !== true) {
    throw new Error('El servidor no confirmó la eliminación remota.');
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiError(payload: unknown, fallback: string): Error {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.message === 'string' &&
    payload.error.message.trim() !== ''
  ) {
    return new Error(payload.error.message);
  }
  return new Error(fallback);
}

function parseWhatsappOrderResponse(value: unknown): WhatsappOrderResponse {
  if (
    !isRecord(value) ||
    typeof value.orderId !== 'string' ||
    !/^ord_[A-Za-z0-9_-]{20,128}$/u.test(value.orderId) ||
    value.status !== 'pending' ||
    value.currency !== 'ARS' ||
    !isPositiveSafeInteger(value.totalMinor) ||
    !isPositiveSafeInteger(value.itemCount) ||
    typeof value.createdAt !== 'string' ||
    Number.isNaN(Date.parse(value.createdAt)) ||
    !Array.isArray(value.items) ||
    value.items.length === 0 ||
    value.items.length > MAX_CART_LINES
  ) {
    throw new Error('El servidor devolvió un pedido de WhatsApp inválido.');
  }

  const productIds = new Set<string>();
  const items = value.items.map((candidate): WhatsappOrderItem => {
    if (
      !isRecord(candidate) ||
      typeof candidate.productId !== 'string' ||
      !/^[a-z0-9][a-z0-9-]{0,179}$/u.test(candidate.productId) ||
      productIds.has(candidate.productId) ||
      typeof candidate.name !== 'string' ||
      candidate.name.trim() === '' ||
      (
        candidate.presentation !== undefined &&
        (typeof candidate.presentation !== 'string' || candidate.presentation.trim() === '')
      ) ||
      !isPositiveSafeInteger(candidate.quantity) ||
      candidate.quantity > MAX_CART_QUANTITY ||
      !isPositiveSafeInteger(candidate.unitPriceMinor) ||
      !isPositiveSafeInteger(candidate.subtotalMinor) ||
      candidate.subtotalMinor !== candidate.unitPriceMinor * candidate.quantity
    ) {
      throw new Error('El servidor devolvió un pedido de WhatsApp inválido.');
    }
    productIds.add(candidate.productId);
    return Object.freeze({
      productId: candidate.productId,
      name: candidate.name.trim(),
      ...(candidate.presentation === undefined
        ? {}
        : { presentation: candidate.presentation.trim() }),
      quantity: candidate.quantity,
      unitPriceMinor: candidate.unitPriceMinor,
      subtotalMinor: candidate.subtotalMinor,
    });
  });
  if (
    items.reduce((total, item) => total + item.quantity, 0) !== value.itemCount ||
    items.reduce((total, item) => total + item.subtotalMinor, 0) > value.totalMinor
  ) {
    throw new Error('El servidor devolvió un pedido de WhatsApp inválido.');
  }

  return Object.freeze({
    orderId: value.orderId,
    status: value.status,
    currency: value.currency,
    totalMinor: value.totalMinor,
    itemCount: value.itemCount,
    createdAt: value.createdAt,
    items: Object.freeze(items),
  });
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMercadoPagoHost(hostname: string): boolean {
  const normalized = hostname.toLocaleLowerCase('en');
  return (
    normalized === 'mercadopago.com' ||
    normalized.endsWith('.mercadopago.com') ||
    normalized === 'mercadopago.com.ar' ||
    normalized.endsWith('.mercadopago.com.ar')
  );
}
