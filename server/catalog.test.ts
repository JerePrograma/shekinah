import { getServerCatalog, recalculateCart } from './catalog';

describe('catálogo canónico de Functions', () => {
  it('recalcula el precio de servidor y rechaza campos, duplicados e IDs inexistentes', () => {
    const available = getServerCatalog().find((product) => product.available);
    if (available === undefined) throw new Error('El catálogo no contiene productos disponibles.');
    const idempotencyKey = crypto.randomUUID();
    const cart = recalculateCart({
      idempotencyKey,
      items: [{ productId: available.id, quantity: 2 }],
    });
    expect(cart).toMatchObject({
      currency: 'ARS',
      itemCount: 2,
      totalMinor: available.unitPriceMinor * 2,
    });
    expect(() => recalculateCart({
      idempotencyKey,
      items: [{ productId: available.id, quantity: 1, price: 1 }],
    })).toThrowError(expect.objectContaining({ code: 'INVALID_CART_LINE' }));
    expect(() => recalculateCart({
      idempotencyKey,
      items: [
        { productId: available.id, quantity: 1 },
        { productId: available.id, quantity: 1 },
      ],
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_PRODUCT' }));
    expect(() => recalculateCart({
      idempotencyKey,
      items: [{ productId: 'producto-que-no-existe', quantity: 1 }],
    })).toThrowError(expect.objectContaining({ code: 'PRODUCT_NOT_FOUND' }));
  });
});
