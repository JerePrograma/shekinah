import type { CartItem } from '../cart/model';
import type { CheckoutFulfillment } from './fulfillment';
import type { WebRequestIdentity, WebRequestReceipt } from './web-order-contracts';
import { parseWebRequestReceipt } from './web-order-contracts';

export type WebRequestCheckout = Readonly<{ checkoutUrl: string; totalMinor: number }>;

export async function submitWebRequest(identity: WebRequestIdentity, items: readonly CartItem[], fulfillment: CheckoutFulfillment): Promise<WebRequestReceipt> {
  return post({ mode: 'create', ...identity, fulfillment,
    items: items.map(({ product, quantity }) => ({ productId: product.id, quantity, catalogVersion: product.commerce?.catalogVersion })),
  });
}

export function recoverWebRequest(identity: WebRequestIdentity): Promise<WebRequestReceipt> {
  return post({ mode: 'recover', ...identity });
}

export async function readWebRequest(publicToken: string): Promise<WebRequestReceipt> {
  if (!/^[a-f0-9]{64}$/u.test(publicToken)) throw new Error('La referencia protegida no es válida.');
  const response = await fetch(`/api/orders/${publicToken}/request-status`, { credentials: 'same-origin', redirect: 'error' });
  const value = await readResponse(response);
  if (!isRecord(value)) throw new Error('La respuesta no es válida.');
  return parseWebRequestReceipt({ ...value, publicToken });
}

export async function startWebRequestCheckout(publicToken: string, expectedTotalMinor: number): Promise<WebRequestCheckout> {
  if (!/^[a-f0-9]{64}$/u.test(publicToken) || !Number.isSafeInteger(expectedTotalMinor) || expectedTotalMinor <= 0) {
    throw new Error('La solicitud no está lista para iniciar el pago.');
  }
  const response = await fetch(`/api/orders/${publicToken}/checkout`, {
    method: 'POST', credentials: 'same-origin', redirect: 'error',
  });
  const value = await readResponse(response);
  if (!isRecord(value) || typeof value.checkoutUrl !== 'string' || value.totalMinor !== expectedTotalMinor) {
    throw new Error('El servidor devolvió una respuesta de pago inválida.');
  }
  let checkoutUrl: URL;
  try { checkoutUrl = new URL(value.checkoutUrl); }
  catch { throw new Error('El servidor devolvió una URL de pago inválida.'); }
  if (checkoutUrl.protocol !== 'https:' || !isMercadoPagoHost(checkoutUrl.hostname)) {
    throw new Error('El servidor devolvió una URL de pago no autorizada.');
  }
  return Object.freeze({ checkoutUrl: checkoutUrl.toString(), totalMinor: expectedTotalMinor });
}

async function post(body: unknown): Promise<WebRequestReceipt> {
  const response = await fetch('/api/orders/request', { method: 'POST', credentials: 'same-origin', redirect: 'error',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return parseWebRequestReceipt(await readResponse(response));
}

async function readResponse(response: Response): Promise<unknown> {
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new Error('No se pudo confirmar la respuesta. Conservamos el mismo intento para recuperar su estado.'); }
  if (!response.ok) {
    if (isRecord(value) && isRecord(value.error) && typeof value.error.message === 'string' && value.error.message.trim() !== '') {
      throw new Error(value.error.message);
    }
    if (response.status === 404) throw new Error('La solicitud todavía no pudo localizarse. Consultá otra vez o reenviá el mismo intento; no se creará una clave nueva.');
    throw new Error('No se pudo completar la operación. Conservamos el intento; revisá los datos y consultá su estado antes de volver a enviarlo.');
  }
  return value;
}

function isMercadoPagoHost(hostname: string): boolean {
  const normalized = hostname.toLocaleLowerCase('en');
  return normalized === 'mercadopago.com' || normalized.endsWith('.mercadopago.com') ||
    normalized === 'mercadopago.com.ar' || normalized.endsWith('.mercadopago.com.ar');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
