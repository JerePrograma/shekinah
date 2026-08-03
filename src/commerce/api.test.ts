import type { CartItem } from '../cart/model';
import type { Product } from '../catalog/model';
import { createCheckoutPreference, getPublicOrderStatus } from './api';
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
});
