import { getPublicCatalogProductDetail } from '../../../server/dux-public-catalog';
import {
  jsonResponse,
  methodNotAllowedResponse,
  requireDatabase,
  responseFromError,
} from '../../../server/http';
import type { PagesFunction } from '../../../server/platform';

export const onRequest: PagesFunction = async ({ env, params, request }) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  try {
    const id = typeof params.id === 'string' ? params.id : '';
    const product = await getPublicCatalogProductDetail(
      requireDatabase(env),
      env,
      id,
    );
    return product === null
      ? jsonResponse({
          error: {
            code: 'PRODUCT_NOT_FOUND',
            message: 'El producto no existe.',
          },
        }, 404)
      : jsonResponse({ product });
  } catch (error: unknown) {
    return responseFromError(error);
  }
};
