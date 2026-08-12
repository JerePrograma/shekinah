import { createWhatsappOrder } from '../../../server/whatsapp-orders';
import {
  jsonResponse,
  methodNotAllowedResponse,
  requireDatabase,
  responseFromError,
} from '../../../server/http';
import type { PagesFunction } from '../../../server/platform';
import { assertSameOrigin, readJsonBody } from '../../../server/validation';

export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  try {
    assertSameOrigin(request, env);
    const created = await createWhatsappOrder(
      requireDatabase(env),
      await readJsonBody(request, 32_768),
    );
    return jsonResponse(created.response, created.created ? 201 : 200);
  } catch (error: unknown) {
    return responseFromError(error);
  }
};
