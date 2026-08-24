import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { listCatalogProductDetails, listRuntimeCatalogProducts } from './catalog-store';
import {
  completeMercadoLibreAuthorization,
  createMercadoLibreAuthorization,
  getMercadoLibreAccess,
} from './mercado-libre';
import {
  getMercadoLibreCatalogStatus,
  getMappedCatalogUnit,
  syncMercadoLibreCatalog,
} from './mercado-libre-catalog';
import {
  consumeMercadoLibreInventoryReservation,
  releaseMercadoLibreInventory,
  reserveMercadoLibreInventory,
} from './mercado-libre-inventory';
import type { Env } from './platform';
import { SqliteD1 } from './test/sqlite-d1';

const migration = Array.from({ length: 9 }, (_, index) => {
  const prefix = String(index + 1).padStart(4, '0');
  const filename = readFileSync(
    resolve(process.cwd(), 'migrations', `${prefix}_${migrationSuffix(index + 1)}.sql`),
    'utf8',
  );
  return filename;
}).join('\n');

const encryptionKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const env: Env = Object.freeze({
  PUBLIC_SITE_URL: 'https://preview.example.test',
  MERCADO_LIBRE_CLIENT_ID: '123456789',
  MERCADO_LIBRE_CLIENT_SECRET: 'client-secret-for-tests',
  MERCADO_LIBRE_EXPECTED_SELLER_ID: '987654321',
  MERCADO_LIBRE_TOKEN_ENCRYPTION_KEY: encryptionKey,
  MERCADO_LIBRE_CATALOG_ENABLED: 'true',
  MERCADO_LIBRE_CATALOG_MAX_AGE_SECONDS: '300',
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Mercado Libre OAuth y catálogo', () => {
  it('consume state una vez, cifra tokens rotativos y verifica el seller', async () => {
    const database = new SqliteD1(migration);
    try {
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.pathname === '/oauth/token') {
          return json({
            access_token: 'access-token-value-0123456789',
            refresh_token: 'refresh-token-value-0123456789',
            expires_in: 21600,
            user_id: 987654321,
          });
        }
        if (url.pathname === '/users/me') {
          return json({ id: 987654321, site_id: 'MLA', nickname: 'SELLER_TEST' });
        }
        return json({}, 404);
      });
      vi.stubGlobal('fetch', fetchMock);

      const authorization = await createMercadoLibreAuthorization(database, env, 'admin@test');
      const state = new URL(authorization.authorizationUrl).searchParams.get('state');
      expect(state).toMatch(/^[A-Za-z0-9_-]+$/u);
      await completeMercadoLibreAuthorization(
        database,
        env,
        'authorization-code-123456',
        state ?? '',
      );
      const access = await getMercadoLibreAccess(database, env);
      expect(access).toEqual({
        accessToken: 'access-token-value-0123456789',
        sellerId: '987654321',
      });
      const row = await database.prepare(
        `SELECT access_token_ciphertext, refresh_token_ciphertext
         FROM mercadolibre_connections WHERE id = 1`,
      ).first<Readonly<{ access_token_ciphertext: string; refresh_token_ciphertext: string }>>();
      expect(row?.access_token_ciphertext).not.toContain('access-token');
      expect(row?.refresh_token_ciphertext).not.toContain('refresh-token');
      await expect(completeMercadoLibreAuthorization(
        database,
        env,
        'authorization-code-123456',
        state ?? '',
      )).rejects.toMatchObject({ code: 'MERCADO_LIBRE_OAUTH_STATE_INVALID' });
    } finally {
      database.close();
    }
  });

  it('pagina, mapea sólo SKU exacto y detecta stock seller_warehouse versionado', async () => {
    const database = new SqliteD1(migration);
    try {
      const localProducts = await listCatalogProductDetails(database);
      const local = localProducts.find((product) => product.sku !== undefined);
      expect(local?.sku).toBeDefined();
      await connect(database);
      let scanPage = 0;
      let failItemDetails = false;
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.pathname.endsWith('/items/search')) {
          scanPage += 1;
          return url.searchParams.has('scroll_id')
            ? json({ results: [], scroll_id: 'scroll-next' })
            : json({ results: ['MLA12345'], scroll_id: 'scroll-next' });
        }
        if (url.pathname === '/items') {
          if (failItemDetails) return json([{ code: 500, body: { id: 'MLA12345' } }]);
          return json([{ code: 200, body: {
            id: 'MLA12345',
            seller_id: 987654321,
            title: 'Producto sincronizado',
            currency_id: 'ARS',
            price: 1234.56,
            status: 'active',
            available_quantity: 2,
            seller_custom_field: local?.sku,
            user_product_id: 'UP123',
            variations: [],
            thumbnail: 'https://http2.mlstatic.com/test.jpg',
            permalink: 'https://articulo.mercadolibre.com.ar/MLA-12345',
            last_updated: '2026-08-24T10:00:00.000Z',
          } }]);
        }
        if (url.pathname === '/user-products/UP123/stock') {
          return json(
            { locations: [{ type: 'seller_warehouse', store_id: 'STORE1', quantity: 2 }] },
            200,
            { 'x-version': 'version-1' },
          );
        }
        return json({}, 404);
      });
      vi.stubGlobal('fetch', fetchMock);

      const summary = await syncMercadoLibreCatalog(database, env, 'admin@test', {
        kind: 'initial',
        localProducts,
      });
      expect(summary).toMatchObject({
        status: 'succeeded',
        processed: 1,
        created: 1,
        ambiguous: 0,
        active: 1,
        outOfStock: 0,
      });
      const unit = await getMappedCatalogUnit(database, env, local?.id ?? 'missing');
      expect(unit).toMatchObject({
        itemId: 'MLA12345',
        localProductId: local?.id,
        priceMinor: 123456,
        availableQuantity: 2,
        stockModel: 'seller_warehouse_versioned',
        checkoutEligible: true,
        mappingStatus: 'mapped',
      });
      const runtimeProduct = (await listRuntimeCatalogProducts(database, env))
        .find((product) => product.id === local?.id);
      expect(runtimeProduct).toMatchObject({
        availableQuantity: 2,
        commerce: { availabilityState: 'verified', checkoutEligible: true },
      });
      expect(runtimeProduct?.commerce).not.toHaveProperty('itemId');
      expect(runtimeProduct?.commerce).not.toHaveProperty('variationId');

      failItemDetails = true;
      const failedRefresh = await syncMercadoLibreCatalog(database, env, 'scheduler:test', {
        kind: 'full',
        localProducts,
      });
      expect(failedRefresh).toMatchObject({ status: 'failed', processed: 0, failed: 1 });
      const preserved = await database.prepare(
        `SELECT mapping_status, last_sync_status FROM mercadolibre_catalog_units
         WHERE item_id = 'MLA12345'`,
      ).first<Readonly<{ mapping_status: string; last_sync_status: string }>>();
      expect(preserved).toEqual({ mapping_status: 'mapped', last_sync_status: 'ok' });

      await database.prepare(
        `UPDATE mercadolibre_catalog_units
         SET last_synced_at = '2020-01-01T00:00:00.000Z' WHERE item_id = 'MLA12345'`,
      ).run();
      const staleProduct = (await listRuntimeCatalogProducts(database, env))
        .find((product) => product.id === local?.id);
      expect(staleProduct).toMatchObject({
        availability: 'unavailable',
        commerce: { availabilityState: 'updating', checkoutEligible: false },
      });
      expect(staleProduct).not.toHaveProperty('stockQuantity');
      expect(staleProduct).not.toHaveProperty('availableQuantity');
      expect(scanPage).toBe(4);
    } finally {
      database.close();
    }
  });

  it('bloquea publicaciones distintas que comparten el mismo User Product físico', async () => {
    const database = new SqliteD1(migration);
    try {
      const localProducts = (await listCatalogProductDetails(database))
        .filter((product) => product.sku !== undefined)
        .slice(0, 2);
      expect(localProducts).toHaveLength(2);
      await connect(database);
      let scanPage = 0;
      vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.pathname.endsWith('/items/search')) {
          scanPage += 1;
          return scanPage === 1
            ? json({ results: ['MLA12345', 'MLA67890'], scroll_id: 'shared-up-next' })
            : json({ results: [], scroll_id: 'shared-up-next' });
        }
        if (url.pathname === '/items') {
          const requestedIds = new Set((url.searchParams.get('ids') ?? '').split(','));
          return json(localProducts.flatMap((product, index) => {
            const itemId = index === 0 ? 'MLA12345' : 'MLA67890';
            return requestedIds.has(itemId) ? [{ code: 200, body: {
              id: itemId,
              seller_id: 987654321,
              title: `Publicación compartida ${index + 1}`,
              currency_id: 'ARS',
              price: 1_000 + index,
              status: 'active',
              available_quantity: 4,
              seller_custom_field: product.sku,
              user_product_id: 'UP-SHARED',
              variations: [],
              last_updated: '2026-08-24T10:00:00.000Z',
            } }] : [];
          }));
        }
        if (url.pathname === '/user-products/UP-SHARED/stock') {
          return json(
            { locations: [{ type: 'seller_warehouse', store_id: 'STORE1', quantity: 4 }] },
            200,
            { 'x-version': 'version-shared' },
          );
        }
        return json({}, 404);
      }));

      const summary = await syncMercadoLibreCatalog(database, env, 'admin@test', {
        kind: 'initial',
        localProducts,
      });
      expect(summary).toMatchObject({ status: 'succeeded', processed: 2, ambiguous: 2 });
      const conflicts = await database.prepare(
        `SELECT mapping_status, sellable, checkout_eligible
         FROM mercadolibre_catalog_units ORDER BY item_id`,
      ).all<Readonly<{ mapping_status: string; sellable: number; checkout_eligible: number }>>();
      expect(conflicts.results).toEqual([
        { mapping_status: 'duplicate', sellable: 0, checkout_eligible: 0 },
        { mapping_status: 'duplicate', sellable: 0, checkout_eligible: 0 },
      ]);
      await expect(getMappedCatalogUnit(database, env, localProducts[0]?.id ?? 'missing'))
        .rejects.toMatchObject({ code: 'MERCADO_LIBRE_PRODUCT_UNMAPPED' });

      const status = await getMercadoLibreCatalogStatus(database, env) as {
        counts: Record<string, unknown>;
      };
      expect(status.counts).toMatchObject({
        shared_user_product_count: 1,
        seller_warehouse_count: 2,
        checkout_eligible_count: 0,
        negative_stock_count: 0,
      });

      const incremental = await syncMercadoLibreCatalog(database, env, 'notification:test', {
        kind: 'incremental',
        itemIds: ['MLA12345'],
        localProducts,
      });
      expect(incremental.ambiguous).toBe(1);
      const afterIncremental = await database.prepare(
        `SELECT mapping_status, sellable, checkout_eligible
         FROM mercadolibre_catalog_units ORDER BY item_id`,
      ).all<Readonly<{ mapping_status: string; sellable: number; checkout_eligible: number }>>();
      expect(afterIncremental.results).toEqual([
        { mapping_status: 'duplicate', sellable: 0, checkout_eligible: 0 },
        { mapping_status: 'duplicate', sellable: 0, checkout_eligible: 0 },
      ]);
    } finally {
      database.close();
    }
  });

  it('reserva la última unidad una vez, compensa una vez y detecta aprobación tardía sin stock', async () => {
    const database = new SqliteD1(migration);
    try {
      await connect(database);
      await seedMappedUnit(database);
      await seedOrder(database, 'ord_first');
      await seedOrder(database, 'ord_second');
      let quantity = 1;
      let version = 'version-1';
      let writes = 0;
      vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url.pathname !== '/user-products/UP-LAST/stock' &&
            url.pathname !== '/user-products/UP-LAST/stock/type/seller_warehouse') {
          return json({}, 404);
        }
        if (init?.method === 'PUT') {
          expect(new Headers(init.headers).get('x-version')).toBe(version);
          if (typeof init.body !== 'string') return json({}, 400);
          const payload = JSON.parse(init.body) as { locations?: Array<{ quantity?: number }> };
          const nextQuantity = payload.locations?.[0]?.quantity;
          if (typeof nextQuantity !== 'number') return json({}, 400);
          quantity = nextQuantity;
          version = `version-${Number(version.split('-')[1]) + 1}`;
          writes += 1;
          return json({});
        }
        return json(
          { locations: [{ type: 'seller_warehouse', store_id: 'STORE1', quantity }] },
          200,
          { 'x-version': version },
        );
      }));

      await reserveMercadoLibreInventory(database, env, 'ord_first', [{
        productId: 'local-last', quantity: 1, expectedCatalogVersion: 'catalog-v1',
      }]);
      await reserveMercadoLibreInventory(database, env, 'ord_first', [{
        productId: 'local-last', quantity: 1, expectedCatalogVersion: 'catalog-v1',
      }]);
      expect(quantity).toBe(0);
      expect(writes).toBe(1);

      await expect(reserveMercadoLibreInventory(database, env, 'ord_second', [{
        productId: 'local-last', quantity: 1, expectedCatalogVersion: 'catalog-v1',
      }])).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
      expect(quantity).toBe(0);
      expect(writes).toBe(1);

      await releaseMercadoLibreInventory(database, env, 'ord_first');
      await releaseMercadoLibreInventory(database, env, 'ord_first');
      expect(quantity).toBe(1);
      expect(writes).toBe(2);
      quantity = 0;
      version = 'version-4';
      await expect(consumeMercadoLibreInventoryReservation(
        database,
        'ord_first',
        env,
      )).rejects.toMatchObject({ code: 'PAYMENT_APPROVED_STOCK_CONFLICT' });
      expect(quantity).toBe(0);
      expect(writes).toBe(2);
      const negative = await database.prepare(
        'SELECT COUNT(*) AS total FROM mercadolibre_catalog_units WHERE available_quantity < 0',
      ).first<Readonly<{ total: number }>>();
      expect(negative?.total).toBe(0);
    } finally {
      database.close();
    }
  });

  it('no repone stock cuando la reducción upstream quedó incierta', async () => {
    const database = new SqliteD1(migration);
    try {
      await connect(database);
      await seedMappedUnit(database);
      await seedOrder(database, 'ord_uncertain');
      let quantity = 1;
      let putCalls = 0;
      vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url.pathname !== '/user-products/UP-LAST/stock' &&
            url.pathname !== '/user-products/UP-LAST/stock/type/seller_warehouse') {
          return json({}, 404);
        }
        if (init?.method === 'PUT') {
          putCalls += 1;
          quantity = 0;
          throw new TypeError('respuesta perdida después del PUT');
        }
        return json(
          { locations: [{ type: 'seller_warehouse', store_id: 'STORE1', quantity }] },
          200,
          { 'x-version': 'version-1' },
        );
      }));

      await expect(reserveMercadoLibreInventory(database, env, 'ord_uncertain', [{
        productId: 'local-last', quantity: 1, expectedCatalogVersion: 'catalog-v1',
      }])).rejects.toMatchObject({ code: 'MERCADO_LIBRE_OPERATION_UNCERTAIN' });
      expect(quantity).toBe(0);
      expect(putCalls).toBe(1);

      await expect(releaseMercadoLibreInventory(database, env, 'ord_uncertain'))
        .rejects.toMatchObject({ code: 'MERCADO_LIBRE_OPERATION_UNCERTAIN' });
      expect(quantity).toBe(0);
      expect(putCalls).toBe(1);
      const operation = await database.prepare(
        `SELECT status FROM mercadolibre_inventory_operations
         WHERE order_id = 'ord_uncertain' AND action = 'reserve'`,
      ).first<Readonly<{ status: string }>>();
      expect(operation?.status).toBe('compensation_pending');
    } finally {
      database.close();
    }
  });
});

