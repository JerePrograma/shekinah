import { handleAdminRequest } from '../../../server/admin-request';
import { HttpError, jsonResponse, methodNotAllowedResponse } from '../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../server/platform';
import { listWebOrderRequests } from '../../../server/web-order-requests';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({ env, data, request }) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  return handleAdminRequest(request, env, data, 'admin.web_requests.list', async (db) => {
    const offset = new URL(request.url).searchParams.get('offset') ?? '0';
    if (!/^\d{1,5}$/u.test(offset) || Number(offset) > 10_000) throw new HttpError(400, 'INVALID_PAGINATION', 'La página no es válida.');
    return jsonResponse(await listWebOrderRequests(db, Number(offset)));
  });
};
