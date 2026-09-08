import { handleAdminRequest } from '../../../../server/admin-request';
import { HttpError, jsonResponse, methodNotAllowedResponse } from '../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../server/platform';
import { getAdminWebOrderRequest } from '../../../../server/web-order-requests';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({ env, data, request, params }) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  return handleAdminRequest(request, env, data, 'admin.web_requests.detail', async (db) => {
    if (typeof params.id !== 'string') throw new HttpError(404, 'WEB_REQUEST_NOT_FOUND', 'No se encontró la solicitud.');
    return jsonResponse(await getAdminWebOrderRequest(db, params.id));
  });
};
