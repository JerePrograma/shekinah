import { handleAdminRequest } from '../../../../server/admin-request';
import { isEnabledFlag, readDuxSnapshotMaxAgeSeconds } from '../../../../server/config';
import {
  getDuxInventoryStatus,
  readDuxInventoryConfig,
} from '../../../../server/dux-inventory';
import { jsonResponse, methodNotAllowedResponse } from '../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../server/platform';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({
  data,
  env,
  request,
}) => {
  if (request.method !== 'GET') return methodNotAllowedResponse(['GET']);
  return handleAdminRequest(request, env, data, 'admin.dux.status', async (database) => {
    let accessConfigured = false;
    if (isEnabledFlag(env.DUX_API_ENABLED)) {
      try {
        readDuxInventoryConfig(env);
        accessConfigured = true;
      } catch {
        accessConfigured = false;
      }
    }
    let status: Awaited<ReturnType<typeof getDuxInventoryStatus>> | null = null;
    let migrationReady = true;
    try {
      status = await getDuxInventoryStatus(database, env);
    } catch (error: unknown) {
      if (!isMissingDuxMigration(error)) throw error;
      migrationReady = false;
    }
    const enabled = accessConfigured && migrationReady;
    const blockers = [
      ...(accessConfigured ? [] : ['Upgrade Dux a PRO/FULL + token API requerido']),
      ...(migrationReady ? [] : ['Aplicar la migración D1 0012_dux_authoritative_inventory.sql.']),
      'Dux debe exponer oficialmente unidad, pesabilidad y divisibilidad en una API de lectura.',
      'Dux debe documentar y permitir liberar/finalizar reservas de pedidos creados por API.',
    ];
    return jsonResponse({
      enabled,
      lifecycleReady: false,
      unitSemanticsReady: false,
      tenant: status?.tenant ?? null,
      latestRun: status?.latestRun ?? null,
      counts: {
        inventoryCount: status?.counts.inventory ?? 0,
        mappedCount: status?.counts.mapped ?? 0,
        unmappedCount: status?.counts.unmapped ?? 0,
        ambiguousCount: status?.counts.ambiguous ?? 0,
        staleCount: status?.counts.stale ?? 0,
        errorCount: status?.counts.errors ?? 0,
        absentCount: status?.counts.absent ?? 0,
        checkoutEligibleCount: status?.counts.checkoutEligible ?? 0,
      },
      maxAgeSeconds: status?.maxAgeSeconds ?? readDuxSnapshotMaxAgeSeconds(env),
      blockers,
    });
  });
};

function isMissingDuxMigration(error: unknown): boolean {
  return error instanceof Error && /no such table:\s*dux_(?:tenant_context|sync_runs|inventory_items)/iu.test(error.message);
}
