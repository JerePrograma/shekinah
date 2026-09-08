import { handleAdminRequest } from '../../../../../server/admin-request';
import { methodNotAllowedResponse } from '../../../../../server/http';
import { rejectManualCatalogOperation } from '../../../../../server/manual-catalog-retirement';
import type { AdminContextData, Env, PagesFunction } from '../../../../../server/platform';
import { assertSameOrigin } from '../../../../../server/validation';

export const onRequest: PagesFunction<Env,string,AdminContextData> = async ({request,env,data}) => {
  if(request.method!=='POST')return methodNotAllowedResponse(['POST']);
  return handleAdminRequest(request,env,data,'admin.dux.historical_editorial.write_rejected',()=>{
    assertSameOrigin(request,env);return rejectManualCatalogOperation();
  });
};
