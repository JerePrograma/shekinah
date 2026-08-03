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
  options: Readonly<{ saleAmount?: number; availability?: Product['availability'] }> = {},
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
    expect(parsed.items).toEqual([{ productId: 'uno', quantity: 5 }]);
  });

  it('impide superar la cantidad de líneas', () => {
    let cart = emptyCart();
    for (let index = 0; index < MAX_CART_LINES; index += 1) {
      cart = addCartItem(cart, `producto-${index}`);
    }
    expect(addCartItem(cart, 'producto-extra')).toBe(cart);
  });
});
