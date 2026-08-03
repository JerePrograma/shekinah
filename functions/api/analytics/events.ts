import { purgeAnalyticsIfDue } from '../../../server/analytics-retention';
import { parseAnalyticsEvent, storeAnalyticsEvent } from '../../../server/analytics';
import {
  readAnalyticsRetentionDays,
  requireEnabledFlag,
} from '../../../server/config';
import {
  HttpError,
  jsonResponse,
  methodNotAllowedResponse,
  requireDatabase,
  requireSecret,
  responseFromError,
} from '../../../server/http';
import type { PagesFunction } from '../../../server/platform';
import { assertSameOrigin, readJsonBody } from '../../../server/validation';

export const onRequest: PagesFunction = async ({ env, request, waitUntil }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  try {
    requireEnabledFlag(
      env.ANALYTICS_ENABLED,
      'ANALYTICS_DISABLED',
      'La analítica no está habilitada.',
    );
    assertSameOrigin(request, env);
    const retentionDays = readAnalyticsRetentionDays(env);
    if (retentionDays === null) {
      throw new HttpError(
        503,
        'ANALYTICS_RETENTION_MISSING',
        'La retención analítica no está configurada.',
      );
    }
    const database = requireDatabase(env);
    const secret = requireSecret(
      env.ANALYTICS_HMAC_SECRET,
      'ANALYTICS_SECRET_MISSING',
      'La protección analítica no está configurada.',
      32,
    );
    const event = parseAnalyticsEvent(await readJsonBody(request, 8_192));
    const outcome = await storeAnalyticsEvent(database, secret, event);
    waitUntil(
      purgeAnalyticsIfDue(database, retentionDays).catch((error: unknown) => {
        console.error('Analytics retention failed', {
          name: error instanceof Error ? error.name : 'UnknownError',
        });
      }),
    );
    return jsonResponse(
      { accepted: outcome === 'stored' },
      outcome === 'stored' ? 202 : 410,
    );
  } catch (error: unknown) {
    return responseFromError(error);
  }
};
