import { authenticateAdminRequest } from '../../../../server/admin-auth';
import {
  HttpError,
  jsonResponse,
  methodNotAllowedResponse,
  responseFromError,
} from '../../../../server/http';
import type {
  AdminIdentity,
  Env,
  PagesFunction,
} from '../../../../server/platform';

export const onRequest: PagesFunction<Env> = async ({ env, request }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return methodNotAllowedResponse(['GET', 'HEAD']);
  }
  try {
    const identity = await authenticateAdminRequest(request, env);
    return forMethod(request, jsonResponse({
      authenticated: true,
      identity: sessionIdentity(identity),
    }));
  } catch (error: unknown) {
    if (error instanceof HttpError && error.code === 'ACCESS_TOKEN_MISSING') {
      return forMethod(request, jsonResponse({ authenticated: false }));
    }
    return forMethod(request, responseFromError(error));
  }
};

function sessionIdentity(identity: AdminIdentity): Readonly<{
  label: string;
  source: AdminIdentity['authMethod'];
}> {
  return Object.freeze({
    label: identity.authMethod === 'password' ? 'Administrador' : identity.actor,
    source: identity.authMethod,
  });
}

function forMethod(request: Request, response: Response): Response {
  if (request.method !== 'HEAD') return response;
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
