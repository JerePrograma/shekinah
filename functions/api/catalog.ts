import { getBaseCatalogProducts, listRuntimeCatalogProducts } from '../../server/catalog-store';
import { jsonResponse, methodNotAllowedResponse, responseFromError } from '../../server/http';
import type { PagesFunction } from '../../server/platform';
export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  try { return jsonResponse({ products: env.DB === undefined ? getBaseCatalogProducts() : await listRuntimeCatalogProducts(env.DB, env) }); }
  catch (error: unknown) { return responseFromError(error); }
};
