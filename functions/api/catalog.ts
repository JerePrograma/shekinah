import { getBaseCatalogProducts, listRuntimeCatalogProducts } from '../../server/catalog-store';
import { jsonResponse, methodNotAllowedResponse, responseFromError } from '../../server/http';
import { projectCatalogProductsForSale } from '../../server/local-inventory';
import type { PagesFunction } from '../../server/platform';

export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  try {
    const products = env.DB === undefined
      ? getBaseCatalogProducts()
      : await listRuntimeCatalogProducts(env.DB, env);
    return jsonResponse({ products: projectCatalogProductsForSale(products) });
  } catch (error: unknown) {
    return responseFromError(error);
  }
};
