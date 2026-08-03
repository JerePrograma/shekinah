import type { CartItem } from '../cart/model';
import type { Product } from '../catalog/model';
import { CHECKOUT_IDEMPOTENCY_WINDOW_MS } from './contracts';
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

describe('intento de checkout', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('reutiliza la clave para el mismo carrito y crea otra al cambiarlo o vencer', async () => {
    const now = 1_800_000_000_000;
    const first = await getOrCreateCheckoutIdempotencyKey([item('uno', 1)], now);
    const repeated = await getOrCreateCheckoutIdempotencyKey([item('uno', 1)], now + 1_000);
    const changed = await getOrCreateCheckoutIdempotencyKey([item('uno', 2)], now + 2_000);
    expect(repeated).toBe(first);
    expect(changed).not.toBe(first);
    const expired = await getOrCreateCheckoutIdempotencyKey(
      [item('uno', 2)],
      now + CHECKOUT_IDEMPOTENCY_WINDOW_MS + 3_000,
    );
    expect(expired).not.toBe(changed);
    clearCheckoutAttempt();
    expect(await getOrCreateCheckoutIdempotencyKey([item('uno', 2)], now + 4_000)).not.toBe(expired);
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
