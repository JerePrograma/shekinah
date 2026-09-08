import { handleAdminRequest } from '../../../../../server/admin-request';
import { methodNotAllowedResponse } from '../../../../../server/http';
import { rejectManualCatalogOperation } from '../../../../../server/manual-catalog-retirement';
import type { AdminContextData, Env, PagesFunction } from '../../../../../server/platform';
import { assertSameOrigin } from '../../../../../server/validation';

export const onRequest: PagesFunction<Env,'id',AdminContextData> = async ({data,env,params,request}) => {
  if(!['PUT','DELETE'].includes(request.method))return methodNotAllowedResponse(['PUT','DELETE']);
  return handleAdminRequest(request,env,data,'catalog.products.image.write_rejected',()=>{
    assertSameOrigin(request,env);return rejectManualCatalogOperation();
  },{type:'catalog_product_image',id:typeof params.id==='string'?params.id:''});
};
