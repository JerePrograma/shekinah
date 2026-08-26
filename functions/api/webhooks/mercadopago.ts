import { sha256Hex } from '../../../server/crypto';
import {
  requireCommerceMode,
  requireMercadoPagoAccessToken,
} from '../../../server/config';
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
  mercadoPagoPaymentContextError,
  verifyMercadoPagoWebhook,
} from '../../../server/mercado-pago';
import { getOrderById, updateOrderFromPayment } from '../../../server/orders';
import {
  hasMercadoLibreInventoryReservation,
  markRefundForInventoryReview,
} from '../../../server/mercado-libre-inventory';
import { finishPaymentEvent, registerPaymentEvent } from '../../../server/payment-events';
import type { D1Database, PagesFunction } from '../../../server/platform';
import { isRecord, readJsonBody } from '../../../server/validation';

export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  let database: D1Database | undefined;
  let eventKey: string | null = null;
  let eventOwner: string | null = null;
  try {
    database = requireDatabase(env);
    const mode = requireCommerceMode(env);
    const accessToken = requireMercadoPagoAccessToken(env, mode);
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
    const notificationLiveMode = readRequiredLiveMode(payload.live_mode);
    const notificationUserId = readRequiredUserId(payload.user_id);
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
    const contextError = mercadoPagoPaymentContextError(payment, {
      mode,
      orderId: order.id,
      notificationLiveMode,
      notificationUserId,
    });
    if (contextError !== null) {
      await finishPaymentEvent(database, eventKey, eventOwner, {
        status: 'ignored',
        responseCode: 200,
        errorCode: contextError,
      });
      return noContentResponse(200);
    }
    const mappedStatus = mapPaymentStatus(payment.status);
    await updateOrderFromPayment(
      database,
      order,
      payment,
      mappedStatus,
      eventKey,
    );
    if (
      mappedStatus === 'refunded' &&
      await hasMercadoLibreInventoryReservation(database, order.id)
    ) {
      await markRefundForInventoryReview(database, order.id);
    }
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
  const value = await readJsonBody(request, 64_000);
  if (!isRecord(value)) {
    throw new HttpError(400, 'INVALID_WEBHOOK_BODY', 'El webhook no contiene un objeto JSON válido.');
  }
  return value;
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

function readRequiredLiveMode(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new HttpError(400, 'INVALID_WEBHOOK_FIELD', 'El campo live_mode del webhook no es válido.');
  }
  return value;
}

function readRequiredUserId(value: unknown): string {
  const userId = readOptionalIdentifier(value, 'user_id');
  if (userId === null || !/^\d{1,30}$/u.test(userId)) {
    throw new HttpError(400, 'INVALID_WEBHOOK_FIELD', 'El campo user_id del webhook no es válido.');
  }
  return userId;
}
