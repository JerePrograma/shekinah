import { describe, expect, it } from 'vitest';

import { shouldShowPublicMaintenance } from './maintenance';

describe('mantenimiento público', () => {
  it('inhabilita las rutas públicas en producción', () => {
    expect(shouldShowPublicMaintenance('home', true)).toBe(true);
    expect(shouldShowPublicMaintenance('catalog', true)).toBe(true);
    expect(shouldShowPublicMaintenance('cart', true)).toBe(true);
    expect(shouldShowPublicMaintenance('paymentSuccess', true)).toBe(true);
    expect(shouldShowPublicMaintenance('product', true)).toBe(true);
  });

  it('mantiene accesible la administración y no afecta pruebas/desarrollo', () => {
    expect(shouldShowPublicMaintenance('admin', true)).toBe(false);
    expect(shouldShowPublicMaintenance('home', false)).toBe(false);
  });
});
