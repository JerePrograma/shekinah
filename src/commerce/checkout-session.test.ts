import type { CartItem } from '../cart/model';
import type { Product } from '../catalog/model';
import { CHECKOUT_IDEMPOTENCY_WINDOW_MS } from './contracts';
import type { CheckoutFulfillment } from './fulfillment';
import {
  clearCheckoutAttempt,
  clearRememberedCheckoutOrder,
  getOrCreateCheckoutIdempotencyKey,
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
});
