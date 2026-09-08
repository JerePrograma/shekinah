import { handleAdminRequest } from '../../../../../server/admin-request';
import { jsonResponse, methodNotAllowedResponse } from '../../../../../server/http';
import { getMercadoLibreConnectionStatus } from '../../../../../server/mercado-libre';
import { EDITORIAL_SELLER_ID } from '../../../../../server/mercado-libre-editorial-policy';
import { editorialProgress } from '../../../../../server/mercado-libre-editorial-sync';
import type { EditorialRunRow } from '../../../../../server/mercado-libre-editorial-store';
import type { AdminContextData, Env, PagesFunction } from '../../../../../server/platform';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({ request, env, data }) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  return handleAdminRequest(request, env, data, 'admin.mercadolibre.editorial.status', async database => {
    const connection = await getMercadoLibreConnectionStatus(database);
    const configured = Boolean(env.MERCADO_LIBRE_CLIENT_ID && env.MERCADO_LIBRE_CLIENT_SECRET && env.MERCADO_LIBRE_TOKEN_ENCRYPTION_KEY);
    let latest = null;
    try { const row = await database.prepare('SELECT * FROM ml_editorial_runs ORDER BY started_at DESC LIMIT 1').first<EditorialRunRow>();
      latest = row === null ? null : editorialProgress(row); }
    catch (error: unknown) { if (!(error instanceof Error && error.message.includes('no such table: ml_editorial_runs'))) throw error; }
    return jsonResponse({ enabled: env.MERCADO_LIBRE_EDITORIAL_ENABLED === 'true', configured,
      expectedSellerId: EDITORIAL_SELLER_ID, admittedStatuses: ['active', 'paused'], inventoryEnabled: false,
      latest, connection: connection.connected && connection.sellerId === EDITORIAL_SELLER_ID ? connection : { connected: false } });
  });
};
