import { deleteAnalyticsSession } from '../../../server/analytics';
import {
  jsonResponse,
  methodNotAllowedResponse,
  requireDatabase,
  requireSecret,
  responseFromError,
} from '../../../server/http';
import type { PagesFunction } from '../../../server/platform';
import {
  assertExactKeys,
  assertSameOrigin,
  isRecord,
  readJsonBody,
} from '../../../server/validation';

export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  try {
    assertSameOrigin(request, env);
    const database = requireDatabase(env);
    const secret = requireSecret(
      env.ANALYTICS_HMAC_SECRET,
      'ANALYTICS_SECRET_MISSING',
      'La protección analítica no está configurada.',
      32,
    );
    const body = await readJsonBody(request, 4_096);
    if (!isRecord(body)) {
      return jsonResponse(
        { error: { code: 'INVALID_SESSION', message: 'La sesión no es válida.' } },
        400,
      );
    }
    assertExactKeys(
      body,
      ['sessionId'],
      'INVALID_SESSION',
      'La solicitud contiene campos no permitidos.',
    );
    await deleteAnalyticsSession(database, secret, body.sessionId);
    return jsonResponse({ deleted: true });
  } catch (error: unknown) {
    return responseFromError(error);
  }
};
