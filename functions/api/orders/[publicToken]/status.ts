import { sha256Hex } from '../../../../server/crypto';
import {
  HttpError,
  jsonResponse,
  methodNotAllowedResponse,
  requireDatabase,
  responseFromError,
} from '../../../../server/http';
import { getOrderByPublicTokenHash } from '../../../../server/orders';
import type { PagesFunction } from '../../../../server/platform';

export const onRequest: PagesFunction = async ({ env, params, request }) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  try {
    const tokenValue = params.publicToken;
    const token = typeof tokenValue === 'string' ? tokenValue : tokenValue?.[0];
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/iu.test(token)) {
      throw notFound();
    }
    const database = requireDatabase(env);
    const tokenHash = await sha256Hex(token.toLocaleLowerCase('en'));
    const order = await getOrderByPublicTokenHash(database, tokenHash);
    if (order === null) throw notFound();
    return jsonResponse({
      status: order.status,
      currency: order.currency,
      totalMinor: order.total_minor,
      itemCount: order.item_count,
      updatedAt: order.updated_at,
    });
  } catch (error: unknown) {
    return responseFromError(error);
  }
};

function notFound(): HttpError {
  return new HttpError(404, 'ORDER_NOT_FOUND', 'No se encontró el estado solicitado.');
}
