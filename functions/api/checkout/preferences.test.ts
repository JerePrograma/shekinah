import type { PagesFunctionContext } from '../../../server/platform';
import { onRequest } from './preferences';

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

function checkoutRequest(): Request {
  return new Request('https://example.test/api/checkout/preferences', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://example.test',
    },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      items: [{ productId: 'producto-prueba', quantity: 1 }],
      fulfillment: {
        method: 'coordinated_pickup',
        fullName: 'Ana Pérez',
        phone: '5491155554444',
        address: 'Calle 123',
        locality: 'CABA',
        province: 'Buenos Aires',
        postalCode: 'C1234ABC',
      },
    }),
  });
}

describe('endpoint de checkout con Dux autoritativo', () => {
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

    const postResponse = await onRequest(context(checkoutRequest()));
    expect(postResponse.status).toBe(503);
    await expect(postResponse.json()).resolves.toMatchObject({
      error: { code: 'COMMERCE_DISABLED' },
    });
  });

  it('no usa stock local ni crea una preferencia si Dux está deshabilitado', async () => {
    globalThis.fetch = vi.fn<typeof fetch>();
    const response = await onRequest({
      ...context(checkoutRequest()),
      env: {
        COMMERCE_ENABLED: 'true',
        ALLOWED_SITE_ORIGINS: 'https://example.test',
      },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'DUX_API_DISABLED' },
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('no crea Mercado Pago ni pedidos Dux mientras no exista liberación/finalización oficial', async () => {
    globalThis.fetch = vi.fn<typeof fetch>();
    const response = await onRequest({
      ...context(checkoutRequest()),
      env: {
        COMMERCE_ENABLED: 'true',
        DUX_API_ENABLED: 'true',
        ALLOWED_SITE_ORIGINS: 'https://example.test',
      },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'DUX_ORDER_LIFECYCLE_UNAVAILABLE' },
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rechaza la autoridad directa de Mercado Libre antes de cualquier llamada externa', async () => {
    globalThis.fetch = vi.fn<typeof fetch>();
    const response = await onRequest({
      ...context(checkoutRequest()),
      env: {
        COMMERCE_ENABLED: 'true',
        DUX_API_ENABLED: 'true',
        MERCADO_LIBRE_CATALOG_ENABLED: 'true',
        ALLOWED_SITE_ORIGINS: 'https://example.test',
      },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'MERCADO_LIBRE_INVENTORY_DISABLED' },
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
