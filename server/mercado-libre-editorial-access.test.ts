import { editorialApiGet, requireMercadoLibreEditorial } from './mercado-libre-editorial-access';
import { createTestD1 } from '../src/test/d1';

const env = { DUX_COMPANY_ID: '12862', MERCADO_LIBRE_EDITORIAL_ENABLED: 'true',
  MERCADO_LIBRE_CATALOG_ENABLED: 'false', MERCADO_LIBRE_EXPECTED_SELLER_ID: '445638367',
  MERCADO_LIBRE_CLIENT_ID: '123456789' };

it('abre sólo el acceso editorial del contexto autorizado y conserva el bloqueo transaccional', () => {
  expect(() => requireMercadoLibreEditorial(env)).not.toThrow();
  expect(() => requireMercadoLibreEditorial({ ...env, MERCADO_LIBRE_EDITORIAL_ENABLED: 'false' })).toThrow();
  expect(() => requireMercadoLibreEditorial({ ...env, MERCADO_LIBRE_CATALOG_ENABLED: 'true' })).toThrow();
  expect(() => requireMercadoLibreEditorial({ ...env, MERCADO_LIBRE_EXPECTED_SELLER_ID: '123' })).toThrow();
  expect(() => requireMercadoLibreEditorial({ ...env, MERCADO_LIBRE_CLIENT_ID: '7373984348988262' })).toThrow();
});

it.each(['/user-products/123/stock', '/orders/123', '/users/123/items/search',
  'https://evil.test/users/me', '//evil.test/items/bulk'])('rechaza el recurso no editorial %s antes de acceder a secretos', async path => {
  const db = createTestD1();
  try { await expect(editorialApiGet(db.database, env, path)).rejects.toMatchObject({ code: 'ML_EDITORIAL_RESOURCE_FORBIDDEN' }); }
  finally { db.close(); }
});
