import type { RecalculatedCart } from './catalog';
import { toMajorUnits } from './catalog';
import { verifyHmacSha256Hex } from './crypto';
import { HttpError } from './http';
import type { CommerceMode } from './platform';
import { isRecord } from './validation';

const MERCADO_PAGO_API = 'https://api.mercadopago.com';

export type PreferenceResult = Readonly<{ id: string; checkoutUrl: string }>;

export type MercadoPagoPayment = Readonly<{
  id: string;
  externalReference: string;
  status: string;
  statusDetail: string | null;
  amountMinor: number;
  currency: string;
  approvedAt: string | null;
  updatedAt: string | null;
}>;

export async function createMercadoPagoPreference({
  accessToken,
  cart,
  mode,
  orderId,
  publicToken,
  siteUrl,
}: Readonly<{
  accessToken: string;
  cart: RecalculatedCart;
  mode: CommerceMode;
  orderId: string;
  publicToken: string;
  siteUrl: URL;
}>): Promise<PreferenceResult> {
  const body = {
    items: cart.lines.map(({ product, quantity }) => ({
      id: product.id,
      title: product.name,
      ...(product.presentation === undefined ? {} : { description: product.presentation }),
      quantity,
      currency_id: 'ARS',
      unit_price: toMajorUnits(product.unitPriceMinor),
    })),
    external_reference: orderId,
    notification_url: new URL('/api/webhooks/mercadopago', siteUrl).toString(),
    back_urls: {
      success: withOrderToken(siteUrl, '/pago/exito', publicToken),
      pending: withOrderToken(siteUrl, '/pago/pendiente', publicToken),
      failure: withOrderToken(siteUrl, '/pago/error', publicToken),
    },
    auto_return: 'approved',
    binary_mode: false,
    metadata: { order_id: orderId },
  };
  let response: Response;
  try {
    response = await fetch(`${MERCADO_PAGO_API}/checkout/preferences`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new HttpError(
      502,
      'PAYMENT_PROVIDER_OUTCOME_UNKNOWN',
      'No se pudo confirmar si Mercado Pago creó la preferencia.',
    );
  }
  if (!response.ok) {
    if (response.status >= 500) {
      throw new HttpError(
        502,
        'PAYMENT_PROVIDER_OUTCOME_UNKNOWN',
        'No se pudo confirmar si Mercado Pago creó la preferencia.',
      );
    }
    throw new HttpError(502, 'PAYMENT_PROVIDER_REJECTED', 'Mercado Pago rechazó la preferencia.');
  }
  return parsePreferencePayload(
    await readProviderJson(response, 'PAYMENT_PROVIDER_OUTCOME_UNKNOWN'),
    mode,
    'PAYMENT_PROVIDER_OUTCOME_UNKNOWN',
  );
}

export async function recoverMercadoPagoPreference({
  accessToken,
  cart,
  mode,
  orderId,
}: Readonly<{
  accessToken: string;
  cart: RecalculatedCart;
  mode: CommerceMode;
  orderId: string;
}>): Promise<PreferenceResult | null> {
  const searchUrl = new URL(`${MERCADO_PAGO_API}/checkout/preferences/search`);
  searchUrl.searchParams.set('external_reference', orderId);
  searchUrl.searchParams.set('limit', '2');
  const response = await fetchProvider(searchUrl, accessToken, 'PREFERENCE_RECOVERY_UNAVAILABLE');
  if (!response.ok) {
    throw new HttpError(502, 'PREFERENCE_RECOVERY_UNAVAILABLE', 'No se pudo consultar la preferencia previa.');
  }
  const payload = await readProviderJson(response, 'PREFERENCE_RECOVERY_INVALID_RESPONSE');
  if (!isRecord(payload) || !Array.isArray(payload.elements)) {
    throw new HttpError(502, 'PREFERENCE_RECOVERY_INVALID_RESPONSE', 'La búsqueda de preferencias no es válida.');
  }
  const matchingIds = payload.elements.flatMap((element): readonly string[] => {
    if (!isRecord(element) || element.external_reference !== orderId) return [];
    if (typeof element.id !== 'string' && typeof element.id !== 'number') return [];
    return [String(element.id)];
  });
  if (matchingIds.length === 0) return null;
  if (matchingIds.length !== 1) {
    throw new HttpError(409, 'PREFERENCE_RECOVERY_AMBIGUOUS', 'Existe más de una preferencia para el pedido.');
  }
  const preferenceId = matchingIds[0];
  if (preferenceId === undefined || !/^[A-Za-z0-9_-]{1,128}$/u.test(preferenceId)) {
    throw new HttpError(502, 'PREFERENCE_RECOVERY_INVALID_RESPONSE', 'La preferencia previa no es válida.');
  }
  const detailResponse = await fetchProvider(
    `${MERCADO_PAGO_API}/checkout/preferences/${encodeURIComponent(preferenceId)}`,
    accessToken,
    'PREFERENCE_RECOVERY_UNAVAILABLE',
  );
  if (!detailResponse.ok) {
    throw new HttpError(502, 'PREFERENCE_RECOVERY_UNAVAILABLE', 'No se pudo recuperar la preferencia previa.');
  }
  const detail = await readProviderJson(detailResponse, 'PREFERENCE_RECOVERY_INVALID_RESPONSE');
  if (!isRecord(detail) || detail.external_reference !== orderId) {
    throw new HttpError(409, 'PREFERENCE_RECOVERY_MISMATCH', 'La preferencia no corresponde al pedido.');
  }
  assertPreferenceMatchesCart(detail, cart);
  const recovered = parsePreferencePayload(detail, mode, 'PREFERENCE_RECOVERY_INVALID_RESPONSE');
  if (recovered.id !== preferenceId) {
    throw new HttpError(409, 'PREFERENCE_RECOVERY_MISMATCH', 'La preferencia recuperada no coincide con la solicitada.');
  }
  return recovered;
}

export async function getMercadoPagoPayment(
  paymentId: string,
  accessToken: string,
): Promise<MercadoPagoPayment> {
  if (!/^\d{1,30}$/u.test(paymentId)) {
    throw new HttpError(400, 'INVALID_PAYMENT_ID', 'El pago recibido no es válido.');
  }
  const response = await fetchProvider(
    `${MERCADO_PAGO_API}/v1/payments/${encodeURIComponent(paymentId)}`,
    accessToken,
    'PAYMENT_LOOKUP_FAILED',
  );
  if (!response.ok) {
    throw new HttpError(502, 'PAYMENT_LOOKUP_FAILED', 'No se pudo verificar el pago.');
  }
  const payload = await readProviderJson(response, 'PAYMENT_PROVIDER_INVALID_RESPONSE');
  if (
    !isRecord(payload) ||
    (typeof payload.id !== 'string' && typeof payload.id !== 'number') ||
    typeof payload.external_reference !== 'string' ||
    typeof payload.status !== 'string' ||
    typeof payload.transaction_amount !== 'number' ||
    typeof payload.currency_id !== 'string'
  ) {
    throw new HttpError(502, 'PAYMENT_PROVIDER_INVALID_RESPONSE', 'Mercado Pago devolvió un pago incompleto.');
  }
  const returnedId = String(payload.id);
  if (!/^\d{1,30}$/u.test(returnedId) || returnedId !== paymentId) {
    throw new HttpError(502, 'PAYMENT_PROVIDER_INVALID_RESPONSE', 'Mercado Pago devolvió un pago diferente al solicitado.');
  }
  const scaled = payload.transaction_amount * 100;
  const amountMinor = Math.round(scaled);
  if (
    !Number.isFinite(scaled) ||
    Math.abs(scaled - amountMinor) > 0.000001 ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0
  ) {
    throw new HttpError(502, 'PAYMENT_PROVIDER_INVALID_RESPONSE', 'Mercado Pago devolvió un importe inválido.');
  }
  return Object.freeze({
    id: returnedId,
    externalReference: payload.external_reference,
    status: payload.status,
    statusDetail: typeof payload.status_detail === 'string' ? payload.status_detail : null,
    amountMinor,
    currency: payload.currency_id,
    approvedAt: typeof payload.date_approved === 'string' ? payload.date_approved : null,
    updatedAt: typeof payload.date_last_updated === 'string' ? payload.date_last_updated : null,
  });
}

export async function verifyMercadoPagoWebhook({
  dataId,
  requestId,
  secret,
  signatureHeader,
}: Readonly<{
  dataId: string | null;
  requestId: string | null;
  secret: string;
  signatureHeader: string | null;
}>): Promise<Readonly<{ timestamp: string; digest: string }>> {
  if (signatureHeader === null || signatureHeader.length > 512) {
    throw new HttpError(401, 'WEBHOOK_SIGNATURE_MISSING', 'Falta la firma del webhook.');
  }
  const parts = new Map<string, string>();
  for (const segment of signatureHeader.split(',')) {
    const separator = segment.indexOf('=');
    if (separator <= 0) continue;
    parts.set(segment.slice(0, separator).trim(), segment.slice(separator + 1).trim());
  }
  const timestamp = parts.get('ts');
  const digest = parts.get('v1');
  if (
    timestamp === undefined ||
    digest === undefined ||
    !/^\d{1,20}$/u.test(timestamp) ||
    !/^[a-f0-9]{64}$/iu.test(digest)
  ) {
    throw new HttpError(401, 'WEBHOOK_SIGNATURE_INVALID', 'La firma del webhook es inválida.');
  }
  const normalizedDataId =
    dataId === null
      ? null
      : /^[A-Za-z0-9]+$/u.test(dataId)
        ? dataId.toLocaleLowerCase('en')
        : dataId;
  const manifest = [
    normalizedDataId === null ? '' : `id:${normalizedDataId};`,
    requestId === null ? '' : `request-id:${requestId};`,
    `ts:${timestamp};`,
  ].join('');
  const valid = await verifyHmacSha256Hex(secret, manifest, digest);
  if (!valid) {
    throw new HttpError(401, 'WEBHOOK_SIGNATURE_INVALID', 'La firma del webhook no coincide.');
  }
  return Object.freeze({ timestamp, digest: digest.toLocaleLowerCase('en') });
}

export function mapPaymentStatus(
  status: string,
): 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded' {
  switch (status) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    case 'refunded':
    case 'charged_back':
      return 'refunded';
    default:
      return 'pending';
  }
}

