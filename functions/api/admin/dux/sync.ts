import { handleAdminRequest } from '../../../../server/admin-request';
import { listCatalogProductDetails } from '../../../../server/catalog-store';
import { syncDuxInventory } from '../../../../server/dux-inventory';
import { jsonResponse, methodNotAllowedResponse } from '../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../server/platform';
import { assertSameOrigin } from '../../../../server/validation';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({
  data,
  env,
  request,
}) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  return handleAdminRequest(request, env, data, 'admin.dux.sync', async (database) => {
    assertSameOrigin(request, env);
    const summary = await syncDuxInventory(
      database,
      env,
      data.adminIdentity?.actor ?? 'unknown',
      {
        kind: 'manual',
        localProducts: await listCatalogProductDetails(database),
      },
    );
    return jsonResponse({ summary });
  });
};
