import { handleAdminRequest } from '../../../../../server/admin-request';
import { listCatalogProductDetails } from '../../../../../server/catalog-store';
import {
  getApprovedDuxEditorialManifest,
  importApprovedDuxEditorialLinks,
} from '../../../../../server/dux-editorial-links';
import { HttpError, jsonResponse, methodNotAllowedResponse } from '../../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../../server/platform';
import { assertSameOrigin } from '../../../../../server/validation';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({
  data,
  env,
  request,
}) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  const manifest = getApprovedDuxEditorialManifest();
  return handleAdminRequest(
    request,
    env,
    data,
    'admin.dux.editorial-links.import',
    async (database) => {
      assertSameOrigin(request, env);
      if (request.body !== null) {
        throw new HttpError(
          400,
          'DUX_EDITORIAL_IMPORT_BODY_NOT_ALLOWED',
          'La importación usa únicamente el manifiesto versionado; no admite mappings enviados por el cliente.',
        );
      }
      const result = await importApprovedDuxEditorialLinks(
        database,
        env,
        data.adminIdentity?.actor ?? 'unknown',
        await listCatalogProductDetails(database),
      );
      return jsonResponse(result);
    },
    { type: 'dux_editorial_import', id: manifest.batchId },
  );
};
