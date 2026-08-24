import { createMercadoLibreAuthorization } from '../../../../server/mercado-libre';
import { handleAdminRequest } from '../../../../server/admin-request';
import { jsonResponse, methodNotAllowedResponse } from '../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../server/platform';
import { assertSameOrigin } from '../../../../server/validation';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({
  data,
  env,
  request,
}) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  return handleAdminRequest(request, env, data, 'admin.mercadolibre.authorize', async (database) => {
    assertSameOrigin(request, env);
    const authorization = await createMercadoLibreAuthorization(
      database,
      env,
      data.adminIdentity?.actor ?? 'unknown',
    );
    return jsonResponse(authorization);
  });
};
