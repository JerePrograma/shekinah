import { completeMercadoLibreAuthorization } from '../../../../server/mercado-libre';
import { rejectDirectMercadoLibreIntegration } from '../../../../server/config';
import {
  HttpError,
  methodNotAllowedResponse,
  requireDatabase,
  responseFromError,
} from '../../../../server/http';
import type { PagesFunction } from '../../../../server/platform';

export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  try {
    rejectDirectMercadoLibreIntegration();
    const url = new URL(request.url);
    const error = url.searchParams.get('error');
    if (error !== null) {
      throw new HttpError(400, 'MERCADO_LIBRE_OAUTH_REJECTED', 'La autorización de Mercado Libre fue rechazada.');
    }
    const code = url.searchParams.get('code') ?? '';
    const state = url.searchParams.get('state') ?? '';
    await completeMercadoLibreAuthorization(requireDatabase(env), env, code, state);
    return new Response(null, {
      status: 303,
      headers: {
        location: '/admin?mercadolibre=connected',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      },
    });
  } catch (error: unknown) {
    return responseFromError(error);
  }
};
