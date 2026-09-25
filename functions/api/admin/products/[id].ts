import { handleAdminRequest } from '../../../../server/admin-request';
import { getAdminDuxProductDetail } from '../../../../server/dux-public-catalog';
import { patchAdminDuxProduct } from '../../../../server/dux-product-admin';
import { parseDuxProductWebPatch } from '../../../../server/dux-product-web-settings';
import { jsonResponse, methodNotAllowedResponse } from '../../../../server/http';
import { rejectManualCatalogOperation } from '../../../../server/manual-catalog-retirement';
import type { AdminContextData, Env, PagesFunction } from '../../../../server/platform';
import { assertSameOrigin, readJsonBody } from '../../../../server/validation';

export const onRequest: PagesFunction<Env, 'id', AdminContextData> = async ({ data, env, params, request }) => {
  const id = typeof params.id === 'string' ? params.id : '';
  const target = { type: 'catalog_product', id } as const;
  if (request.method === 'GET') return handleAdminRequest(request, env, data, 'catalog.products.read', async database => {
    const product = await getAdminDuxProductDetail(database, env, id);
    return product === null ? jsonResponse({ error: { code: 'PRODUCT_NOT_FOUND', message: 'El producto no existe.' } }, 404) : jsonResponse({ product });
  }, target);
  if (request.method === 'PATCH' || request.method === 'DELETE') return handleAdminRequest(request, env, data,
    request.method === 'DELETE' ? 'catalog.products.unpublish' : 'catalog.products.web.update', async database => {
      assertSameOrigin(request, env);
      const patch = request.method === 'DELETE' ? { publicationStatus: 'unpublished' as const }
        : parseDuxProductWebPatch(await readJsonBody(request, 65_536));
      return jsonResponse({ product: await patchAdminDuxProduct(database, env, id, data.adminIdentity!.actor, patch) });
    }, target);
  if (request.method === 'PUT') return handleAdminRequest(request, env, data, 'catalog.products.write_rejected', () => {
    assertSameOrigin(request, env); return rejectManualCatalogOperation();
  }, target);
  return methodNotAllowedResponse(['GET', 'PUT', 'PATCH', 'DELETE']);
};
