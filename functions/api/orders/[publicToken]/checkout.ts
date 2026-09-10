import { createOrRecoverAssistedPreference } from '../../../../server/assisted-payment';
import {
  requireCommerceMode,
  requireEnabledFlag,
  requireMercadoPagoAccessToken,
  requirePublicSiteUrl,
} from '../../../../server/config';
import {
  HttpError,
  jsonResponse,
  methodNotAllowedResponse,
  requireDatabase,
  requireSecret,
  responseFromError,
} from '../../../../server/http';
import type { PagesFunction } from '../../../../server/platform';
import { assertSameOrigin, requestHasBodyBytes } from '../../../../server/validation';
import { consumeWebRequestAccess, webRequestLimits } from '../../../../server/web-request-rate-limit';

export const onRequest: PagesFunction = async ({ env, params, request }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  try {
    requireEnabledFlag(env.COMMERCE_ENABLED, 'COMMERCE_DISABLED', 'El checkout todavía no está habilitado.');
    requireEnabledFlag(
      env.ASSISTED_CHECKOUT_ENABLED,
      'ASSISTED_CHECKOUT_DISABLED',
      'El checkout asistido todavía no está habilitado.',
    );
    assertSameOrigin(request, env);
    if (await requestHasBodyBytes(request)) {
      throw new HttpError(400, 'ASSISTED_CHECKOUT_BODY_NOT_ALLOWED', 'Este checkout no acepta carrito ni importes enviados por el navegador.');
    }
    const rawToken: string | readonly string[] | undefined = params.publicToken;
    let firstToken: string | undefined;
    if (typeof rawToken === 'string') {
      firstToken = rawToken;
    } else if (rawToken !== undefined) {
      firstToken = rawToken[0];
    }
    const publicToken = firstToken?.toLocaleLowerCase('en');
    if (publicToken === undefined || !/^[a-f0-9]{64}$/u.test(publicToken)) {
      throw new HttpError(404, 'ORDER_NOT_FOUND', 'No se encontró el pedido.');
    }
    const database = requireDatabase(env);
    const orderTokenSecret = requireSecret(
      env.ORDER_TOKEN_SECRET,
      'ORDER_TOKEN_SECRET_MISSING',
      'La protección de pedidos no está configurada.',
      32,
    );
    const seconds = Math.floor(Date.now() / 1000);
    await consumeWebRequestAccess(
      database,
      await webRequestLimits(request, orderTokenSecret, seconds, false),
      seconds,
    );
    const mode = requireCommerceMode(env);
    const accessToken = requireMercadoPagoAccessToken(env, mode);
    void requireSecret(
      env.MERCADO_PAGO_WEBHOOK_SECRET,
      'WEBHOOK_SECRET_MISSING',
      'La firma de webhooks no está configurada.',
      32,
    );
    const result = await createOrRecoverAssistedPreference(database, publicToken, {
      accessToken,
      mode,
      siteUrl: requirePublicSiteUrl(env),
    });
    return jsonResponse({ checkoutUrl: result.checkoutUrl, totalMinor: result.totalMinor }, result.created ? 201 : 200);
  } catch (error: unknown) {
    return responseFromError(error);
  }
};
