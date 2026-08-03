import { parseAnalyticsEvent, storeAnalyticsEvent } from '../../../server/analytics';
import { requireEnabledFlag } from '../../../server/config';
import {
  jsonResponse,
  methodNotAllowedResponse,
  requireDatabase,
  requireSecret,
  responseFromError,
} from '../../../server/http';
import type { PagesFunction } from '../../../server/platform';
import { assertSameOrigin, readJsonBody } from '../../../server/validation';

export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  try {
    requireEnabledFlag(
      env.ANALYTICS_ENABLED,
      'ANALYTICS_DISABLED',
      'La analítica no está habilitada.',
    );
    assertSameOrigin(request, env);
    const database = requireDatabase(env);
    const secret = requireSecret(
      env.ANALYTICS_HMAC_SECRET,
      'ANALYTICS_SECRET_MISSING',
      'La protección analítica no está configurada.',
      32,
    );
    const event = parseAnalyticsEvent(await readJsonBody(request, 8_192));
    const outcome = await storeAnalyticsEvent(database, secret, event);
    return jsonResponse(
      { accepted: outcome === 'stored' },
      outcome === 'stored' ? 202 : 410,
    );
  } catch (error: unknown) {
    return responseFromError(error);
  }
};
