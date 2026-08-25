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

const USER_PRODUCT_SEARCH_PAGE_SIZE = 50;
const MAX_USER_PRODUCT_SEARCH_PAGES = 20;

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
  const stockLocationMatch = /^\/user-products\/(MLAU\d{5,30})\/stock$/u.exec(notification.resource);
  if (notification.topic === 'stock-location' && stockLocationMatch?.[1] !== undefined) {
    return itemIdsForUserProduct(database, env, notification.sellerId, stockLocationMatch[1]);
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

async function itemIdsForUserProduct(
  database: D1Database,
  env: Env,
  sellerId: string,
  userProductId: string,
): Promise<readonly string[]> {
  const { accessToken } = await getMercadoLibreAccess(database, env);
  const ids: string[] = [];
  const seen = new Set<string>();
  let offset = 0;
  for (let page = 0; page < MAX_USER_PRODUCT_SEARCH_PAGES; page += 1) {
    const url = new URL(`/users/${sellerId}/items/search`, 'https://local.invalid');
    url.searchParams.set('user_product_id', userProductId);
    url.searchParams.set('limit', String(USER_PRODUCT_SEARCH_PAGE_SIZE));
    url.searchParams.set('offset', String(offset));
    const response = await mercadoLibreApiJson(`${url.pathname}${url.search}`, accessToken);
    if (
      !isRecord(response.body) || identifier(response.body.seller_id) !== sellerId ||
      !Array.isArray(response.body.results) || !isRecord(response.body.paging) ||
      typeof response.body.paging.total !== 'number' ||
      !Number.isSafeInteger(response.body.paging.total) || response.body.paging.total < 0
    ) {
      throw providerResponseError();
    }
    const pageIds = response.body.results.map((candidate) =>
      typeof candidate === 'string' && /^MLA\d{5,30}$/u.test(candidate) ? candidate : null);
    if (pageIds.some((candidate) => candidate === null)) throw providerResponseError();
    for (const itemId of pageIds as string[]) {
      if (!seen.has(itemId)) {
        seen.add(itemId);
        ids.push(itemId);
      }
    }
    offset += pageIds.length;
    if (pageIds.length === 0 || offset >= response.body.paging.total) {
      return Object.freeze(ids);
    }
  }
  throw new HttpError(
    502,
    'MERCADO_LIBRE_PAGINATION_LIMIT',
    'Mercado Libre excedió el límite operativo de la notificación.',
  );
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
    !/^\/(?:items\/MLA\d{5,30}|orders\/\d{1,30}|user-products\/MLAU\d{5,30}\/stock)$/u.test(resource) ||
    sent === ''
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
  return typeof value === 'string' && /^[a-z0-9_-]{1,40}$/u.test(value) ? value : null;
}

function providerResponseError(): HttpError {
  return new HttpError(502, 'MERCADO_LIBRE_RESPONSE_INVALID', 'Mercado Libre devolvió una respuesta no válida.');
}

function invalidNotification(): HttpError {
  return new HttpError(400, 'MERCADO_LIBRE_NOTIFICATION_INVALID', 'La notificación no es válida.');
}
