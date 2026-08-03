import { verifyCloudflareAccess } from '../../../server/access';
import { requestIdFrom, responseFromError } from '../../../server/http';
import type {
  AdminContextData,
  Env,
  PagesFunction,
} from '../../../server/platform';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async (
  context,
) => {
  try {
    const identity = await verifyCloudflareAccess(context.request, context.env);
    Object.assign(context.data, {
      adminIdentity: identity,
      requestId: requestIdFrom(context.request),
    });
    return context.next();
  } catch (error: unknown) {
    return responseFromError(error);
  }
};
