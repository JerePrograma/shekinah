import { isEnabledFlag } from '../../../../server/config';
import { constantTimeEqual } from '../../../../server/crypto';
import { isDuxCatalogMigrationRequiredError } from '../../../../server/dux-catalog';
import { persistDuxCatalogSnapshotWhenEnabled } from '../../../../server/dux-catalog-control';
import {
  isDuxInventoryBootstrapPending,
  syncDuxInventory,
} from '../../../../server/dux-inventory';
import { createDuxInventoryReader } from '../../../../server/dux-inventory-reader';
import { recordDuxFreshnessBreach } from '../../../../server/dux-freshness';
import {
  HttpError,
  jsonResponse,
  methodNotAllowedResponse,
  requireDatabase,
  requireSecret,
  responseFromError,
} from '../../../../server/http';
import type { PagesFunction } from '../../../../server/platform';

const AUTHORIZATION_PREFIX = 'Bearer ';

export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  try {
    const authorization = request.headers.get('authorization') ?? '';
    const fromCloudflare = typeof env.DUX_CRON_SECRET === 'string' && env.DUX_CRON_SECRET.length >= 32 &&
      constantTimeEqual(authorization, `${AUTHORIZATION_PREFIX}${env.DUX_CRON_SECRET}`);
    const configuredSecret = fromCloudflare ? env.DUX_CRON_SECRET : requireSecret(
      env.DUX_SCHEDULER_SECRET,
      'DUX_SCHEDULER_SECRET_MISSING',
      'La reconciliación programada de Dux no está configurada.',
    );
    if (!constantTimeEqual(authorization, `${AUTHORIZATION_PREFIX}${configuredSecret}`)) {
      throw new HttpError(
        401,
        'SCHEDULER_UNAUTHORIZED',
        'La autenticación del scheduler no es válida.',
      );
    }
    if (!isEnabledFlag(env.DUX_API_ENABLED)) {
      return jsonResponse({ status: 'disabled' });
    }

    const database = requireDatabase(env);
    if (await isDuxInventoryBootstrapPending(database)) {
      throw new HttpError(
        409,
        'DUX_INITIAL_SYNC_REQUIRED',
        'La primera sincronización Dux debe ejecutarse desde el backoffice antes de habilitar el scheduler.',
      );
    }
    const reader = createDuxInventoryReader(env);
    await recordDuxFreshnessBreach(database, fromCloudflare ? 'scheduler:cloudflare-cron' : 'scheduler:github-actions');
    const summary = await syncDuxInventory(
      database,
      env,
      fromCloudflare ? 'scheduler:cloudflare-cron' : 'scheduler:github-actions',
      {
        kind: 'scheduled',
        localProducts: [],
        client: reader,
      },
    );
    let catalog: unknown;
    try {
      const controlled = await persistDuxCatalogSnapshotWhenEnabled(
        database,
        env,
        summary.runId,
        reader.takeCatalogItems(),
        summary.completedAt,
      );
      catalog = controlled.status === 'persisted'
        ? controlled.summary
        : { status: 'disabled', reason: 'snapshot_collection_disabled' };
    } catch (error: unknown) {
      if (!isDuxCatalogMigrationRequiredError(error)) throw error;
      catalog = {
        status: 'pending_migration',
        migration: '0017_dux_complete_public_catalog.sql',
      };
    }
    return jsonResponse({
      status: 'completed',
      summary,
      catalog,
    });
  } catch (error: unknown) {
    return responseFromError(error);
  }
};
