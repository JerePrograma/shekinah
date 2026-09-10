import { jsonResponse, methodNotAllowedResponse, requireDatabase } from '../../../server/http';
import type { PagesFunction } from '../../../server/platform';
import { webOrderRegistrationEnabled } from '../../../server/web-order-capability';

export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  try {
    return jsonResponse({
      enabled: await webOrderRegistrationEnabled(requireDatabase(env), env),
    });
  } catch {
    // La superficie pública no revela por qué falta una capacidad operativa.
    return jsonResponse({ enabled: false });
  }
};
