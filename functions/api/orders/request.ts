import { readDuxCatalogSnapshot } from '../../../server/dux-catalog';
import { HttpError, jsonResponse, methodNotAllowedResponse, requireDatabase, requireSecret, responseFromError } from '../../../server/http';
import type { PagesFunction } from '../../../server/platform';
import { assertExactKeys, assertSameOrigin, isRecord, readJsonBody } from '../../../server/validation';
import { webOrderRegistrationEnabled } from '../../../server/web-order-capability';
import { createWebOrderRequest, parseWebRequestIdentity, parseWebRequestInput, recoverWebOrderRequest } from '../../../server/web-order-requests';
import { consumeWebRequestAccess, webRequestLimits } from '../../../server/web-request-rate-limit';

export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  try {
    assertSameOrigin(request, env);
    const value = await readJsonBody(request, 32_768);
    if (!isRecord(value) || (value.mode !== 'create' && value.mode !== 'recover')) {
      throw new HttpError(400, 'INVALID_WEB_REQUEST', 'La operación no es válida.');
    }
    const input = value.mode === 'create' ? parseWebRequestInput(value) : null;
    if (value.mode === 'recover') assertExactKeys(value, ['mode', 'idempotencyKey', 'ownerSecret']);
    const identity = input ?? parseWebRequestIdentity(value);
    const database = requireDatabase(env);
    if (input !== null && !(await webOrderRegistrationEnabled(database, env))) {
      throw new HttpError(503, 'WEB_ORDERS_UNAVAILABLE', 'El registro de solicitudes no está disponible temporalmente.');
    }
    const secret = requireSecret(env.ORDER_TOKEN_SECRET, 'ORDER_TOKEN_SECRET_MISSING', 'La protección de solicitudes no está configurada.');
    const now = new Date();
    const seconds = Math.floor(now.getTime() / 1000);
    await consumeWebRequestAccess(database, await webRequestLimits(request, secret, seconds, false), seconds);
    if (input === null) return jsonResponse(await recoverWebOrderRequest(database, identity, secret));
    const result = await createWebOrderRequest(database, input, secret,
      () => readDuxCatalogSnapshot(database), await webRequestLimits(request, secret, seconds, true), now);
    return jsonResponse(result.receipt, result.created ? 201 : 200);
  } catch (error: unknown) { return responseFromError(error); }
};
