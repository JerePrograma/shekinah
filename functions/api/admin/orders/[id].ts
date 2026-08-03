import { getAdminOrderWithFulfillment } from '../../../../server/admin-fulfillment';
import { handleAdminRequest } from '../../../../server/admin-request';
import {
  HttpError,
  jsonResponse,
  methodNotAllowedResponse,
} from '../../../../server/http';
import type {
  AdminContextData,
  Env,
  PagesFunction,
} from '../../../../server/platform';

export const onRequest: PagesFunction<Env, 'id', AdminContextData> = async ({
  data,
  env,
  params,
  request,
}) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  const rawId = params.id;
  const id = typeof rawId === 'string' ? rawId : rawId[0];
  return handleAdminRequest(
    request,
    env,
    data,
    'admin.order.read',
    async (database) => {
      if (typeof id !== 'string') {
        throw new HttpError(400, 'INVALID_ORDER_ID', 'El pedido no es válido.');
      }
      const result = await getAdminOrderWithFulfillment(database, id);
      if (result === null) {
        throw new HttpError(404, 'ORDER_NOT_FOUND', 'No se encontró el pedido.');
      }
      return jsonResponse(result);
    },
    typeof id === 'string' ? { type: 'order', id } : { type: 'order' },
  );
};
