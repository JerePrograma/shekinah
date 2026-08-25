import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { listCatalogProductDetails } from '../../../server/catalog-store';
import {
  completeMercadoLibreAuthorization,
  createMercadoLibreAuthorization,
} from '../../../server/mercado-libre';
import type { Env, PagesFunctionContext } from '../../../server/platform';
import { SqliteD1 } from '../../../server/test/sqlite-d1';
import { onRequest } from './mercadolibre';

const migration = Array.from({ length: 9 }, (_, index) => {
  const number = index + 1;
  const prefix = String(number).padStart(4, '0');
  return readFileSync(
    resolve(process.cwd(), 'migrations', `${prefix}_${migrationSuffix(number)}.sql`),
    'utf8',
  );
}).join('\n');

const sellerId = '987654321';
const applicationId = '123456789';
const userProductId = 'MLAU12345';
const itemId = 'MLA12345';
const env: Env = Object.freeze({
  PUBLIC_SITE_URL: 'https://preview.example.test',
  MERCADO_LIBRE_CLIENT_ID: applicationId,
  MERCADO_LIBRE_CLIENT_SECRET: 'client-secret-for-tests',
  MERCADO_LIBRE_APPLICATION_ID: applicationId,
  MERCADO_LIBRE_EXPECTED_SELLER_ID: sellerId,
  MERCADO_LIBRE_TOKEN_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  MERCADO_LIBRE_CATALOG_ENABLED: 'true',
  MERCADO_LIBRE_CATALOG_MAX_AGE_SECONDS: '300',
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('notificaciones de Mercado Libre', () => {
  it('reconsulta stock-location por User Product y deduplica la entrega concurrente', async () => {
    const database = new SqliteD1(migration);
    try {
      await connect(database);
      const local = (await listCatalogProductDetails(database)).find((product) => product.sku !== undefined);
      expect(local?.sku).toBeDefined();
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.pathname === `/users/${sellerId}/items/search`) {
          expect(url.searchParams.get('user_product_id')).toBe(userProductId);
          return json({
            seller_id: Number(sellerId),
            results: [itemId],
            paging: { total: 1, offset: 0, limit: 50 },
          });
        }
        if (url.pathname === '/items') {
          return json([{ code: 200, body: {
            id: itemId,
            seller_id: Number(sellerId),
            title: 'Producto con stock actualizado',
            currency_id: 'ARS',
            price: 1234.56,
            status: 'active',
            available_quantity: 3,
            seller_custom_field: local?.sku,
            user_product_id: userProductId,
            variations: [],
            thumbnail: 'https://http2.mlstatic.com/test.jpg',
            permalink: 'https://articulo.mercadolibre.com.ar/MLA-12345',
            last_updated: '2026-08-25T10:00:00.000Z',
          } }]);
        }
        if (url.pathname === `/user-products/${userProductId}/stock`) {
          return json(
            { locations: [{ type: 'seller_warehouse', store_id: 'STORE1', quantity: 3 }] },
            200,
            { 'x-version': 'version-2' },
          );
        }
        return json({}, 404);
      });
      vi.stubGlobal('fetch', fetchMock);
      const waits: Promise<unknown>[] = [];
      const notification = request({
        application_id: Number(applicationId),
        user_id: Number(sellerId),
        topic: 'stock-location',
        resource: `/user-products/${userProductId}/stock`,
        sent: '2026-08-25T10:00:00.000Z',
      });

      const first = await onRequest(context(database, notification.clone(), waits));
      const duplicate = await onRequest(context(database, notification.clone(), waits));
      expect(first.status).toBe(200);
      expect(duplicate.status).toBe(200);
      await Promise.all(waits);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      await expect(database.prepare(
        `SELECT status, error_code, topic, attempt_count
         FROM mercadolibre_notifications`,
      ).first()).resolves.toEqual({
        status: 'processed',
        error_code: null,
        topic: 'stock-location',
        attempt_count: 1,
      });
      await expect(database.prepare(
        `SELECT item_id, user_product_id, available_quantity, stock_model, upstream_version
         FROM mercadolibre_catalog_units WHERE item_id = ?`,
      ).bind(itemId).first()).resolves.toEqual({
        item_id: itemId,
        user_product_id: userProductId,
        available_quantity: 3,
        stock_model: 'seller_warehouse_versioned',
        upstream_version: 'version-2',
      });
    } finally {
      database.close();
    }
  });

  it('rechaza un recurso stock-location que no pertenece al sitio MLA', async () => {
    const database = new SqliteD1(migration);
    try {
      const response = await onRequest(context(database, request({
        application_id: Number(applicationId),
        user_id: Number(sellerId),
        topic: 'stock-location',
        resource: '/user-products/MLBU12345/stock',
        sent: '2026-08-25T10:00:00.000Z',
      }), []));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'MERCADO_LIBRE_NOTIFICATION_INVALID' },
      });
    } finally {
      database.close();
    }
  });
});

function context(
  database: SqliteD1,
  requestValue: Request,
  waits: Promise<unknown>[],
): PagesFunctionContext<Env> {
  return {
    request: requestValue,
    env: { ...env, DB: database },
    params: {},
    data: {},
    functionPath: '/api/webhooks/mercadolibre',
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: (promise) => waits.push(promise),
  };
}

function request(payload: Readonly<Record<string, unknown>>): Request {
  return new Request('https://preview.example.test/api/webhooks/mercadolibre', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function connect(database: SqliteD1): Promise<void> {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url.pathname === '/oauth/token') {
      return json({
        access_token: 'access-token-value-0123456789',
        refresh_token: 'refresh-token-value-0123456789',
        expires_in: 21600,
        user_id: Number(sellerId),
      });
    }
    return json({ id: Number(sellerId), site_id: 'MLA', nickname: 'SELLER_TEST' });
  }));
  const authorization = await createMercadoLibreAuthorization(database, env, 'admin@test');
  await completeMercadoLibreAuthorization(
    database,
    env,
    'authorization-code-123456',
    new URL(authorization.authorizationUrl).searchParams.get('state') ?? '',
  );
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...Object.fromEntries(new Headers(headers)) },
  });
}

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  if (typeof input === 'string') return new URL(input);
  return new URL(input.url);
}

function migrationSuffix(index: number): string {
  const names: Record<number, string> = {
    1: 'commerce',
    2: 'fulfillment_and_retention',
    3: 'checkout_intent_cart_fingerprint',
    4: 'catalog_admin',
    5: 'admin_auth',
    6: 'analytics_manual_payment_click',
    7: 'whatsapp_order_reservations',
    8: 'checkout_pro_stock_and_whatsapp_identity',
    9: 'mercadolibre_catalog_and_inventory',
  };
  const name = names[index];
  if (name === undefined) throw new Error('Migración de prueba desconocida.');
  return name;
}
