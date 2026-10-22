import { handleAdminRequest } from '../../../server/admin-request';
import { HttpError, jsonResponse, methodNotAllowedResponse } from '../../../server/http';
import { listMarketingCampaigns, writeMarketingCampaign } from '../../../server/marketing';
import type { AdminContextData, Env, PagesFunction } from '../../../server/platform';
import { assertSameOrigin, assertUuid, isRecord, readJsonBody } from '../../../server/validation';

export const onRequest: PagesFunction<Env,string,AdminContextData> = async ({ data, env, request }) => {
  if (!['GET','POST','PUT'].includes(request.method)) return methodNotAllowedResponse(['GET','POST','PUT']);
  const target: { type: string; id?: string } = { type: 'marketing_campaign' };
  return handleAdminRequest(request,env,data,`marketing.campaigns.${request.method === 'GET' ? 'list' : request.method === 'POST' ? 'create' : 'update'}`,
    async database => {
      if (request.method === 'GET') return jsonResponse({ campaigns: await listMarketingCampaigns(database) });
      assertSameOrigin(request,env);
      const body = await readJsonBody(request);
      if (request.method === 'POST') {
        const header = request.headers.get('Idempotency-Key');
        const creationKey = header === null ? undefined : assertUuid(header,'Idempotency-Key');
        const campaign = await writeMarketingCampaign(database,body,undefined,new Date(),creationKey);
        target.id = campaign.id;
        return jsonResponse({ campaign },201);
      }
      if (!isRecord(body) || typeof body.id !== 'string') throw new HttpError(400,'INVALID_MARKETING_CAMPAIGN','Falta la identidad de la campaña.');
      const { id,...input } = body;
      target.id = id;
      return jsonResponse({ campaign: await writeMarketingCampaign(database,input,id) });
    }, target);
};
