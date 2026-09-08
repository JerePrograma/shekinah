import { handleAdminRequest } from '../../../server/admin-request';
import { jsonResponse, methodNotAllowedResponse } from '../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../server/platform';
import { assertSameOrigin } from '../../../server/validation';
import { rejectManualCatalogOperation } from '../../../server/manual-catalog-retirement';
import { readDuxCatalog } from '../../../server/dux-public-catalog';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({ data, env, request }) => {
  if (request.method === 'GET') return handleAdminRequest(request, env, data, 'catalog.products.list', async database => {
    const catalog = await readDuxCatalog(database, env);
    return jsonResponse({ imageStorageConfigured: env.CATALOG_IMAGES !== undefined,
      products: catalog.productDetails, categories: catalog.categories, manualCatalogRetired: true });
  });
  if (request.method === 'POST') return handleAdminRequest(request, env, data, 'catalog.products.create', () => {
    assertSameOrigin(request, env); return rejectManualCatalogOperation();
  }, { type: 'catalog_product' });
  return methodNotAllowedResponse(['GET', 'POST']);
};
