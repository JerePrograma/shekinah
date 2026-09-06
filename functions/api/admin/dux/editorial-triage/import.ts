import { handleAdminRequest } from '../../../../../server/admin-request';
import { DUX_TRIAGE_BATCH_ID, importDuxEditorialTriage } from '../../../../../server/dux-editorial-triage';
import { HttpError, jsonResponse, methodNotAllowedResponse } from '../../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../../server/platform';
import { assertSameOrigin } from '../../../../../server/validation';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({ request, env, data }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  return handleAdminRequest(request, env, data, 'admin.dux.editorial-triage.import', async (database) => {
    assertSameOrigin(request, env);
    if (request.body !== null) throw new HttpError(400, 'DUX_TRIAGE_IMPORT_BODY_NOT_ALLOWED', 'La importación sólo admite el manifiesto versionado y no recibe datos del cliente.');
    return jsonResponse(await importDuxEditorialTriage(database, env, data.adminIdentity?.actor ?? 'unknown'));
  }, { type: 'dux_editorial_triage', id: DUX_TRIAGE_BATCH_ID });
};
