import { assistedCheckoutConfigured, directCheckoutPaymentConfigured } from '../../../../server/assisted-checkout-capability';
import { advanceDirectCheckout } from '../../../../server/direct-checkout';
import { hmacSha256Hex } from '../../../../server/crypto';
import { HttpError, jsonResponse, methodNotAllowedResponse, requireDatabase, requireSecret, responseFromError } from '../../../../server/http';
import type { PagesFunction } from '../../../../server/platform';
import { assertSameOrigin, requestHasBodyBytes } from '../../../../server/validation';
import { getWebRequestByToken } from '../../../../server/web-order-requests';
import { consumeWebRequestAccess, webRequestLimits } from '../../../../server/web-request-rate-limit';

export const onRequest: PagesFunction = async ({ env, request, params }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  try {
    assertSameOrigin(request, env);
    if (await requestHasBodyBytes(request)) throw new HttpError(400, 'DIRECT_CHECKOUT_BODY_NOT_ALLOWED', 'La preparación no acepta productos ni importes del navegador.');
    const token = params.publicToken;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/u.test(token)) throw new HttpError(404, 'WEB_REQUEST_NOT_FOUND', 'No se encontró la compra.');
    const database = requireDatabase(env);
    const secret = requireSecret(env.ORDER_TOKEN_SECRET, 'ORDER_TOKEN_SECRET_MISSING', 'La protección de pedidos no está configurada.', 32);
    const seconds = Math.floor(Date.now() / 1000);
    const scopes = await webRequestLimits(request, secret, seconds, false);
    // Hasta 50 líneas necesitan 2 lecturas Dux por línea. Se mantiene el cupo
    // global existente y se acota también cada compra y cada IP en 15 minutos.
    const requestHash = await hmacSha256Hex(secret, `direct-prepare:${token}`);
    await consumeWebRequestAccess(database, [
      ...scopes.map(scope => scope.key.startsWith('access:global:') ? scope : { key: `prepare:${scope.key}`, limit: 160 }),
      { key: `prepare:request:${Math.floor(seconds / 900)}:${requestHash}`, limit: 128 },
    ], seconds);
    await advanceDirectCheckout(database, env, token);
    return jsonResponse(await getWebRequestByToken(database, token, assistedCheckoutConfigured(env), Date.now(), directCheckoutPaymentConfigured(env)));
  } catch (error: unknown) { return responseFromError(error); }
};
