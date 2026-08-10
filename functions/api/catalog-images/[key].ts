import { serveCatalogImage } from '../../../server/catalog-images';
import { methodNotAllowedResponse, responseFromError } from '../../../server/http';
import type { Env, PagesFunction } from '../../../server/platform';

export const onRequest: PagesFunction<Env, 'key'> = async ({ env, params, request }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowedResponse(['GET', 'HEAD']);
  }
  try {
    const key = typeof params.key === 'string' ? params.key : '';
    return await serveCatalogImage(request, env, key);
  } catch (error: unknown) {
    return responseFromError(error);
  }
};
