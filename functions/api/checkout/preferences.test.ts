import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createCatalogProduct } from '../../../server/catalog-store';
import type { PagesFunctionContext } from '../../../server/platform';
import { createTestD1 } from '../../../src/test/d1';
import { onRequest } from './preferences';

const migrations = ['0001_commerce.sql', '0002_fulfillment_and_retention.sql',
  '0003_checkout_intent_cart_fingerprint.sql', '0004_catalog_admin.sql']
  .map((file) => readFileSync(resolve(process.cwd(), 'migrations', file), 'utf8'));
const originalFetch = globalThis.fetch;

function context(request: Request): PagesFunctionContext {
  return {
    request,
    env: {},
    params: {},
    data: {},
    functionPath: '/api/checkout/preferences',
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}

describe('endpoint de checkout', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('acepta sólo POST y falla cerrado sin flag de comercio', async () => {
    const getResponse = await onRequest(context(new Request(
      'https://example.test/api/checkout/preferences',
      { method: 'GET' },
    )));
    expect(getResponse.status).toBe(405);
    expect(getResponse.headers.get('allow')).toBe('POST');

    const postResponse = await onRequest(context(new Request(
      'https://example.test/api/checkout/preferences',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://example.test',
        },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), items: [] }),
      },
    )));
    expect(postResponse.status).toBe(503);
    await expect(postResponse.json()).resolves.toMatchObject({
      error: { code: 'COMMERCE_DISABLED' },
    });
  });

  it('falla cerrado si falta el secreto de firma del webhook', async () => {
    const testD1 = createTestD1(...migrations);
    try {
      const response = await onRequest({
        ...context(new Request('https://example.test/api/checkout/preferences', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'https://example.test',
          },
          body: JSON.stringify({}),
        })),
        env: {
          ...checkoutEnv(testD1.database),
          MERCADO_PAGO_WEBHOOK_SECRET: undefined,
        },
      });
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'WEBHOOK_SECRET_MISSING' },
      });
    } finally {
      testD1.close();
    }
  });

  it('persiste el precio dinámico vigente y no acepta el precio del navegador', async () => {
    const testD1 = createTestD1(...migrations);
    try {
      await createCatalogProduct(testD1.database, {
        id: 'producto-preferencia',
        slug: 'producto-preferencia',
        path: '/producto-preferencia/',
        name: 'Producto preferencia',
        categorySlugs: ['agroecologicos'],
        categoryNames: ['Agroecologicos'],
        presentation: '100 g',
        price: { amount: 2_345.67, currency: 'ARS' },
        availability: 'available',
        images: [],
        variants: [],
      }, 'admin@example.test');
      globalThis.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
        id: 'preference_dynamic_123',
        sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect',
      }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })));

      const checkoutBody = {
        idempotencyKey: crypto.randomUUID(),
        fulfillment: {
          method: 'coordinated_pickup',
          fullName: 'Ana Pérez',
          phone: '5491155554444',
          address: 'Calle 123',
          locality: 'CABA',
          province: 'Buenos Aires',
          postalCode: 'C1234ABC',
        },
      };
      const request = new Request('https://example.test/api/checkout/preferences', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://example.test',
        },
        body: JSON.stringify({
          ...checkoutBody,
          items: [{ productId: 'producto-preferencia', quantity: 2, price: 1 }],
        }),
      });
      const manipulatedResponse = await onRequest({
        ...context(request),
        env: checkoutEnv(testD1.database),
      });
      expect(manipulatedResponse.status).toBe(400);
      await expect(manipulatedResponse.json()).resolves.toMatchObject({
        error: { code: 'INVALID_CART_LINE' },
      });

      const validResponse = await onRequest({
        ...context(new Request(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify({
            ...checkoutBody,
            idempotencyKey: crypto.randomUUID(),
            items: [{ productId: 'producto-preferencia', quantity: 2 }],
          }),
        })),
        env: checkoutEnv(testD1.database),
      });
      expect(validResponse.status).toBe(201);
      expect(testD1.sqlite.prepare(
        "SELECT product_id, quantity, unit_price_minor, subtotal_minor FROM order_items WHERE product_id = 'producto-preferencia'",
      ).get()).toEqual({
        product_id: 'producto-preferencia',
        quantity: 2,
        unit_price_minor: 234_567,
        subtotal_minor: 469_134,
      });
    } finally {
      testD1.close();
    }
  });
});

function checkoutEnv(database: ReturnType<typeof createTestD1>['database']) {
  return {
    DB: database,
    COMMERCE_ENABLED: 'true',
    PUBLIC_SITE_URL: 'https://example.test',
    ALLOWED_SITE_ORIGINS: 'https://example.test',
    MERCADO_PAGO_CHECKOUT_MODE: 'sandbox',
    MERCADO_PAGO_ACCESS_TOKEN: 'test-token-without-real-credentials',
    MERCADO_PAGO_WEBHOOK_SECRET: 'w'.repeat(40),
    ORDER_TOKEN_SECRET: 's'.repeat(40),
  } as const;
}
