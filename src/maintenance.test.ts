import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { shouldShowPublicMaintenance } from './maintenance';

beforeEach(() => vi.stubEnv('VITE_PUBLIC_MAINTENANCE_ENABLED', undefined));
afterEach(() => vi.unstubAllEnvs());

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

  it('sólo abre el sitio con la desactivación explícita del mantenimiento', () => {
    expect(shouldShowPublicMaintenance('home', true, 'false')).toBe(false);
    for (const value of ['true', '', 'FALSE', '0']) {
      expect(shouldShowPublicMaintenance('home', true, value)).toBe(true);
      expect(shouldShowPublicMaintenance('admin', true, value)).toBe(false);
    }
  });
});
