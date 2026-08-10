import { createAdminLogoutCookie } from '../../../../server/admin-auth';
import {
  methodNotAllowedResponse,
  noContentResponse,
  responseFromError,
} from '../../../../server/http';
import type { PagesFunction } from '../../../../server/platform';
import { assertSameOrigin } from '../../../../server/validation';

export const onRequest: PagesFunction = ({ env, request }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  try {
    assertSameOrigin(request, env);
    return noContentResponse(204, {
      'set-cookie': createAdminLogoutCookie(),
    });
  } catch (error: unknown) {
    return responseFromError(error);
  }
};
