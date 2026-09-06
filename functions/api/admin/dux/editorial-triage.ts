import { handleAdminRequest } from '../../../../server/admin-request';
import { listCatalogProductDetails } from '../../../../server/catalog-store';
import { listDuxEditorialTriage } from '../../../../server/dux-editorial-triage';
import { jsonResponse, methodNotAllowedResponse } from '../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../server/platform';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({ request, env, data }) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  return handleAdminRequest(request, env, data, 'admin.dux.editorial-triage.list', async (database) =>
    jsonResponse(await listDuxEditorialTriage(database, env, new URL(request.url), await listCatalogProductDetails(database))));
};
