import type { RecalculatedCart } from './catalog';
import { hmacSha256Hex } from './crypto';
import { createPaymentCart } from './fulfillment';
import {
  createMercadoPagoPreference,
  getMercadoPagoPayment,
  mapPaymentStatus,
  recoverMercadoPagoPreference,
  verifyMercadoPagoWebhook,
} from './mercado-pago';

const ORDER_CREATED_AT = '2030-01-01T12:00:00.000Z';
const ORDER_EXPIRES_AT = '2030-01-01T12:30:00.000Z';

describe('Mercado Pago', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('verifica el manifiesto firmado y rechaza un ID diferente', async () => {
    const secret = 's'.repeat(40);
    const dataId = '456789';
    const requestId = 'request-123';
    const timestamp = '1720000000';
    const digest = await hmacSha256Hex(
      secret,
      `id:${dataId};request-id:${requestId};ts:${timestamp};`,
    );
    await expect(verifyMercadoPagoWebhook({
      dataId,
      requestId,
      secret,
      signatureHeader: `ts=${timestamp},v1=${digest}`,
    })).resolves.toEqual({ timestamp, digest });
    await expect(verifyMercadoPagoWebhook({
      dataId: '456780',
      requestId,
      secret,
      signatureHeader: `ts=${timestamp},v1=${digest}`,
    })).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
    await expect(verifyMercadoPagoWebhook({
      dataId,
      requestId,
      secret,
      signatureHeader: null,
    })).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_MISSING' });

    const digestWithoutRequestId = await hmacSha256Hex(secret, `id:${dataId};ts:${timestamp};`);
    await expect(verifyMercadoPagoWebhook({
      dataId,
      requestId: null,
      secret,
      signatureHeader: `ts=${timestamp},v1=${digestWithoutRequestId}`,
    })).resolves.toEqual({ timestamp, digest: digestWithoutRequestId });
  });

  it('mapea estados finales sin degradarlos en la capa de pedidos', () => {
    for (const [provider, internal] of [
      ['approved', 'approved'],
      ['pending', 'pending'],
      ['in_process', 'pending'],
      ['rejected', 'rejected'],
      ['cancelled', 'cancelled'],
      ['refunded', 'refunded'],
      ['charged_back', 'refunded'],
    ] as const) {
      expect(mapPaymentStatus(provider)).toBe(internal);
    }
  });

  it('envía productos y envío en ARS y valida el ID de la preferencia', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2030-01-01T12:05:00.000Z');
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify({
      id: 'preference_123',
      init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect',
      expiration_date_from: ORDER_CREATED_AT,
      expiration_date_to: ORDER_EXPIRES_AT,
      preference_expired: false,
    }), { status: 201, headers: { 'content-type': 'application/json' } })));
    globalThis.fetch = fetchMock;

    await expect(createMercadoPagoPreference({
      accessToken: 'test-token-without-real-credentials',
      cart: createPaymentCart(cart()),
      createdAt: ORDER_CREATED_AT,
      mode: 'production',
      orderId: 'order-123',
      publicToken: 'public-token',
      siteUrl: new URL('https://example.test'),
    })).resolves.toEqual({
      id: 'preference_123',
      checkoutUrl: 'https://www.mercadopago.com.ar/checkout/v1/redirect',
    });

    const request = fetchMock.mock.calls[0]?.[1];
    if (request === undefined) throw new Error('Mercado Pago no recibió la solicitud esperada.');
    expect(new Headers(request.headers).has('x-idempotency-key')).toBe(false);
    if (typeof request.body !== 'string') throw new Error('Mercado Pago no recibió JSON.');
    const body = JSON.parse(request.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      external_reference: 'order-123',
      auto_return: 'approved',
      notification_url: 'https://example.test/api/webhooks/mercadopago?source_news=webhooks',
      expires: true,
      expiration_date_from: ORDER_CREATED_AT,
      expiration_date_to: ORDER_EXPIRES_AT,
    });
    expect(body.items).toEqual([
      expect.objectContaining({ id: 'producto-prueba', currency_id: 'ARS', quantity: 1, unit_price: 7_500 }),
      expect.objectContaining({ id: 'shipping-correo-argentino', currency_id: 'ARS', quantity: 1, unit_price: 19_000 }),
    ]);
  });

  it('falla cerrado ante una intención vencida o una respuesta con otra vigencia', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2030-01-01T12:31:00.000Z');
    const fetchMock = vi.fn<typeof fetch>();
    globalThis.fetch = fetchMock;
    await expect(createMercadoPagoPreference({
      accessToken: 'test-token-without-real-credentials',
      cart: createPaymentCart(cart()),
      createdAt: ORDER_CREATED_AT,
      mode: 'production',
      orderId: 'order-123',
      publicToken: 'public-token',
      siteUrl: new URL('https://example.test'),
    })).rejects.toMatchObject({ code: 'CHECKOUT_INTENT_EXPIRED' });
    expect(fetchMock).not.toHaveBeenCalled();

    vi.setSystemTime('2030-01-01T12:05:00.000Z');
    globalThis.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      id: 'preference_123',
      init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect',
      expiration_date_from: ORDER_CREATED_AT,
      expiration_date_to: '2030-01-01T12:31:00.000Z',
      preference_expired: false,
    }), { status: 201, headers: { 'content-type': 'application/json' } })));
    await expect(createMercadoPagoPreference({
      accessToken: 'test-token-without-real-credentials',
      cart: createPaymentCart(cart()),
      createdAt: ORDER_CREATED_AT,
      mode: 'production',
      orderId: 'order-123',
      publicToken: 'public-token',
      siteUrl: new URL('https://example.test'),
    })).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_OUTCOME_UNKNOWN' });
  });

  it('recupera sólo la preferencia vigente que corresponde al pedido y al carrito', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2030-01-01T12:05:00.000Z');
    const paymentCart = createPaymentCart(cart());
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        elements: [{ id: 'preference_123', external_reference: 'order-123' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'preference_123',
        external_reference: 'order-123',
        items: [
          { id: 'producto-prueba', quantity: 1, currency_id: 'ARS', unit_price: '7500.00' },
          { id: 'shipping-correo-argentino', quantity: 1, currency_id: 'ARS', unit_price: 19_000 },
        ],
        sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect',
        expiration_date_from: '2030-01-01T09:00:00.000-03:00',
        expiration_date_to: '2030-01-01T09:30:00.000-03:00',
        preference_expired: false,
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    globalThis.fetch = fetchMock;

    await expect(recoverMercadoPagoPreference({
      accessToken: 'test-token-without-real-credentials',
      cart: paymentCart,
      createdAt: ORDER_CREATED_AT,
      mode: 'sandbox',
      orderId: 'order-123',
    })).resolves.toEqual({
      id: 'preference_123',
      checkoutUrl: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const searchInput = fetchMock.mock.calls[0]?.[0];
    if (!(searchInput instanceof URL)) throw new Error('Mercado Pago no recibió la búsqueda esperada.');
    expect(searchInput.searchParams.get('external_reference')).toBe('order-123');
  });

  it('rechaza recuperar preferencias vencidas o con una vigencia diferente', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2030-01-01T12:05:00.000Z');
    const paymentCart = createPaymentCart(cart());
    const detail = {
      id: 'preference_123',
      external_reference: 'order-123',
      items: [
        { id: 'producto-prueba', quantity: 1, currency_id: 'ARS', unit_price: 7_500 },
        { id: 'shipping-correo-argentino', quantity: 1, currency_id: 'ARS', unit_price: 19_000 },
      ],
      sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect',
      expiration_date_from: ORDER_CREATED_AT,
      expiration_date_to: ORDER_EXPIRES_AT,
      preference_expired: true,
    };
    globalThis.fetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        elements: [{ id: 'preference_123', external_reference: 'order-123' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(detail), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    await expect(recoverMercadoPagoPreference({
      accessToken: 'test-token-without-real-credentials',
      cart: paymentCart,
      createdAt: ORDER_CREATED_AT,
      mode: 'sandbox',
      orderId: 'order-123',
    })).rejects.toMatchObject({ code: 'PREFERENCE_RECOVERY_EXPIRED' });

    globalThis.fetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        elements: [{ id: 'preference_123', external_reference: 'order-123' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...detail,
        expiration_date_to: '2030-01-01T12:31:00.000Z',
        preference_expired: false,
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(recoverMercadoPagoPreference({
      accessToken: 'test-token-without-real-credentials',
      cart: paymentCart,
      createdAt: ORDER_CREATED_AT,
      mode: 'sandbox',
      orderId: 'order-123',
    })).rejects.toMatchObject({ code: 'PREFERENCE_RECOVERY_MISMATCH' });
  });

  it('rechaza IDs de proveedor vacíos o diferentes al recurso solicitado', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      id: '',
      init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect',
    }), { status: 201, headers: { 'content-type': 'application/json' } })));
    await expect(createMercadoPagoPreference({
      accessToken: 'test-token-without-real-credentials',
      cart: createPaymentCart(cart()),
      createdAt: new Date(Date.now()).toISOString(),
      mode: 'production',
      orderId: 'order-123',
      publicToken: 'public-token',
      siteUrl: new URL('https://example.test'),
    })).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_OUTCOME_UNKNOWN' });

    globalThis.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      id: 456,
      external_reference: 'order-123',
      status: 'approved',
      transaction_amount: 26_500,
      currency_id: 'ARS',
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    await expect(getMercadoPagoPayment('123', 'test-token-without-real-credentials'))
      .rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_INVALID_RESPONSE' });
  });
});

function cart(): RecalculatedCart {
  return Object.freeze({
    currency: 'ARS',
    lines: Object.freeze([Object.freeze({
      product: Object.freeze({
        id: 'producto-prueba', name: 'Producto de prueba', presentation: '50 g',
        available: true, unitPriceMinor: 750_000,
      }),
      quantity: 1,
      subtotalMinor: 750_000,
    })]),
    itemCount: 1,
    productsTotalMinor: 750_000,
    shippingMinor: 1_900_000,
    shippingTier: 'correo_up_to_1kg',
    totalWeightGrams: 50,
    fulfillment: Object.freeze({
      method: 'correo_argentino', fullName: 'Ana Pérez', phone: '5491155554444',
      address: 'Calle 123', locality: 'CABA', province: 'Buenos Aires', postalCode: 'C1234ABC',
    }),
    totalMinor: 2_650_000,
  });
}
