import { handleAdminRequest } from '../../../../../server/admin-request';
import { listCatalogProductDetails } from '../../../../../server/catalog-store';
import { parseDuxTriageReview, reviewDuxEditorialTriage } from '../../../../../server/dux-editorial-triage';
import { jsonResponse, methodNotAllowedResponse } from '../../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../../server/platform';
import { assertSameOrigin, readJsonBody } from '../../../../../server/validation';

export const onRequest: PagesFunction<Env, string, AdminContextData> = async ({ request, env, data }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  const target: { type: string; id?: string } = { type: 'dux_editorial_triage' };
  return handleAdminRequest(request, env, data, 'admin.dux.editorial-triage.review', async (database) => {
    assertSameOrigin(request, env);
    const review = parseDuxTriageReview(await readJsonBody(request, 8192));
    target.id = review.code;
    return jsonResponse(await reviewDuxEditorialTriage(database, env, data.adminIdentity?.actor ?? 'unknown',
      review, await listCatalogProductDetails(database)));
  }, target);
};
