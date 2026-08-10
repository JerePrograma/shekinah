import { deleteCatalogProductAndCleanupImages } from '../../../../server/catalog-images';
import { getCatalogProductDetail, patchCatalogProductInventory, updateCatalogProduct } from '../../../../server/catalog-store';
import { handleAdminRequest } from '../../../../server/admin-request';
import { jsonResponse, methodNotAllowedResponse, noContentResponse } from '../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../server/platform';
import { assertSameOrigin, readJsonBody } from '../../../../server/validation';
export const onRequest: PagesFunction<Env, 'id', AdminContextData> = async ({ data, env, params, request }) => {
  const id = typeof params.id === 'string' ? params.id : ''; const target = { type: 'catalog_product', id } as const;
  if (request.method === 'GET') return handleAdminRequest(request, env, data, 'catalog.products.read', async (database) => { const product = await getCatalogProductDetail(database, id); return product === null ? jsonResponse({ error: { code: 'PRODUCT_NOT_FOUND', message: 'El producto no existe.' } }, 404) : jsonResponse({ product }); }, target);
  if (request.method === 'PUT') return handleAdminRequest(request, env, data, 'catalog.products.update', async (database) => { assertSameOrigin(request, env); const body = await readJsonBody(request, 131_072); return jsonResponse({ product: await updateCatalogProduct(database, id, body, data.adminIdentity?.actor ?? 'unknown') }); }, target);
  if (request.method === 'PATCH') return handleAdminRequest(request, env, data, 'catalog.products.patch', async (database) => { assertSameOrigin(request, env); const body = await readJsonBody(request, 2_048); return jsonResponse({ product: await patchCatalogProductInventory(database, id, body, data.adminIdentity?.actor ?? 'unknown') }); }, target);
  if (request.method === 'DELETE') return handleAdminRequest(request, env, data, 'catalog.products.delete', async (database) => { assertSameOrigin(request, env); await deleteCatalogProductAndCleanupImages(database, env.CATALOG_IMAGES, id, data.adminIdentity?.actor ?? 'unknown'); return noContentResponse(); }, target);
  return methodNotAllowedResponse(['GET', 'PUT', 'PATCH', 'DELETE']);
};
