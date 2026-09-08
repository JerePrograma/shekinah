import { handleAdminRequest } from '../../../../server/admin-request';
import { getPublicCatalogProductDetail } from '../../../../server/dux-public-catalog';
import { jsonResponse, methodNotAllowedResponse } from '../../../../server/http';
import { rejectManualCatalogOperation } from '../../../../server/manual-catalog-retirement';
import type { AdminContextData, Env, PagesFunction } from '../../../../server/platform';
import { assertSameOrigin } from '../../../../server/validation';

export const onRequest: PagesFunction<Env, 'id', AdminContextData> = async ({ data, env, params, request }) => {
  const id = typeof params.id === 'string' ? params.id : '';
  const target = { type: 'catalog_product', id } as const;
  if (request.method === 'GET') return handleAdminRequest(request, env, data, 'catalog.products.read', async database => {
    const product = await getPublicCatalogProductDetail(database, env, id);
    return product === null ? jsonResponse({ error: { code: 'PRODUCT_NOT_FOUND', message: 'El producto no existe.' } }, 404) : jsonResponse({ product });
  }, target);
  if (['PUT', 'PATCH', 'DELETE'].includes(request.method)) return handleAdminRequest(request, env, data, 'catalog.products.write_rejected', () => {
    assertSameOrigin(request, env); return rejectManualCatalogOperation();
  }, target);
  return methodNotAllowedResponse(['GET', 'PUT', 'PATCH', 'DELETE']);
};
