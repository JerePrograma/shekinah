import { createCatalogProduct, listCatalogProductDetails } from '../../../server/catalog-store';
import { handleAdminRequest } from '../../../server/admin-request';
import { jsonResponse, methodNotAllowedResponse } from '../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../server/platform';
import { assertSameOrigin, readJsonBody } from '../../../server/validation';
export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({ data, env, request }) => {
  if (request.method === 'GET') return handleAdminRequest(request, env, data, 'catalog.products.list', async (database) => jsonResponse({ products: await listCatalogProductDetails(database) }));
  if (request.method === 'POST') return handleAdminRequest(request, env, data, 'catalog.products.create', async (database) => {
    assertSameOrigin(request, env); const body = await readJsonBody(request, 131_072); const actor = data.adminIdentity?.actor ?? 'unknown';
    return jsonResponse({ product: await createCatalogProduct(database, body, actor) }, 201);
  }, { type: 'catalog_product' });
  return methodNotAllowedResponse(['GET', 'POST']);
};
