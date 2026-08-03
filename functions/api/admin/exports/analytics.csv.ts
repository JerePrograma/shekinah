import { exportAnalyticsCsv, parseAdminRange } from '../../../../server/admin';
import { handleAdminRequest } from '../../../../server/admin-request';
import { methodNotAllowedResponse } from '../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../server/platform';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({ data, env, request }) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  return handleAdminRequest(request, env, data, 'admin.analytics.export', async (database) =>
    new Response(await exportAnalyticsCsv(database, parseAdminRange(request)), {
      headers: {
        'cache-control': 'no-store',
        'content-disposition': 'attachment; filename="shekinah-analytics.csv"',
        'content-type': 'text/csv; charset=utf-8',
        'x-content-type-options': 'nosniff',
      },
    }),
  );
};
