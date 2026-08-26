import { handleAdminRequest } from '../../../../server/admin-request';
import { rejectDirectMercadoLibreIntegration } from '../../../../server/config';
import { listCatalogProductDetails } from '../../../../server/catalog-store';
import { jsonResponse, methodNotAllowedResponse } from '../../../../server/http';
import { syncMercadoLibreCatalog } from '../../../../server/mercado-libre-catalog';
import { reconcileExpiredMercadoLibreReservations } from '../../../../server/mercado-libre-inventory';
import type { AdminContextData, Env, PagesFunction } from '../../../../server/platform';
import { assertSameOrigin } from '../../../../server/validation';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({
  data,
  env,
  request,
}) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  return handleAdminRequest(request, env, data, 'admin.mercadolibre.sync', async (database) => {
    rejectDirectMercadoLibreIntegration();
    assertSameOrigin(request, env);
    const summary = await syncMercadoLibreCatalog(database, env, data.adminIdentity?.actor ?? 'unknown', {
      kind: 'full',
      localProducts: await listCatalogProductDetails(database),
    });
    const reservations = await reconcileExpiredMercadoLibreReservations(database, env, 100);
    return jsonResponse({ summary, reservations });
  });
};
