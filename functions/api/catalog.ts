import { readPublicCatalog } from '../../server/dux-public-catalog';
import { CATALOG_API_SCHEMA_VERSION } from '../../src/catalog/model';
import {
  jsonResponse,
  methodNotAllowedResponse,
  requireDatabase,
  responseFromError,
} from '../../server/http';
import type { PagesFunction } from '../../server/platform';

export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  try {
    const catalog = await readPublicCatalog(requireDatabase(env), env);
    return jsonResponse({
      schemaVersion: CATALOG_API_SCHEMA_VERSION,
      products: catalog.products,
      categories: catalog.categories,
      source: catalog.source,
    });
  } catch (error: unknown) {
    return responseFromError(error);
  }
};
