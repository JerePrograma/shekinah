import type { Product } from '../catalog/model';
import {
  addCartItem,
  clearCart,
  emptyCart,
  MAX_CART_LINES,
  MAX_CART_QUANTITY,
  parseStoredCart,
  parseStoredCartJson,
  removeCartItem,
  setCartItemQuantity,
  summarizeCart,
} from './model';

const product = (
  id: string,
  amount = 100,
  options: Readonly<{
    saleAmount?: number;
    availability?: Product['availability'];
    stockQuantity?: number;
  }> = {},
): Product => Object.freeze({
  id,
  slug: id,
  path: `/${id}/`,
  name: id,
  categorySlugs: Object.freeze([]),
  categoryNames: Object.freeze([]),
  price: Object.freeze({ amount, currency: 'ARS' }),
  ...(options.saleAmount === undefined
    ? {}
    : { salePrice: Object.freeze({ amount: options.saleAmount, currency: 'ARS' as const }) }),
  ...(options.availability === undefined ? {} : { availability: options.availability }),
  ...(options.stockQuantity === undefined ? {} : { stockQuantity: options.stockQuantity }),
});

describe('carrito', () => {
  it('agrega, limita, actualiza, elimina, vacía y resume con precio efectivo', () => {
    const products = [product('uno', 250, { saleAmount: 200 })];
    const added = addCartItem(emptyCart(), 'uno', 2);
    expect(added.items).toEqual([{ productId: 'uno', quantity: 2 }]);
    const capped = addCartItem(added, 'uno', MAX_CART_QUANTITY);
    expect(capped.items[0]?.quantity).toBe(MAX_CART_QUANTITY);
    expect(addCartItem(capped, 'uno')).toBe(capped);
    const updated = setCartItemQuantity(capped, 'uno', 3);
    expect(summarizeCart(updated, products)).toMatchObject({ itemCount: 3, total: 600 });
    expect(setCartItemQuantity(updated, 'uno', 0)).toBe(updated);
    expect(removeCartItem(updated, 'uno').items).toHaveLength(0);
    expect(clearCart(updated).items).toHaveLength(0);
  });

  it('tolera JSON corrupto y reconcilia versiones, duplicados e inexistentes', () => {
    const products = [product('uno'), product('agotado', 100, { availability: 'unavailable' })];
    expect(parseStoredCartJson('{', products).items).toHaveLength(0);
    expect(parseStoredCart({ version: 0, items: [] }, products).items).toHaveLength(0);
    const parsed = parseStoredCart({
      version: 1,
      updatedAt: 'inválido',
      items: [
        { productId: 'uno', quantity: 2 },
        { productId: 'uno', quantity: 3 },
        { productId: 'inexistente', quantity: 1 },
        { productId: 'agotado', quantity: 1 },
        { productId: 'uno', quantity: -1 },
      ],
    }, products);
    expect(parsed.items).toEqual([
      { productId: 'uno', quantity: 5 },
      { productId: 'agotado', quantity: 1 },
    ]);
  });

  it('impide superar la cantidad de líneas', () => {
    let cart = emptyCart();
    for (let index = 0; index < MAX_CART_LINES; index += 1) {
      cart = addCartItem(cart, `producto-${index}`);
    }
    expect(addCartItem(cart, 'producto-extra')).toBe(cart);
  });

  it('reconcilia altas, bajas, disponibilidad y cambios de precio del catálogo runtime', () => {
    const dynamic = product('producto-dinamico', 1_000);
    const stored = parseStoredCart({
      version: 1,
      updatedAt: '2026-08-10T00:00:00.000Z',
      items: [{ productId: dynamic.id, quantity: 2 }],
    }, [dynamic]);
    expect(summarizeCart(stored, [dynamic])).toMatchObject({ itemCount: 2, total: 2_000 });
    expect(summarizeCart(stored, [product(dynamic.id, 1_250)])).toMatchObject({
      itemCount: 2,
      total: 2_500,
    });
    expect(parseStoredCart(stored, []).items).toHaveLength(0);
    expect(parseStoredCart(stored, [product(dynamic.id, 1_000, {
      availability: 'unavailable',
    })]).items).toEqual([{ productId: dynamic.id, quantity: 2 }]);
  });

  it('limita y reconcilia cantidades con el stock controlado sin afectar productos legacy', () => {
    const tracked = product('controlado', 100, { stockQuantity: 3 });
    const depleted = product('sin-stock', 100, { stockQuantity: 0 });
    const legacy = product('legacy');
    const stored = parseStoredCart({
      version: 1,
      updatedAt: '2026-08-10T00:00:00.000Z',
      items: [
        { productId: tracked.id, quantity: 9 },
        { productId: depleted.id, quantity: 1 },
        { productId: legacy.id, quantity: MAX_CART_QUANTITY },
      ],
    }, [tracked, depleted, legacy]);

    expect(stored.items).toEqual([
      { productId: tracked.id, quantity: 9 },
      { productId: depleted.id, quantity: 1 },
      { productId: legacy.id, quantity: MAX_CART_QUANTITY },
    ]);
    const added = addCartItem(emptyCart(), tracked.id, 3, 3);
    expect(addCartItem(added, tracked.id, 1, 3)).toBe(added);
    expect(setCartItemQuantity(added, tracked.id, 4, 3)).toBe(added);
    const legacyTimestamp = new Date('2026-08-10T12:00:00.000Z');
    expect(addCartItem(emptyCart(), legacy.id, 1, legacyTimestamp).updatedAt)
      .toBe(legacyTimestamp.toISOString());
  });
});
