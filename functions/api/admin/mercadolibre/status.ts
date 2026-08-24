import { getMercadoLibreCatalogStatus } from '../../../../server/mercado-libre-catalog';
import { handleAdminRequest } from '../../../../server/admin-request';
import { jsonResponse, methodNotAllowedResponse } from '../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../server/platform';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({
  data,
  env,
  request,
}) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  return handleAdminRequest(request, env, data, 'admin.mercadolibre.status', async (database) =>
    jsonResponse(await getMercadoLibreCatalogStatus(database, env)),
  );
};
