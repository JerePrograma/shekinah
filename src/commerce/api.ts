import type { CartItem } from '../cart/model';
import type {
  CheckoutResponse,
  PublicOrderStatusResponse,
} from './contracts';

export async function createCheckoutPreference(
  items: readonly CartItem[],
  idempotencyKey: string,
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
