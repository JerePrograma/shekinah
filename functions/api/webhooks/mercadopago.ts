import { sha256Hex } from '../../../server/crypto';
import {
  HttpError,
  methodNotAllowedResponse,
  noContentResponse,
  requireDatabase,
  requireSecret,
  responseFromError,
} from '../../../server/http';
import {
  getMercadoPagoPayment,
  mapPaymentStatus,
  verifyMercadoPagoWebhook,
} from '../../../server/mercado-pago';
import { getOrderById, updateOrderFromPayment } from '../../../server/orders';
import { finishPaymentEvent, registerPaymentEvent } from '../../../server/payment-events';
import type { D1Database, PagesFunction } from '../../../server/platform';
import { isRecord } from '../../../server/validation';

export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  let database: D1Database | undefined;
  let eventKey: string | null = null;
  let eventOwner: string | null = null;
  try {
    database = requireDatabase(env);
    const accessToken = requireSecret(
      env.MERCADO_PAGO_ACCESS_TOKEN,
      'PAYMENT_CREDENTIALS_MISSING',
      'Mercado Pago no está configurado.',
      20,
    );
    const webhookSecret = requireSecret(
      env.MERCADO_PAGO_WEBHOOK_SECRET,
      'WEBHOOK_SECRET_MISSING',
      'La firma de webhooks no está configurada.',
      32,
    );
    const url = new URL(request.url);
    const queryDataId = url.searchParams.get('data.id');
    const rawRequestId = request.headers.get('x-request-id');
    const requestId =
      rawRequestId !== null && /^[A-Za-z0-9._:-]{1,128}$/u.test(rawRequestId)
        ? rawRequestId
        : null;
    const verification = await verifyMercadoPagoWebhook({
      dataId: queryDataId,
      requestId,
      secret: webhookSecret,
      signatureHeader: request.headers.get('x-signature'),
    });
    const payload = await readWebhookBody(request);
    const bodyDataId = readNestedDataId(payload);
    if (queryDataId === null || !/^\d{1,30}$/u.test(queryDataId)) {
      throw new HttpError(400, 'INVALID_PAYMENT_ID', 'El webhook no contiene un pago firmado.');
    }
    if (bodyDataId !== null && bodyDataId !== queryDataId) {
      throw new HttpError(400, 'PAYMENT_ID_MISMATCH', 'El pago no coincide con el valor firmado.');
    }
    const eventType =
      readOptionalEventLabel(payload.type, 'type') ??
      readOptionalEventLabel(url.searchParams.get('type'), 'type') ??
      'unknown';
    const action = readOptionalEventLabel(payload.action, 'action');
    const notificationId = readOptionalIdentifier(payload.id, 'id');
    eventKey = await sha256Hex(
      [notificationId ?? requestId ?? verification.timestamp, eventType, action ?? '', queryDataId].join('|'),
    );
    const registration = await registerPaymentEvent({
      action,
      database,
      eventKey,
      eventType,
      requestId,
      resourceId: queryDataId,
      signatureTimestamp: verification.timestamp,
    });
    if (!registration.claimed || registration.owner === null) return noContentResponse(200);
    eventOwner = registration.owner;

    if (eventType !== 'payment' && !(action?.startsWith('payment.') ?? false)) {
      await finishPaymentEvent(database, eventKey, eventOwner, {
        status: 'ignored',
        responseCode: 200,
        errorCode: 'UNSUPPORTED_EVENT_TYPE',
      });
      return noContentResponse(200);
    }
    const payment = await getMercadoPagoPayment(queryDataId, accessToken);
    const order = await getOrderById(database, payment.externalReference);
    if (order === null) {
      await finishPaymentEvent(database, eventKey, eventOwner, {
        status: 'ignored',
        responseCode: 200,
        errorCode: 'ORDER_NOT_FOUND',
      });
      return noContentResponse(200);
    }
    if (payment.externalReference !== order.id) {
      throw new HttpError(409, 'PAYMENT_REFERENCE_MISMATCH', 'La referencia del pago no coincide.');
    }
    if (payment.currency !== order.currency || payment.amountMinor !== order.total_minor) {
      await finishPaymentEvent(database, eventKey, eventOwner, {
        status: 'ignored',
        responseCode: 200,
        errorCode: 'PAYMENT_AMOUNT_MISMATCH',
      });
      return noContentResponse(200);
    }
    await updateOrderFromPayment(
      database,
      order,
      payment,
      mapPaymentStatus(payment.status),
      eventKey,
    );
    await finishPaymentEvent(database, eventKey, eventOwner, {
      status: 'processed',
      responseCode: 200,
    });
    return noContentResponse(200);
  } catch (error: unknown) {
    if (database !== undefined && eventKey !== null && eventOwner !== null) {
      try {
        await finishPaymentEvent(database, eventKey, eventOwner, {
          status: 'failed',
          responseCode: error instanceof HttpError ? error.status : 500,
          errorCode: error instanceof HttpError ? error.code : 'INTERNAL_ERROR',
        });
      } catch {
        // El error original conserva prioridad y el proveedor podrá reintentar.
      }
    }
    return responseFromError(error);
  }
};

async function readWebhookBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'El webhook requiere Content-Type application/json.');
  }
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const declaredBytes = Number(declared);
    if (!Number.isFinite(declaredBytes) || declaredBytes < 0) {
      throw new HttpError(400, 'INVALID_CONTENT_LENGTH', 'El tamaño declarado no es válido.');
    }
    if (declaredBytes > 64_000) {
      throw new HttpError(413, 'BODY_TOO_LARGE', 'El webhook excede el límite permitido.');
    }
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 64_000) {
    throw new HttpError(413, 'BODY_TOO_LARGE', 'El webhook excede el límite permitido.');
  }
  if (raw.trim() === '') return {};
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : {};
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'El webhook no contiene JSON válido.');
  }
}

function readNestedDataId(payload: Record<string, unknown>): string | null {
  if (!isRecord(payload.data)) return null;
  const value = payload.data.id;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

function readOptionalEventLabel(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'INVALID_WEBHOOK_FIELD', `El campo ${field} del webhook no es válido.`);
  }
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(normalized)) {
    throw new HttpError(400, 'INVALID_WEBHOOK_FIELD', `El campo ${field} del webhook no es válido.`);
  }
  return normalized;
}

function readOptionalIdentifier(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  const normalized =
    typeof value === 'number' && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === 'string'
        ? value.trim()
        : '';
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(normalized)) {
    throw new HttpError(400, 'INVALID_WEBHOOK_FIELD', `El campo ${field} del webhook no es válido.`);
  }
  return normalized;
}
