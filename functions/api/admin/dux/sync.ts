import { handleAdminRequest } from '../../../../server/admin-request';
import { listCatalogProductDetails } from '../../../../server/catalog-store';
import { isDuxCatalogMigrationRequiredError } from '../../../../server/dux-catalog';
import { persistDuxCatalogSnapshotWhenEnabled } from '../../../../server/dux-catalog-control';
import {
  isDuxInventoryBootstrapPending,
  syncDuxInventory,
} from '../../../../server/dux-inventory';
import { createDuxInventoryReader } from '../../../../server/dux-inventory-reader';
import { jsonResponse, methodNotAllowedResponse } from '../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../server/platform';
import { assertSameOrigin } from '../../../../server/validation';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({
  data,
  env,
  request,
}) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  return handleAdminRequest(request, env, data, 'admin.dux.sync', async (database) => {
    assertSameOrigin(request, env);
    const bootstrapPending = await isDuxInventoryBootstrapPending(database);
    const reader = createDuxInventoryReader(env);
    const summary = await syncDuxInventory(
      database,
      env,
      data.adminIdentity?.actor ?? 'unknown',
      {
        kind: bootstrapPending ? 'initial' : 'manual',
        localProducts: await listCatalogProductDetails(database),
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
        migration: '0015_dux_catalog_snapshot.sql',
      };
    }
    return jsonResponse({ summary, catalog });
  });
};
