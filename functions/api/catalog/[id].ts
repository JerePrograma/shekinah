import {
  getBaseCatalogProductDetail,
  getRuntimeCatalogProductDetail,
} from '../../../server/catalog-store';
import { jsonResponse, methodNotAllowedResponse, responseFromError } from '../../../server/http';
import type { PagesFunction } from '../../../server/platform';
export const onRequest: PagesFunction = async ({ env, params, request }) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  try {
    const id = typeof params.id === 'string' ? params.id : '';
    const product = env.DB === undefined
      ? getBaseCatalogProductDetail(id)
      : await getRuntimeCatalogProductDetail(env.DB, env, id);
    return product === null ? jsonResponse({ error: { code: 'PRODUCT_NOT_FOUND', message: 'El producto no existe.' } }, 404) : jsonResponse({ product });
  } catch (error: unknown) { return responseFromError(error); }
};
