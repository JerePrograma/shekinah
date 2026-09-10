import { handleAdminRequest } from '../../../../../server/admin-request';
import { readAssistedCheckoutAdminState } from '../../../../../server/assisted-checkout-admin-state';
import { parseAssistedCheckoutInput, prepareAssistedCheckout } from '../../../../../server/assisted-checkout';
import { requireEnabledFlag } from '../../../../../server/config';
import { HttpError, jsonResponse, methodNotAllowedResponse } from '../../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../../server/platform';
import { assertExactKeys, assertSameOrigin, isRecord, readJsonBody } from '../../../../../server/validation';

export const onRequest: PagesFunction<Env, 'id', AdminContextData> = async ({ data, env, params, request }) => {
  if (request.method !== 'GET' && request.method !== 'POST') return methodNotAllowedResponse(['GET', 'POST']);
  const rawId = params.id;
  const id = typeof rawId === 'string' ? rawId : rawId[0];
  const action = request.method === 'GET'
    ? 'admin.web_requests.assisted_checkout_state'
    : 'admin.web_requests.assisted_checkout_prepare';
  return handleAdminRequest(request, env, data, action, async (database) => {
    if (typeof id !== 'string' || !/^req_[A-Za-z0-9_-]{20,128}$/u.test(id)) {
      throw new HttpError(404, 'WEB_REQUEST_NOT_FOUND', 'No se encontró la solicitud.');
    }
    if (request.method === 'GET') {
      return jsonResponse(await readAssistedCheckoutAdminState(database, env, id));
    }
    requireEnabledFlag(
      env.ASSISTED_CHECKOUT_ENABLED,
      'ASSISTED_CHECKOUT_DISABLED',
      'La preparación asistida de cobros todavía no está habilitada.',
    );
    assertSameOrigin(request, env);
    const value = await readJsonBody(request, 2_048);
    if (!isRecord(value)) {
      throw new HttpError(400, 'INVALID_ASSISTED_CHECKOUT', 'La preparación asistida no es válida.');
    }
    assertExactKeys(
      value,
      ['duxOrderNumber', 'duxOrderId', 'shippingMinor', 'confirmedExactReservation'],
      'INVALID_ASSISTED_CHECKOUT',
      'La preparación asistida contiene campos no permitidos.',
    );
    if (data.adminIdentity === undefined) {
      throw new HttpError(401, 'ACCESS_TOKEN_MISSING', 'Falta la identidad administrativa.');
    }
    const prepared = await prepareAssistedCheckout(
      database,
      env,
      id,
      parseAssistedCheckoutInput(value),
      data.adminIdentity.actor,
    );
    return jsonResponse(prepared, prepared.created ? 201 : 200);
  }, { type: 'web_request', ...(typeof id === 'string' ? { id } : {}) });
};
