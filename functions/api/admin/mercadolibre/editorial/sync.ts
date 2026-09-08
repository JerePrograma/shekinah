import { handleAdminRequest } from '../../../../../server/admin-request';
import { jsonResponse, methodNotAllowedResponse } from '../../../../../server/http';
import { advanceEditorialSync } from '../../../../../server/mercado-libre-editorial-sync';
import { readEditorialRunId } from '../../../../../server/mercado-libre-editorial-store';
import type { AdminContextData, Env, PagesFunction } from '../../../../../server/platform';
import { assertSameOrigin, readJsonBody } from '../../../../../server/validation';

export const onRequest: PagesFunction<Env,string,AdminContextData> = async ({request,env,data}) => {
  if(request.method!=='POST')return methodNotAllowedResponse(['POST']);
  return handleAdminRequest(request,env,data,'admin.mercadolibre.editorial.sync',async database=>{
    assertSameOrigin(request,env);const body=await readJsonBody(request,1024);
    return jsonResponse(await advanceEditorialSync(database,env,data.adminIdentity?.actor??'unknown',readEditorialRunId(body)));
  });
};
