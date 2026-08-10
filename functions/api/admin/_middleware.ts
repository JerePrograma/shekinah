import { authenticateAdminRequest } from '../../../server/admin-auth';
import { requestIdFrom, responseFromError } from '../../../server/http';
import type {
  AdminContextData,
  Env,
  PagesFunction,
} from '../../../server/platform';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async (
  context,
) => {
  if (isPublicAuthEndpoint(context.request)) return context.next();
  try {
    const identity = await authenticateAdminRequest(context.request, context.env);
    Object.assign(context.data, {
      adminIdentity: identity,
      requestId: requestIdFrom(context.request),
    });
    return context.next();
  } catch (error: unknown) {
    return responseFromError(error);
  }
};

const publicAuthPaths = new Set([
  '/api/admin/auth/login',
  '/api/admin/auth/logout',
  '/api/admin/auth/session',
]);

function isPublicAuthEndpoint(request: Request): boolean {
  return publicAuthPaths.has(new URL(request.url).pathname);
}
