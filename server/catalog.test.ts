import { deriveUnitWeightGrams } from '../src/commerce/fulfillment';
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

function deterministicProduct() {
  const product = getServerCatalog().find((candidate) => {
    const grams = deriveUnitWeightGrams(candidate);
    return candidate.available && grams !== null && grams <= 5_000;
  });
  if (product === undefined) {
    throw new Error('El catálogo no contiene productos disponibles con peso determinístico.');
  }
  return product;
}

describe('catálogo canónico de Functions', () => {
  it('recalcula precio y envío, y rechaza manipulación', () => {
    const available = deterministicProduct();
    const idempotencyKey = crypto.randomUUID();
    const cart = recalculateCart({
      idempotencyKey,
      fulfillment,
      items: [{ productId: available.id, quantity: 2 }],
    });
    expect(cart).toMatchObject({
      currency: 'ARS',
      itemCount: 2,
      productsTotalMinor: available.unitPriceMinor * 2,
      shippingMinor: 0,
      totalMinor: available.unitPriceMinor * 2,
    });
    expect(() => recalculateCart({
      idempotencyKey,
      fulfillment,
      shippingMinor: 1,
      items: [{ productId: available.id, quantity: 1 }],
    })).toThrowError(expect.objectContaining({ code: 'INVALID_CHECKOUT' }));
    expect(() => recalculateCart({
      idempotencyKey,
      fulfillment,
      items: [{ productId: available.id, quantity: 1, price: 1 }],
    })).toThrowError(expect.objectContaining({ code: 'INVALID_CART_LINE' }));
  });

  it('integra Correo Argentino con el peso determinístico del catálogo', () => {
    const product = deterministicProduct();
    const unitWeight = deriveUnitWeightGrams(product);
    if (unitWeight === null) throw new Error('El producto de prueba perdió su peso determinístico.');
    const cart = recalculateCart({
      idempotencyKey: crypto.randomUUID(),
      fulfillment: { ...fulfillment, method: 'correo_argentino' },
      items: [{ productId: product.id, quantity: 1 }],
    });
    expect(cart.totalWeightGrams).toBe(unitWeight);
    expect(cart.shippingMinor).toBe(unitWeight <= 1_000 ? 1_900_000 : 2_500_000);
  });

  it('bloquea el conflicto de peso para Correo pero conserva el retiro', () => {
    const product = getServerCatalog().find(({ id }) => id === 'naranja-en-rodajas-deshidratada-x-250-gr');
    expect(product).toBeDefined();
    if (product === undefined) return;
    expect(deriveUnitWeightGrams(product)).toBeNull();
    expect(recalculateCart({
      idempotencyKey: crypto.randomUUID(),
      fulfillment,
      items: [{ productId: product.id, quantity: 1 }],
    })).toMatchObject({ shippingMinor: 0, totalWeightGrams: null });
    expect(() => recalculateCart({
      idempotencyKey: crypto.randomUUID(),
      fulfillment: { ...fulfillment, method: 'correo_argentino' },
      items: [{ productId: product.id, quantity: 1 }],
    })).toThrowError(expect.objectContaining({ code: 'MANUAL_SHIPPING_WEIGHT_REQUIRED' }));
  });

  it('rechaza duplicados, inexistentes y cantidades fuera del contrato', () => {
    const product = deterministicProduct();
    expect(recalculateCart({
      idempotencyKey: crypto.randomUUID(), fulfillment,
      items: [{ productId: product.id, quantity: 99 }],
    })).toMatchObject({ itemCount: 99, productsTotalMinor: product.unitPriceMinor * 99 });
    expect(() => recalculateCart({
      idempotencyKey: crypto.randomUUID(), fulfillment,
      items: [{ productId: product.id, quantity: 1 }, { productId: product.id, quantity: 1 }],
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_PRODUCT' }));
    expect(() => recalculateCart({
      idempotencyKey: crypto.randomUUID(), fulfillment,
      items: [{ productId: 'producto-inexistente', quantity: 1 }],
    })).toThrowError(expect.objectContaining({ code: 'PRODUCT_NOT_FOUND' }));
    expect(() => recalculateCart({
      idempotencyKey: crypto.randomUUID(), fulfillment,
      items: [{ productId: product.id, quantity: 100 }],
    })).toThrowError();
  });
});
