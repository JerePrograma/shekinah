import { getServerCatalog, recalculateCart } from './catalog';

const fulfillment = {
  method: 'coordinated_pickup',
  fullName: 'Ana Pérez',
  phone: '5491155554444',
  address: 'Calle 123',
  locality: 'CABA',
  province: 'Buenos Aires',
  postalCode: 'C1234ABC',
};

describe('catálogo canónico de Functions', () => {
  it('conserva identidad y precios pero bloquea toda disponibilidad estática', () => {
    const catalog = getServerCatalog();
    expect(catalog).toHaveLength(510);
    expect(catalog.every((product) => product.available === false)).toBe(true);
    expect(catalog.every((product) => Number.isSafeInteger(product.unitPriceMinor) && product.unitPriceMinor > 0))
      .toBe(true);
    const product = catalog[0];
    if (product === undefined) throw new Error('El catálogo generado está vacío.');
    expect(() => recalculateCart({
      idempotencyKey: crypto.randomUUID(),
      fulfillment,
      items: [{ productId: product.id, quantity: 1 }],
    })).toThrowError(expect.objectContaining({ code: 'PRODUCT_UNAVAILABLE' }));
  });

  it('rechaza campos de checkout manipulados antes de consultar disponibilidad', () => {
    const product = getServerCatalog()[0];
    if (product === undefined) throw new Error('El catálogo generado está vacío.');
    const idempotencyKey = crypto.randomUUID();
    expect(() => recalculateCart({
      idempotencyKey,
      fulfillment,
      shippingMinor: 1,
      items: [{ productId: product.id, quantity: 1 }],
    })).toThrowError(expect.objectContaining({ code: 'INVALID_CHECKOUT' }));
    expect(() => recalculateCart({
      idempotencyKey,
      fulfillment,
      items: [{ productId: product.id, quantity: 1, price: 1 }],
    })).toThrowError(expect.objectContaining({ code: 'INVALID_CART_LINE' }));
  });
});
