import { handleAdminRequest } from '../../../server/admin-request';
import { readCommerceReadiness } from '../../../server/commerce-readiness';
import { jsonResponse, methodNotAllowedResponse } from '../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../server/platform';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({
  data,
  env,
  request,
}) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  return handleAdminRequest(
    request,
    env,
    data,
    'admin.commerce.readiness',
    async (database) => jsonResponse(await readCommerceReadiness(database, env)),
  );
};
