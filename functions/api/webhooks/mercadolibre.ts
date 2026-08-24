import { listCatalogProductDetails } from '../../../server/catalog-store';
import { sha256Hex } from '../../../server/crypto';
import {
  getMercadoLibreAccess,
  getMercadoLibreConnectionStatus,
  mercadoLibreApiJson,
} from '../../../server/mercado-libre';
import { syncMercadoLibreCatalog } from '../../../server/mercado-libre-catalog';
import {
  HttpError,
  methodNotAllowedResponse,
  noContentResponse,
  requireDatabase,
  responseFromError,
} from '../../../server/http';
import type { D1Database, Env, PagesFunction } from '../../../server/platform';
import { isRecord, readJsonBody } from '../../../server/validation';

export const onRequest: PagesFunction = async ({ env, request, waitUntil }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  try {
    const database = requireDatabase(env);
    const payload = await readJsonBody(request, 64_000);
    const notification = parseNotification(payload);
    const connection = await getMercadoLibreConnectionStatus(database);
    if (!connection.connected || notification.sellerId !== connection.sellerId) {
      return noContentResponse(200);
    }
    const expectedApplicationId = env.MERCADO_LIBRE_APPLICATION_ID?.trim() ?? '';
    if (!/^\d{1,30}$/u.test(expectedApplicationId)) {
      throw new HttpError(503, 'MERCADO_LIBRE_APPLICATION_ID_MISSING', 'La aplicación de Mercado Libre no está configurada.');
    }
    if (notification.applicationId !== expectedApplicationId) {
      return noContentResponse(200);
    }
    const eventKey = await sha256Hex([
      notification.applicationId,
      notification.sellerId,
      notification.topic,
      notification.resource,
      notification.sent,
    ].join('|'));
    const now = new Date().toISOString();
    const inserted = await database
      .prepare(
        `INSERT INTO mercadolibre_notifications (
          event_key, topic, resource, seller_id, application_id, status,
          attempt_count, received_at
        ) VALUES (?, ?, ?, ?, ?, 'processing', 1, ?)
        ON CONFLICT(event_key) DO UPDATE SET
          status = 'processing', attempt_count = attempt_count + 1,
          error_code = NULL, processed_at = NULL
        WHERE mercadolibre_notifications.status = 'failed'
        RETURNING event_key`,
      )
      .bind(
        eventKey, notification.topic, notification.resource,
        notification.sellerId, notification.applicationId, now,
      )
      .first<Readonly<{ event_key: string }>>();
    if (inserted === null) return noContentResponse(200);
    waitUntil(processNotification(database, env, eventKey, notification));
    return noContentResponse(200);
  } catch (error: unknown) {
    return responseFromError(error);
  }
};

type Notification = Readonly<{
  applicationId: string;
  sellerId: string;
  topic: string;
  resource: string;
  sent: string;
}>;

async function processNotification(
  database: D1Database,
  env: Env,
  eventKey: string,
  notification: Notification,
): Promise<void> {
  try {
    const itemIds = await notificationItemIds(database, env, notification);
    if (itemIds.length === 0) {
      await finishNotification(database, eventKey, 'ignored', 'UNSUPPORTED_NOTIFICATION');
      return;
    }
    await syncMercadoLibreCatalog(database, env, `notification:${eventKey.slice(0, 12)}`, {
      kind: 'notification',
      itemIds,
      localProducts: await listCatalogProductDetails(database),
    });
    await finishNotification(database, eventKey, 'processed', null);
  } catch (error: unknown) {
    await finishNotification(
      database,
      eventKey,
      'failed',
      error instanceof HttpError ? error.code : 'MERCADO_LIBRE_NOTIFICATION_FAILED',
    );
  }
}

async function notificationItemIds(
  database: D1Database,
  env: Env,
  notification: Notification,
): Promise<readonly string[]> {
  const itemMatch = /^\/items\/(MLA\d{5,30})$/u.exec(notification.resource);
  if (notification.topic === 'items' && itemMatch?.[1] !== undefined) {
    return Object.freeze([itemMatch[1]]);
  }
  const orderMatch = /^\/orders\/(\d{1,30})$/u.exec(notification.resource);
  if (notification.topic !== 'orders_v2' || orderMatch?.[1] === undefined) return [];
  const { accessToken } = await getMercadoLibreAccess(database, env);
  const response = await mercadoLibreApiJson(`/orders/${orderMatch[1]}`, accessToken);
  if (!isRecord(response.body) || !Array.isArray(response.body.order_items)) {
    throw new HttpError(502, 'MERCADO_LIBRE_RESPONSE_INVALID', 'Mercado Libre devolvió una respuesta no válida.');
  }
  const ids = response.body.order_items.flatMap((candidate): readonly string[] => {
    if (!isRecord(candidate) || !isRecord(candidate.item)) return [];
    const id = candidate.item.id;
    return typeof id === 'string' && /^MLA\d{5,30}$/u.test(id) ? [id] : [];
  });
  return Object.freeze([...new Set(ids)]);
}

async function finishNotification(
  database: D1Database,
  eventKey: string,
  status: 'processed' | 'ignored' | 'failed',
  errorCode: string | null,
): Promise<void> {
  await database
    .prepare(
      `UPDATE mercadolibre_notifications
       SET status = ?, error_code = ?, processed_at = ? WHERE event_key = ?`,
    )
    .bind(status, errorCode, new Date().toISOString(), eventKey)
    .run();
}

function parseNotification(value: unknown): Notification {
  if (!isRecord(value)) throw invalidNotification();
  const applicationId = identifier(value.application_id);
  const sellerId = identifier(value.user_id);
  const topic = safeLabel(value.topic);
  const resource = typeof value.resource === 'string' ? value.resource.trim() : '';
  const sent = typeof value.sent === 'string' && !Number.isNaN(Date.parse(value.sent))
    ? new Date(value.sent).toISOString()
    : '';
  if (
    applicationId === null || sellerId === null || topic === null ||
    !/^\/(?:items\/MLA\d{5,30}|orders\/\d{1,30})$/u.test(resource) || sent === ''
  ) throw invalidNotification();
  return Object.freeze({ applicationId, sellerId, topic, resource, sent });
}

function identifier(value: unknown): string | null {
  const text = typeof value === 'number' && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === 'string'
      ? value.trim()
      : '';
  return /^\d{1,30}$/u.test(text) ? text : null;
}

function safeLabel(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z0-9_]{1,40}$/u.test(value) ? value : null;
}

function invalidNotification(): HttpError {
  return new HttpError(400, 'MERCADO_LIBRE_NOTIFICATION_INVALID', 'La notificación no es válida.');
}
