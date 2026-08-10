import {
  removeCatalogProductImage,
  replaceCatalogProductImage,
  requireCatalogImageBucket,
} from '../../../../../server/catalog-images';
import { handleAdminRequest } from '../../../../../server/admin-request';
import { jsonResponse, methodNotAllowedResponse } from '../../../../../server/http';
import type {
  AdminContextData,
  Env,
  PagesFunction,
} from '../../../../../server/platform';
import { assertSameOrigin } from '../../../../../server/validation';

export const onRequest: PagesFunction<Env, 'id', AdminContextData> = async ({
  data,
  env,
  params,
  request,
}) => {
  const id = typeof params.id === 'string' ? params.id : '';
  const target = { type: 'catalog_product_image', id } as const;
  if (request.method === 'PUT') {
    return handleAdminRequest(request, env, data, 'catalog.products.image.replace', async (database) => {
      assertSameOrigin(request, env);
      const bucket = requireCatalogImageBucket(env);
      const product = await replaceCatalogProductImage(
        database,
        bucket,
        id,
        data.adminIdentity?.actor ?? 'unknown',
        request,
      );
      return jsonResponse({ product });
    }, target);
  }
  if (request.method === 'DELETE') {
    return handleAdminRequest(request, env, data, 'catalog.products.image.delete', async (database) => {
      assertSameOrigin(request, env);
      const product = await removeCatalogProductImage(
        database,
        env.CATALOG_IMAGES,
        id,
        data.adminIdentity?.actor ?? 'unknown',
      );
      return jsonResponse({ product });
    }, target);
  }
  return methodNotAllowedResponse(['PUT', 'DELETE']);
};