async function connect(database: SqliteD1): Promise<void> {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url.pathname === '/oauth/token') {
      return json({
        access_token: 'access-token-value-0123456789',
        refresh_token: 'refresh-token-value-0123456789',
        expires_in: 21600,
        user_id: 987654321,
      });
    }
    return json({ id: 987654321, site_id: 'MLA', nickname: 'SELLER_TEST' });
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

async function seedMappedUnit(database: SqliteD1): Promise<void> {
  const now = new Date().toISOString();
  await database.prepare(`INSERT INTO mercadolibre_catalog_units (
    inventory_key, seller_id, item_id, variation_id, user_product_id,
    seller_sku, local_product_id, title, price_minor, currency, item_status,
    available_quantity, stock_model, stock_location_id, upstream_version,
    stock_snapshot_json, primary_image_url, permalink, provider_updated_at,
    catalog_version, mapping_status, sellable, checkout_eligible,
    last_sync_status, last_sync_error_code, last_synced_at, created_at, updated_at
  ) VALUES (
    '987654321:MLA-LAST:simple:UP-LAST', '987654321', 'MLA-LAST', NULL, 'UP-LAST',
    'SKU-LAST', 'local-last', 'Última unidad', 10000, 'ARS', 'active', 1,
    'seller_warehouse_versioned', 'STORE1', 'version-1', ?, NULL,
    'https://articulo.mercadolibre.com.ar/MLA-LAST', ?, 'catalog-v1', 'mapped',
    1, 1, 'ok', NULL, ?, ?, ?
  )`)
    .bind('[{"type":"seller_warehouse","id":"STORE1","quantity":1}]', now, now, now, now)
    .run();
}

async function seedOrder(database: SqliteD1, orderId: string): Promise<void> {
  const now = new Date().toISOString();
  await database.prepare(`INSERT INTO orders (
    id, public_token_hash, checkout_idempotency_key, cart_fingerprint,
    status, currency, total_minor, item_count, created_at, updated_at, channel,
    stock_reserved_at, stock_reservation_expires_at
  ) VALUES (?, ?, ?, ?, 'preference_pending', 'ARS', 10000, 1, ?, ?,
    'checkout_pro', ?, ?)`)
    .bind(
      orderId, `${orderId}-token`, crypto.randomUUID(), `${orderId}-fingerprint`,
      now, now, now, new Date(Date.now() + 30 * 60 * 1_000).toISOString(),
    )
    .run();
  await database.prepare(`INSERT INTO order_items (
    order_id, product_id, name, presentation, quantity, unit_price_minor,
    subtotal_minor, stock_controlled
  ) VALUES (?, 'local-last', 'Última unidad', NULL, 1, 10000, 10000, 0)`)
    .bind(orderId)
    .run();
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
