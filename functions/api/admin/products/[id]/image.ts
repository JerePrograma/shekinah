import { handleAdminRequest } from '../../../../../server/admin-request';
import { jsonResponse, methodNotAllowedResponse } from '../../../../../server/http';
import { removeAdminDuxProductImage, replaceAdminDuxProductImage } from '../../../../../server/dux-product-admin';
import type { AdminContextData, Env, PagesFunction } from '../../../../../server/platform';
import { assertSameOrigin } from '../../../../../server/validation';

export const onRequest: PagesFunction<Env,'id',AdminContextData> = async ({data,env,params,request}) => {
  if(!['PUT','DELETE'].includes(request.method))return methodNotAllowedResponse(['PUT','DELETE']);
  return handleAdminRequest(request,env,data,'catalog.products.image.update',async database=>{
    assertSameOrigin(request,env);
    const id = typeof params.id === 'string' ? params.id : '';
    const product = request.method === 'PUT'
      ? await replaceAdminDuxProductImage(database,env,id,data.adminIdentity!.actor,request)
      : await removeAdminDuxProductImage(database,env,id,data.adminIdentity!.actor);
    return jsonResponse({product});
  },{type:'catalog_product_image',id:typeof params.id==='string'?params.id:''});
};
