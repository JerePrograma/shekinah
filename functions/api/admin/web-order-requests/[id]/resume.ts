import { handleAdminRequest } from '../../../../../server/admin-request';
import { readAssistedCheckoutAdminState } from '../../../../../server/assisted-checkout-admin-state';
import { resumeDirectCheckout } from '../../../../../server/direct-checkout';
import { HttpError, jsonResponse, methodNotAllowedResponse } from '../../../../../server/http';
import type { AdminContextData, Env, PagesFunction } from '../../../../../server/platform';
import { assertSameOrigin, requestHasBodyBytes } from '../../../../../server/validation';

export const onRequest:PagesFunction<Env,'id',AdminContextData>=async({data,env,params,request})=>{
  if(request.method!=='POST') return methodNotAllowedResponse(['POST']);
  const id=params.id;
  return handleAdminRequest(request,env,data,'admin.web_requests.direct_checkout_resume',async(database)=>{
    assertSameOrigin(request,env);
    if(typeof id!=='string'||!/^req_[A-Za-z0-9_-]{20,128}$/u.test(id)) throw new HttpError(404,'WEB_REQUEST_NOT_FOUND','No se encontró la compra.');
    if(await requestHasBodyBytes(request)) throw new HttpError(400,'DIRECT_CHECKOUT_BODY_NOT_ALLOWED','La recuperación no acepta productos ni importes.');
    await resumeDirectCheckout(database,env,id);
    return jsonResponse(await readAssistedCheckoutAdminState(database,env,id));
  },{type:'web_request',...(typeof id==='string'?{id}:{})});
};
