import { handleAdminRequest } from '../../../../server/admin-request';
import { listCatalogProductDetails } from '../../../../server/catalog-store';
import {
  isDuxInventoryBootstrapPending,
  syncDuxInventory,
} from '../../../../server/dux-inventory';
import { createDuxInventoryReader } from '../../../../server/dux-inventory-reader';
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
    const bootstrapPending = await isDuxInventoryBootstrapPending(database);
    const summary = await syncDuxInventory(
      database,
      env,
      data.adminIdentity?.actor ?? 'unknown',
      {
        kind: bootstrapPending ? 'initial' : 'manual',
        localProducts: await listCatalogProductDetails(database),
        client: createDuxInventoryReader(env),
      },
    );
    return jsonResponse({ summary });
  });
};
