import { handleAdminRequest } from '../../../../server/admin-request';
import { readDuxCatalogSchemaDiagnostic } from '../../../../server/dux-catalog-diagnostic';
import { jsonResponse, methodNotAllowedResponse } from '../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../server/platform';
import { assertSameOrigin } from '../../../../server/validation';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({
  data,
  env,
  request,
}) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  return handleAdminRequest(
    request,
    env,
    data,
    'admin.dux.catalog-diagnostic',
    async () => {
      assertSameOrigin(request, env);
      return jsonResponse({ diagnostic: await readDuxCatalogSchemaDiagnostic(env) });
    },
  );
};
