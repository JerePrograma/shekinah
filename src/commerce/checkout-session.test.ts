import type { CartItem } from '../cart/model';
import type { Product } from '../catalog/model';
import { CHECKOUT_IDEMPOTENCY_WINDOW_MS } from './contracts';
import type { CheckoutFulfillment } from './fulfillment';
import {
  clearCheckoutAttempt,
  clearRememberedCheckoutOrder,
  getOrCreateCheckoutIdempotencyKey,
  getOrCreateWhatsappOrderIdempotencyKey,
  readRememberedCheckoutOrder,
  rememberCheckoutOrder,
  shouldClearCartAfterApproval,
} from './checkout-session';

function item(id: string, quantity: number): CartItem {
  const product: Product = {
    id,
    slug: id,
    path: `/${id}/`,
    name: id,
    categorySlugs: [],
    categoryNames: [],
    price: { amount: 100, currency: 'ARS' },
  };
  return { product, quantity, unitPrice: 100, subtotal: quantity * 100 };
}

const fulfillment: CheckoutFulfillment = {
  method: 'coordinated_pickup',
  fullName: 'Ana Pérez',
  phone: '5491155554444',
  address: 'Calle 123',
  locality: 'CABA',
  province: 'Buenos Aires',
  postalCode: 'C1234ABC',
};

describe('intento de checkout', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('reutiliza la clave para la misma intención y crea otra al cambiarla o vencer', async () => {
    const now = 1_800_000_000_000;
    const first = await getOrCreateCheckoutIdempotencyKey(
      [item('uno', 1)],
      fulfillment,
      now,
    );
    const repeated = await getOrCreateCheckoutIdempotencyKey(
      [item('uno', 1)],
      fulfillment,
      now + 1_000,
    );
    const changedCart = await getOrCreateCheckoutIdempotencyKey(
      [item('uno', 2)],
      fulfillment,
      now + 2_000,
    );
    const changedDelivery = await getOrCreateCheckoutIdempotencyKey(
      [item('uno', 2)],
      { ...fulfillment, locality: 'La Plata' },
      now + 3_000,
    );
    expect(repeated).toBe(first);
    expect(changedCart).not.toBe(first);
    expect(changedDelivery).not.toBe(changedCart);
    expect(window.localStorage.getItem('shekinah.checkout-idempotency.v2')).not.toContain(
      'Ana Pérez',
    );
    const expired = await getOrCreateCheckoutIdempotencyKey(
      [item('uno', 2)],
      { ...fulfillment, locality: 'La Plata' },
      now + CHECKOUT_IDEMPOTENCY_WINDOW_MS + 4_000,
    );
    expect(expired).not.toBe(changedDelivery);
    clearCheckoutAttempt();
    expect(
      await getOrCreateCheckoutIdempotencyKey(
        [item('uno', 2)],
        { ...fulfillment, locality: 'La Plata' },
        now + 5_000,
      ),
    ).not.toBe(expired);
  });

  it('recuerda el pedido y sólo permite limpiar el mismo carrito aprobado', () => {
    const items = [item('uno', 2)];
    const publicToken = 'a'.repeat(64);
    const now = Date.now();
    rememberCheckoutOrder(publicToken, items, now);
    expect(readRememberedCheckoutOrder(now + 100)).toMatchObject({ publicToken });
    expect(shouldClearCartAfterApproval(items, publicToken)).toBe(true);
    expect(shouldClearCartAfterApproval([item('uno', 1)], publicToken)).toBe(false);
    clearRememberedCheckoutOrder();
    expect(readRememberedCheckoutOrder()).toBeNull();
  });

  it('persiste una idempotencia separada para WhatsApp sin guardar PII', async () => {
    const now = 1_800_000_000_000;
    const first = await getOrCreateWhatsappOrderIdempotencyKey(
      [item('uno', 1)],
      fulfillment,
      now,
    );
    expect(
      await getOrCreateWhatsappOrderIdempotencyKey([item('uno', 1)], fulfillment, now + 1_000),
    ).toBe(first);

    const changedFulfillment = await getOrCreateWhatsappOrderIdempotencyKey(
      [item('uno', 1)],
      { ...fulfillment, locality: 'La Plata' },
      now + 2_000,
    );
    expect(changedFulfillment).not.toBe(first);
    const stored = window.localStorage.getItem('shekinah.whatsapp-order-idempotency.v1');
    expect(stored).not.toBeNull();
    expect(stored).not.toContain('Ana Pérez');
    expect(stored).not.toContain('5491155554444');
    expect(stored).not.toContain('Calle 123');

    expect(
      await getOrCreateWhatsappOrderIdempotencyKey(
        [item('uno', 2)],
        fulfillment,
        now + 3_000,
      ),
    ).not.toBe(changedFulfillment);
  });

  it('conserva la idempotencia de WhatsApp en memoria si localStorage no está disponible', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage bloqueado', 'SecurityError');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage bloqueado', 'SecurityError');
    });
    try {
      const now = 1_800_000_000_000;
      const first = await getOrCreateWhatsappOrderIdempotencyKey(
        [item('sin-storage', 1)],
        fulfillment,
        now,
      );
      const repeated = await getOrCreateWhatsappOrderIdempotencyKey(
        [item('sin-storage', 1)],
        fulfillment,
        now + 1_000,
      );
      expect(repeated).toBe(first);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
