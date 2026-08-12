import type { CartItem } from '../cart/model';
import type { Product } from '../catalog/model';
import { createCheckoutPreference, createWhatsappOrder, getPublicOrderStatus } from './api';
import type { CheckoutFulfillment } from './fulfillment';

const product: Product = {
  id: 'producto-prueba',
  slug: 'producto-prueba',
  path: '/producto-prueba/',
  name: 'Producto de prueba',
  categorySlugs: [],
  categoryNames: [],
  price: { amount: 1234, currency: 'ARS' },
};
const item: CartItem = { product, quantity: 2, unitPrice: 1234, subtotal: 2468 };
const fulfillment: CheckoutFulfillment = {
  method: 'coordinated_pickup',
  fullName: 'Ana Pérez',
  phone: '5491155554444',
  address: 'Calle 123',
  locality: 'CABA',
  province: 'Buenos Aires',
  postalCode: 'C1234ABC',
};

describe('cliente de comercio', () => {
  afterEach(() => vi.restoreAllMocks());

  it('envía sólo producto, cantidad, idempotencia y entrega normalizada', async () => {
    const publicToken = 'a'.repeat(64);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      checkoutUrl: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123',
      publicToken,
    }), { status: 201, headers: { 'content-type': 'application/json' } }));
    await expect(
      createCheckoutPreference([item], crypto.randomUUID(), fulfillment),
    ).resolves.toMatchObject({
      publicToken,
    });
    const request = fetchMock.mock.calls[0]?.[1];
    if (request === undefined || typeof request.body !== 'string') {
      throw new Error('No se capturó el cuerpo del checkout.');
    }
    const body = JSON.parse(request.body) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['fulfillment', 'idempotencyKey', 'items']);
    expect(body.items).toEqual([{ productId: 'producto-prueba', quantity: 2 }]);
    expect(body.fulfillment).toEqual(fulfillment);
    expect(request.credentials).toBe('same-origin');
  });

  it('rechaza una URL ajena y exige un estado público mínimo válido', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      checkoutUrl: 'https://evil.example/checkout',
      publicToken: 'b'.repeat(64),
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(
      createCheckoutPreference([item], crypto.randomUUID(), fulfillment),
    ).rejects.toThrow(
      'URL de pago no autorizada',
    );

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      status: 'approved',
      currency: 'ARS',
      totalMinor: 246_800,
      itemCount: 2,
      updatedAt: '2026-07-31T10:00:00.000Z',
      internalOrderId: 'ord_no_debe_salir',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(getPublicOrderStatus('c'.repeat(64))).resolves.toMatchObject({
      status: 'approved',
      currency: 'ARS',
      totalMinor: 246_800,
      itemCount: 2,
    });
  });

  it('crea un pedido de WhatsApp sólo con IDs y cantidades y valida su snapshot', async () => {
    const orderId = `ord_${'w'.repeat(24)}`;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      orderId,
      status: 'pending',
      currency: 'ARS',
      totalMinor: 246_800,
      itemCount: 2,
      createdAt: '2026-08-12T12:00:00.000Z',
      items: [{
        productId: product.id,
        name: product.name,
        presentation: '100 g',
        quantity: 2,
        unitPriceMinor: 123_400,
        subtotalMinor: 246_800,
      }],
    }), { status: 201, headers: { 'content-type': 'application/json' } }));

    await expect(
      createWhatsappOrder([item], '00000000-0000-4000-8000-000000000001', null),
    ).resolves.toMatchObject({ orderId, status: 'pending', totalMinor: 246_800 });

    const request = fetchMock.mock.calls[0]?.[1];
    if (request === undefined || typeof request.body !== 'string') {
      throw new Error('No se capturó el cuerpo del pedido de WhatsApp.');
    }
    expect(JSON.parse(request.body)).toEqual({
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
      items: [{ productId: product.id, quantity: 2 }],
      fulfillment: null,
    });
    expect(request.credentials).toBe('same-origin');
    expect(request.redirect).toBe('error');
  });

  it('rechaza respuestas no autoritativas o snapshots inconsistentes de WhatsApp', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      error: { message: 'Algunos productos ya no tienen la cantidad solicitada.' },
    }), { status: 409, headers: { 'content-type': 'application/json' } }));
    await expect(
      createWhatsappOrder([item], crypto.randomUUID(), fulfillment),
    ).rejects.toThrow('Algunos productos ya no tienen la cantidad solicitada.');

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      orderId: `ord_${'x'.repeat(24)}`,
      status: 'pending',
      currency: 'ARS',
      totalMinor: 246_800,
      itemCount: 2,
      createdAt: '2026-08-12T12:00:00.000Z',
      items: [{
        productId: product.id,
        name: product.name,
        quantity: 2,
        unitPriceMinor: 123_400,
        subtotalMinor: 1,
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(
      createWhatsappOrder([item], crypto.randomUUID(), fulfillment),
    ).rejects.toThrow('pedido de WhatsApp inválido');
  });
});
