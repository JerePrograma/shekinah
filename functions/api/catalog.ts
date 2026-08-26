import { listRuntimeCatalogProducts } from '../../server/catalog-store';
import {
  jsonResponse,
  methodNotAllowedResponse,
  requireDatabase,
  responseFromError,
} from '../../server/http';
import { projectCatalogProductsForSale } from '../../server/local-inventory';
import type { PagesFunction } from '../../server/platform';

export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  try {
    const products = await listRuntimeCatalogProducts(requireDatabase(env), env);
    return jsonResponse({ products: projectCatalogProductsForSale(products) });
  } catch (error: unknown) {
    return responseFromError(error);
  }
};
