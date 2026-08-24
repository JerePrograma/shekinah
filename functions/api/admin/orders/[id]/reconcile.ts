import { requireCommerceMode } from '../../../../../server/config';
import { handleAdminRequest } from '../../../../../server/admin-request';
import {
  HttpError,
  jsonResponse,
  methodNotAllowedResponse,
  requireSecret,
} from '../../../../../server/http';
import { reconcileMercadoPagoOrder } from '../../../../../server/payment-reconciliation';
import type {
  AdminContextData,
  Env,
  PagesFunction,
} from '../../../../../server/platform';
import { assertSameOrigin } from '../../../../../server/validation';

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
    'admin.order.reconcile',
    async (database) => {
      assertSameOrigin(request, env);
      if (typeof id !== 'string') {
        throw new HttpError(400, 'INVALID_ORDER_ID', 'El pedido no es válido.');
      }
      const accessToken = requireSecret(
        env.MERCADO_PAGO_ACCESS_TOKEN,
        'PAYMENT_CREDENTIALS_MISSING',
        'Mercado Pago no está configurado.',
        20,
      );
      return jsonResponse(
        await reconcileMercadoPagoOrder(
          database,
          id,
          accessToken,
          requireCommerceMode(env),
          env,
        ),
      );
    },
    typeof id === 'string' ? { type: 'order', id } : { type: 'order' },
  );
};
