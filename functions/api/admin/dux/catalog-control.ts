import { handleAdminRequest } from '../../../../server/admin-request';
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
      return jsonResponse({ control: await readDuxCatalogControl(database) });
    }
    assertSameOrigin(request, env);
    const body = await readJsonBody(request, 1_024);
    if (!isRecord(body)) {
      throw new HttpError(400, 'INVALID_REQUEST', 'La solicitud de control no es válida.');
    }
    assertExactKeys(body, ['snapshotCollectionEnabled', 'publicCutoverEnabled']);
    if (
      !Object.hasOwn(body, 'snapshotCollectionEnabled') &&
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
    const control = await updateDuxCatalogControl(
      database,
      data.adminIdentity?.actor ?? 'unknown',
      {
        ...(snapshotCollectionEnabled === undefined ? {} : { snapshotCollectionEnabled }),
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
