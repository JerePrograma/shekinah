import { handleAdminRequest } from '../../../../../server/admin-request';
import {
  confirmAssistedDuxLifecycle,
  inspectAssistedDuxLifecycle,
} from '../../../../../server/assisted-dux-lifecycle';
import type { AssistedDuxLifecycleAction } from '../../../../../server/assisted-dux-lifecycle';
import { requireCommerceMode, requireMercadoPagoAccessToken } from '../../../../../server/config';
import { HttpError, jsonResponse, methodNotAllowedResponse } from '../../../../../server/http';
import { reconcileMercadoPagoOrder } from '../../../../../server/payment-reconciliation';
import type { AdminContextData, Env, PagesFunction } from '../../../../../server/platform';
import { assertExactKeys, assertSameOrigin, isRecord, readJsonBody } from '../../../../../server/validation';

export const onRequest: PagesFunction<Env, 'id', AdminContextData> = async ({ data, env, params, request }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  const rawId = params.id;
  const id = typeof rawId === 'string' ? rawId : rawId[0];
  return handleAdminRequest(request, env, data, 'admin.order.assisted_dux_lifecycle', async (database) => {
    assertSameOrigin(request, env);
    if (typeof id !== 'string') {
      throw new HttpError(400, 'INVALID_ORDER_ID', 'El pedido no es válido.');
    }
    const value = await readJsonBody(request, 1_024);
    if (!isRecord(value)) {
      throw new HttpError(400, 'INVALID_ASSISTED_DUX_ACTION', 'La confirmación Dux no es válida.');
    }
    assertExactKeys(
      value,
      ['action', 'confirmedInDux'],
      'INVALID_ASSISTED_DUX_ACTION',
      'La confirmación Dux contiene campos no permitidos.',
    );
    if ((value.action !== 'release' && value.action !== 'finalize') || value.confirmedInDux !== true) {
      throw new HttpError(
        400,
        'ASSISTED_DUX_CONFIRMATION_REQUIRED',
        'Confirmá explícitamente que la operación ya fue realizada y verificada en Dux.',
      );
    }
    const identity = data.adminIdentity;
    if (identity === undefined) {
      throw new HttpError(401, 'ACCESS_TOKEN_MISSING', 'Falta la identidad administrativa.');
    }
    const action: AssistedDuxLifecycleAction = value.action;
    const inspection = await inspectAssistedDuxLifecycle(database, id, action);
    let reconciledAt: Date | null = null;
    if (!inspection.completed && inspection.requiresPaymentReconciliation) {
      const mode = requireCommerceMode(env);
      const accessToken = requireMercadoPagoAccessToken(env, mode);
      await reconcileMercadoPagoOrder(database, id, accessToken, mode);
      reconciledAt = new Date();
    }
    return jsonResponse(await confirmAssistedDuxLifecycle(
      database,
      id,
      action,
      identity.actor,
      reconciledAt,
    ));
  }, { type: 'order', ...(typeof id === 'string' ? { id } : {}) });
};
