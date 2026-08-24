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
import {
  hasMercadoLibreInventoryReservation,
  releaseMercadoLibreInventory,
} from '../../../../../server/mercado-libre-inventory';

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
    'admin.order.reject',
    async (database) => {
      assertSameOrigin(request, env);
      if (typeof id !== 'string') {
        throw new HttpError(400, 'INVALID_ORDER_ID', 'El pedido no es válido.');
      }
      if (await hasMercadoLibreInventoryReservation(database, id)) {
        await releaseMercadoLibreInventory(database, env, id);
      }
      return jsonResponse(
        await resolveWhatsappOrder(
          database,
          id,
          'rejected',
          data.adminIdentity?.actor ?? 'unknown',
        ),
      );
    },
    typeof id === 'string' ? { type: 'order', id } : { type: 'order' },
  );
};
