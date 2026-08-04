import type { RecalculatedCart } from './catalog';
import { hmacSha256Hex } from './crypto';
import { createPaymentCart } from './fulfillment';
import {
  createMercadoPagoPreference,
  getMercadoPagoPayment,
  mapPaymentStatus,
  verifyMercadoPagoWebhook,
} from './mercado-pago';

describe('Mercado Pago', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
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
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify({
      id: 'preference_123',
      init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect',
    }), { status: 201, headers: { 'content-type': 'application/json' } })));
    globalThis.fetch = fetchMock;

    await expect(createMercadoPagoPreference({
      accessToken: 'test-token-without-real-credentials',
      cart: createPaymentCart(cart()),
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
    if (typeof request.body !== 'string') throw new Error('Mercado Pago no recibió JSON.');
    const body = JSON.parse(request.body) as Record<string, unknown>;
    expect(body).toMatchObject({ external_reference: 'order-123', auto_return: 'approved' });
    expect(body.items).toEqual([
      expect.objectContaining({ id: 'producto-prueba', currency_id: 'ARS', quantity: 1, unit_price: 7_500 }),
      expect.objectContaining({ id: 'shipping-correo-argentino', currency_id: 'ARS', quantity: 1, unit_price: 19_000 }),
    ]);
  });

  it('rechaza IDs de proveedor vacíos o diferentes al recurso solicitado', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      id: '',
      init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect',
    }), { status: 201, headers: { 'content-type': 'application/json' } })));
    await expect(createMercadoPagoPreference({
      accessToken: 'test-token-without-real-credentials',
      cart: createPaymentCart(cart()),
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
