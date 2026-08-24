import { listCatalogProductDetails } from '../../../../server/catalog-store';
import { isEnabledFlag } from '../../../../server/config';
import { constantTimeEqual } from '../../../../server/crypto';
import {
  HttpError,
  jsonResponse,
  methodNotAllowedResponse,
  requireDatabase,
  requireSecret,
  responseFromError,
} from '../../../../server/http';
import { syncMercadoLibreCatalog } from '../../../../server/mercado-libre-catalog';
import { reconcileExpiredMercadoLibreReservations } from '../../../../server/mercado-libre-inventory';
import type { PagesFunction } from '../../../../server/platform';

const AUTHORIZATION_PREFIX = 'Bearer ';

export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  try {
    const configuredSecret = requireSecret(
      env.MERCADO_LIBRE_SCHEDULER_SECRET,
      'MERCADO_LIBRE_SCHEDULER_SECRET_MISSING',
      'La reconciliación programada no está configurada.',
    );
    const authorization = request.headers.get('authorization') ?? '';
    if (!constantTimeEqual(authorization, `${AUTHORIZATION_PREFIX}${configuredSecret}`)) {
      throw new HttpError(401, 'SCHEDULER_UNAUTHORIZED', 'La autenticación del scheduler no es válida.');
    }
    if (!isEnabledFlag(env.MERCADO_LIBRE_CATALOG_ENABLED)) {
      return jsonResponse({ status: 'disabled' });
    }

    const database = requireDatabase(env);
    const summary = await syncMercadoLibreCatalog(database, env, 'scheduler:github-actions', {
      kind: 'full',
      localProducts: await listCatalogProductDetails(database),
    });
    const reservations = await reconcileExpiredMercadoLibreReservations(database, env, 100);
    return jsonResponse({ status: 'completed', summary, reservations });
  } catch (error: unknown) {
    return responseFromError(error);
  }
};
