import { handleAdminRequest } from '../../../../../server/admin-request';
import { HttpError, jsonResponse, methodNotAllowedResponse } from '../../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../../server/platform';
import { assertExactKeys, assertSameOrigin, isRecord, readJsonBody } from '../../../../../server/validation';
import { resolveWebOrderRequest } from '../../../../../server/web-order-requests';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({ env, data, request, params }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  const id = typeof params.id === 'string' ? params.id : '';
  return handleAdminRequest(request, env, data, 'admin.web_requests.resolve', async (db) => {
    assertSameOrigin(request, env);
    const value = await readJsonBody(request, 1024);
    if (!isRecord(value) || (value.status !== 'accepted' && value.status !== 'rejected')) {
      throw new HttpError(400, 'INVALID_WEB_REQUEST_RESOLUTION', 'La resolución no es válida.');
    }
    assertExactKeys(value, ['status']);
    if (data.adminIdentity === undefined) throw new HttpError(401, 'ACCESS_TOKEN_MISSING', 'Falta la identidad administrativa.');
    return jsonResponse(await resolveWebOrderRequest(db, id, value.status, data.adminIdentity.sub));
  }, { type: 'web_request', id });
};