async function fetchProvider(
  input: string | URL,
  accessToken: string,
  code: string,
): Promise<Response> {
  try {
    return await fetch(input, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new HttpError(502, code, 'No se pudo consultar Mercado Pago.');
  }
}

async function readProviderJson(response: Response, code: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new HttpError(502, code, 'Mercado Pago devolvió una respuesta no válida.');
  }
}

function assertPreferenceMatchesCart(
  payload: Record<string, unknown>,
  cart: RecalculatedCart,
): void {
  if (!Array.isArray(payload.items) || payload.items.length !== cart.lines.length) {
    throw new HttpError(409, 'PREFERENCE_RECOVERY_MISMATCH', 'La preferencia previa no coincide con el carrito.');
  }
  const expected = new Map(
    cart.lines.map(({ product, quantity }) => [
      product.id,
      `${quantity}:${product.unitPriceMinor}`,
    ]),
  );
  let recoveredTotal = 0;
  for (const rawItem of payload.items) {
    if (
      !isRecord(rawItem) ||
      typeof rawItem.id !== 'string' ||
      typeof rawItem.quantity !== 'number' ||
      !Number.isSafeInteger(rawItem.quantity) ||
      typeof rawItem.unit_price !== 'number' ||
      rawItem.currency_id !== 'ARS'
    ) {
      throw new HttpError(502, 'PREFERENCE_RECOVERY_INVALID_RESPONSE', 'La preferencia previa contiene ítems inválidos.');
    }
    const unitPriceMinor = Math.round(rawItem.unit_price * 100);
    if (
      !Number.isSafeInteger(unitPriceMinor) ||
      Math.abs(rawItem.unit_price * 100 - unitPriceMinor) > 0.000001 ||
      expected.get(rawItem.id) !== `${rawItem.quantity}:${unitPriceMinor}`
    ) {
      throw new HttpError(409, 'PREFERENCE_RECOVERY_MISMATCH', 'La preferencia previa no coincide con el carrito.');
    }
    expected.delete(rawItem.id);
    recoveredTotal += unitPriceMinor * rawItem.quantity;
  }
  if (expected.size !== 0 || recoveredTotal !== cart.totalMinor) {
    throw new HttpError(409, 'PREFERENCE_RECOVERY_MISMATCH', 'La preferencia previa no coincide con el carrito.');
  }
}

