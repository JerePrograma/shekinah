import { handleAdminRequest } from '../../../../../server/admin-request';
import { jsonResponse, methodNotAllowedResponse } from '../../../../../server/http';
import { getEditorialReview, reviewEditorialAssociation } from '../../../../../server/mercado-libre-editorial-review';
import type { AdminContextData, Env, PagesFunction } from '../../../../../server/platform';
import { assertSameOrigin, readJsonBody, readSafeText } from '../../../../../server/validation';

export const onRequest: PagesFunction<Env,string,AdminContextData> = async ({request,env,data}) => {
  if(request.method==='GET')return handleAdminRequest(request,env,data,'admin.mercadolibre.editorial.review.read',async database=>{
    const query=new URL(request.url).searchParams;
    return jsonResponse(await getEditorialReview(database,env,readSafeText(query.get('code'),'code',180),query.get('itemId')));
  });
  if(request.method==='POST')return handleAdminRequest(request,env,data,'admin.mercadolibre.editorial.review.decide',async database=>{
    assertSameOrigin(request,env);
    return jsonResponse(await reviewEditorialAssociation(database,env,data.adminIdentity?.actor??'unknown',await readJsonBody(request,8192)));
  });
  return methodNotAllowedResponse(['GET','POST']);
};
