import { HttpError, jsonResponse, methodNotAllowedResponse, requireDatabase, requireSecret, responseFromError } from '../../../../server/http';
import type { PagesFunction } from '../../../../server/platform';
import { getWebRequestByToken } from '../../../../server/web-order-requests';
import { consumeWebRequestAccess, webRequestLimits } from '../../../../server/web-request-rate-limit';

export const onRequest: PagesFunction = async ({ env, request, params }) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  try {
    const token = params.publicToken;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/u.test(token)) {
      throw new HttpError(404, 'WEB_REQUEST_NOT_FOUND', 'No se encontró la solicitud.');
    }
    const db = requireDatabase(env);
    const secret = requireSecret(env.ORDER_TOKEN_SECRET, 'ORDER_TOKEN_SECRET_MISSING', 'La protección de solicitudes no está configurada.');
    const seconds = Math.floor(Date.now() / 1000);
    await consumeWebRequestAccess(db, await webRequestLimits(request, secret, seconds, false), seconds);
    return jsonResponse(await getWebRequestByToken(db, token));
  } catch (error: unknown) { return responseFromError(error); }
};
