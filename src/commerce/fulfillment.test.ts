import {
  calculateShippingQuote,
  deriveUnitWeightGrams,
  validateFulfillment,
} from './fulfillment';

const fulfillment = {
  method: 'correo_argentino',
  fullName: '  Ana   Pérez ',
  phone: '+54 9 11 5555-4444',
  address: 'Calle 123',
  locality: 'CABA',
  province: 'Buenos Aires',
  postalCode: 'c1234abc',
};

describe('fulfillment y envío', () => {
  it('normaliza datos y rechaza campos adicionales', () => {
    expect(validateFulfillment(fulfillment).value).toEqual({
      method: 'correo_argentino',
      fullName: 'Ana Pérez',
      phone: '5491155554444',
      address: 'Calle 123',
      locality: 'CABA',
      province: 'Buenos Aires',
      postalCode: 'C1234ABC',
    });
    expect(validateFulfillment({ ...fulfillment, shippingMinor: 1 }).value).toBeNull();
  });

  it('rechaza formas inválidas y controles de texto engañosos', () => {
    for (const value of [null, [], '', { ...fulfillment, phone: 123 }, { ...fulfillment, address: 'Calle\n123' }]) {
      expect(validateFulfillment(value).value).toBeNull();
    }
    expect(validateFulfillment({ ...fulfillment, fullName: 'Ana\u202E Pérez' }).errors.fullName).toBeDefined();
  });

  it('deriva sólo pesos inequívocos', () => {
    for (const [text, grams] of [
      ['1 g', 1], ['999 g', 999], ['1000 g', 1_000], ['0,5 kg', 500],
      ['1 kg', 1_000], ['1 kgs', 1_000], ['1 kilo', 1_000], ['1 kilos', 1_000],
      ['1 kilogramo', 1_000], ['1 kilogramos', 1_000], ['1 gr', 1], ['1 grs', 1],
      ['1 gramo', 1], ['1 gramos', 1],
    ] as const) {
      expect(deriveUnitWeightGrams({ name: 'Producto', presentation: text })).toBe(grams);
    }
    expect(deriveUnitWeightGrams({ name: 'Chocolate tableta 150gr' })).toBe(150);
    for (const product of [
      { name: 'Pack 2 x 500 g' },
      { name: '2 x 500 g' },
      { name: 'Producto 250 g o 500 g' },
      { name: 'Pack 2 unidades' },
      { name: 'Nombre sin peso' },
      { name: 'Aceite', presentation: '250 ml' },
      { name: 'Producto', presentation: '' },
      { name: 'Producto', presentation: '0 g' },
      { name: 'Producto', presentation: '1,5 g' },
      { name: 'Nombre 250 gr', presentation: '50 g' },
    ]) {
      expect(deriveUnitWeightGrams(product)).toBeNull();
    }
  });

  it('aplica límites inclusivos y deriva a cotización manual', () => {
    for (const [grams, kind, shippingMinor] of [
      [1, 'online', 1_900_000],
      [999, 'online', 1_900_000],
      [1_000, 'online', 1_900_000],
      [1_001, 'online', 2_500_000],
      [4_999, 'online', 2_500_000],
      [5_000, 'online', 2_500_000],
      [5_001, 'manual', 0],
    ] as const) {
      expect(calculateShippingQuote([{ name: 'Producto', presentation: `${grams} g`, quantity: 1 }], 'correo_argentino')).toMatchObject({ kind, shippingMinor, totalWeightGrams: grams });
    }
    expect(calculateShippingQuote([{ name: 'Aceite', presentation: '250 ml', quantity: 1 }], 'correo_argentino')).toMatchObject({ kind: 'manual', tier: 'manual_unknown_weight' });
    expect(calculateShippingQuote([{ name: 'Producto', presentation: '1 g', quantity: 0 }], 'correo_argentino')).toMatchObject({ kind: 'manual', tier: 'manual_unknown_weight' });
    expect(calculateShippingQuote([{ name: 'Producto', presentation: '2 g', quantity: Number.MAX_SAFE_INTEGER }], 'correo_argentino')).toMatchObject({ kind: 'manual', tier: 'manual_unknown_weight' });
    expect(calculateShippingQuote([{ name: 'Producto', presentation: '1 g', quantity: 99 }], 'correo_argentino')).toMatchObject({ kind: 'online', totalWeightGrams: 99 });
    expect(calculateShippingQuote([
      { name: 'Producto', presentation: '500 g', quantity: 1 },
      { name: 'Producto', presentation: '500 g', quantity: 1 },
    ], 'correo_argentino')).toMatchObject({ kind: 'online', totalWeightGrams: 1_000 });
  });

  it('mantiene el retiro coordinado en ARS 0 sin depender del peso', () => {
    expect(calculateShippingQuote([{ name: 'Aceite', presentation: '250 ml', quantity: 1 }], 'coordinated_pickup')).toEqual({
      kind: 'online', tier: 'coordinated_pickup', shippingMinor: 0, totalWeightGrams: null,
    });
    expect(calculateShippingQuote([{ name: 'Producto', presentation: '5001 g', quantity: 1 }], 'coordinated_pickup')).toEqual({
      kind: 'online', tier: 'coordinated_pickup', shippingMinor: 0, totalWeightGrams: 5_001,
    });
  });
});
