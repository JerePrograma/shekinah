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

  it('deriva sólo pesos inequívocos', () => {
    expect(deriveUnitWeightGrams({ name: 'Hierba', presentation: '50 g' })).toBe(50);
    expect(deriveUnitWeightGrams({ name: 'Chocolate tableta 150gr' })).toBe(150);
    expect(deriveUnitWeightGrams({ name: 'Pack 2 x 50 gr' })).toBeNull();
    expect(deriveUnitWeightGrams({ name: 'Aceite', presentation: '250 ml' })).toBeNull();
    expect(deriveUnitWeightGrams({ name: 'Nombre 250 gr', presentation: '50 g' })).toBe(50);
  });

  it('aplica límites inclusivos y deriva a cotización manual', () => {
    expect(calculateShippingQuote([{ name: 'Producto', presentation: '1 kg', quantity: 1 }], 'correo_argentino')).toMatchObject({ kind: 'online', shippingMinor: 1_900_000 });
    expect(calculateShippingQuote([{ name: 'Producto', presentation: '1 kg', quantity: 5 }], 'correo_argentino')).toMatchObject({ kind: 'online', shippingMinor: 2_500_000 });
    expect(calculateShippingQuote([{ name: 'Producto', presentation: '1 kg', quantity: 6 }], 'correo_argentino')).toMatchObject({ kind: 'manual', tier: 'manual_over_5kg' });
    expect(calculateShippingQuote([{ name: 'Aceite', presentation: '250 ml', quantity: 1 }], 'correo_argentino')).toMatchObject({ kind: 'manual', tier: 'manual_unknown_weight' });
    expect(calculateShippingQuote([{ name: 'Aceite', presentation: '250 ml', quantity: 1 }], 'coordinated_pickup')).toMatchObject({ kind: 'manual', tier: 'manual_unknown_weight' });
  });
});
