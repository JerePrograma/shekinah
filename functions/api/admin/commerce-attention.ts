import { handleAdminRequest } from '../../../server/admin-request';
import { listCommerceAttention } from '../../../server/commerce-attention';
import { HttpError, jsonResponse, methodNotAllowedResponse } from '../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../server/platform';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({ data, env, request }) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  return handleAdminRequest(request, env, data, 'admin.commerce.attention', async (database) => {
    const raw = new URL(request.url).searchParams.get('offset') ?? '0';
    if (!/^\d{1,5}$/u.test(raw) || Number(raw) > 10_000) {
      throw new HttpError(400, 'INVALID_PAGINATION', 'La página solicitada no es válida.');
    }
    return jsonResponse(await listCommerceAttention(database, Number(raw)));
  });
};
