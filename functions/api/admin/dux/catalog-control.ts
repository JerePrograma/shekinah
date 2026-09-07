import { handleAdminRequest } from '../../../../server/admin-request';
import { isManualCatalogRetired } from '../../../../server/manual-catalog-retirement';
import { readDuxSnapshotMaxAgeSeconds } from '../../../../server/config';
import { isDuxCatalogBootstrapPendingError, readDuxCatalogSnapshot } from '../../../../server/dux-catalog';
import {
  readDuxCatalogControl,
  requireExpectedDuxCompany,
  updateDuxCatalogControl,
} from '../../../../server/dux-catalog-control';
import { HttpError, jsonResponse, methodNotAllowedResponse } from '../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../server/platform';
import {
  assertExactKeys,
  assertSameOrigin,
  isRecord,
  readJsonBody,
} from '../../../../server/validation';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({
  data,
  env,
  request,
}) => {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return methodNotAllowedResponse(['GET', 'POST']);
  }
  return handleAdminRequest(request, env, data, 'admin.dux.catalog-control', async (database) => {
    requireExpectedDuxCompany(env);
    if (request.method === 'GET') {
      const control = { ...await readDuxCatalogControl(database), manualCatalogRetired: await isManualCatalogRetired(database) };
      try {
        const snapshot = await readDuxCatalogSnapshot(database);
        return jsonResponse({ control, snapshot: {
          itemCount: snapshot.itemCount,
          catalogVersion: snapshot.catalogVersion,
          inventoryRunId: snapshot.inventoryRunId,
          syncedAt: snapshot.syncedAt,
          priceCounts: snapshot.priceCounts,
          checkoutEligibleCount: 0,
          stale: Date.now() - Date.parse(snapshot.syncedAt) > readDuxSnapshotMaxAgeSeconds(env) * 1000,
        }, snapshotError: null });
      } catch (error: unknown) {
        if (!isDuxCatalogBootstrapPendingError(error) && !(error instanceof HttpError && error.code === 'DUX_CATALOG_SNAPSHOT_INVALID')) throw error;
        return jsonResponse({ control, snapshot: null, snapshotError: error instanceof HttpError ? error.code : 'DUX_CATALOG_SNAPSHOT_UNAVAILABLE' });
      }
    }
    assertSameOrigin(request, env);
    const body = await readJsonBody(request, 1_024);
    if (!isRecord(body)) {
      throw new HttpError(400, 'INVALID_REQUEST', 'La solicitud de control no es válida.');
    }
    assertExactKeys(body, ['snapshotCollectionEnabled', 'publicCatalogEnabled', 'publicCutoverEnabled', 'confirmation']);
    if (
      !Object.hasOwn(body, 'snapshotCollectionEnabled') &&
      !Object.hasOwn(body, 'publicCatalogEnabled') &&
      !Object.hasOwn(body, 'publicCutoverEnabled')
    ) {
      throw new HttpError(400, 'INVALID_REQUEST', 'Debe indicarse al menos un cambio de control.');
    }
    const snapshotCollectionEnabled = readOptionalBoolean(
      body.snapshotCollectionEnabled,
      'snapshotCollectionEnabled',
    );
    const publicCutoverEnabled = readOptionalBoolean(
      body.publicCutoverEnabled,
      'publicCutoverEnabled',
    );
    const publicCatalogEnabled = readOptionalBoolean(body.publicCatalogEnabled, 'publicCatalogEnabled');
    if (publicCatalogEnabled === true && body.confirmation !== 'ENABLE_DUX_PUBLIC_CATALOG') {
      throw new HttpError(400, 'DUX_CATALOG_CONFIRMATION_REQUIRED', 'Confirmá la publicación del catálogo Dux; los productos sin precio se mostrarán para consulta y las compras seguirán bloqueadas.');
    }
    if (body.confirmation !== undefined && (publicCatalogEnabled !== true || body.confirmation !== 'ENABLE_DUX_PUBLIC_CATALOG')) {
      throw new HttpError(400, 'INVALID_REQUEST', 'La confirmación no corresponde al cambio solicitado.');
    }
    const control = await updateDuxCatalogControl(
      database,
      data.adminIdentity?.actor ?? 'unknown',
      {
        ...(snapshotCollectionEnabled === undefined ? {} : { snapshotCollectionEnabled }),
        ...(publicCatalogEnabled === undefined ? {} : { publicCatalogEnabled }),
        ...(publicCutoverEnabled === undefined ? {} : { publicCutoverEnabled }),
      },
    );
    return jsonResponse({ control });
  }, { type: 'dux_catalog_control', id: '12862' });
};

function readOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new HttpError(400, 'INVALID_FIELD', `El campo ${field} no es válido.`);
  }
  return value;
}
