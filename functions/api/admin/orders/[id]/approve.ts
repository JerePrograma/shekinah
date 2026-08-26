import { handleAdminRequest } from '../../../../../server/admin-request';
import {
  HttpError,
  jsonResponse,
  methodNotAllowedResponse,
} from '../../../../../server/http';
import type {
  AdminContextData,
  Env,
  PagesFunction,
} from '../../../../../server/platform';
import { assertSameOrigin } from '../../../../../server/validation';
import { resolveWhatsappOrder } from '../../../../../server/whatsapp-orders';

export const onRequest: PagesFunction<Env, 'id', AdminContextData> = async ({
  data,
  env,
  params,
  request,
}) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  const rawId = params.id;
  const id = typeof rawId === 'string' ? rawId : rawId[0];
  return handleAdminRequest(
    request,
    env,
    data,
    'admin.order.approve',
    async (database) => {
      assertSameOrigin(request, env);
      if (typeof id !== 'string') {
        throw new HttpError(400, 'INVALID_ORDER_ID', 'El pedido no es válido.');
      }
      const result = await resolveWhatsappOrder(
          database,
          id,
          'approved',
          data.adminIdentity?.actor ?? 'unknown',
        );
      return jsonResponse(result);
    },
    typeof id === 'string' ? { type: 'order', id } : { type: 'order' },
  );
};