function parsePreferencePayload(
  payload: unknown,
  mode: CommerceMode,
  errorCode: string,
): PreferenceResult {
  if (!isRecord(payload) || (typeof payload.id !== 'string' && typeof payload.id !== 'number')) {
    throw new HttpError(502, errorCode, 'Mercado Pago devolvió una preferencia incompleta.');
  }
  const preferenceId = String(payload.id);
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(preferenceId)) {
    throw new HttpError(502, errorCode, 'Mercado Pago devolvió un identificador de preferencia inválido.');
  }
  const candidate = mode === 'sandbox' ? payload.sandbox_init_point : payload.init_point;
  if (typeof candidate !== 'string') {
    throw new HttpError(502, errorCode, 'Mercado Pago no devolvió una URL de checkout.');
  }
  let checkoutUrl: URL;
  try {
    checkoutUrl = new URL(candidate);
  } catch {
    throw new HttpError(502, errorCode, 'Mercado Pago devolvió una URL inválida.');
  }
  if (checkoutUrl.protocol !== 'https:' || !isMercadoPagoHost(checkoutUrl.hostname)) {
    throw new HttpError(502, errorCode, 'Mercado Pago devolvió una URL no autorizada.');
  }
  return Object.freeze({ id: preferenceId, checkoutUrl: checkoutUrl.toString() });
}

function withOrderToken(siteUrl: URL, path: string, token: string): string {
  const url = new URL(path, siteUrl);
  url.searchParams.set('order', token);
  return url.toString();
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
