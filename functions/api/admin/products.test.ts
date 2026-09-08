import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createTestD1} from '../../../src/test/d1';
import {onRequest as collection} from './products';
import {onRequest as resource} from './products/[id]';
import {onRequest as image} from './products/[id]/image';
import type {AdminContextData,Env,PagesFunctionContext} from '../../../server/platform';

const migrations=['0001_commerce.sql','0004_catalog_admin.sql'].map(file=>readFileSync(resolve('migrations',file),'utf8'));
const identity:AdminContextData={adminIdentity:{sub:'test',actor:'test',authMethod:'password'}};
function context(database:NonNullable<Env['DB']>,method:string,data:AdminContextData=identity,origin='https://example.test'):PagesFunctionContext<Env,'id',AdminContextData>{
  return{env:{DB:database,PUBLIC_SITE_URL:'https://example.test'},request:new Request('https://example.test/api/admin/products/old',{method,headers:{origin,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify({name:'Intento manual',stock:30,price:10})})}),
    params:{id:'old'},data,next:()=>Promise.resolve(new Response()),waitUntil:()=>{}};
}
it.each([['POST',collection],['PUT',resource],['PATCH',resource],['DELETE',resource],['PUT',image],['DELETE',image]] as const)('rechaza %s sin marcador de retiro y conserva auditoría e inventario',async(method,endpoint)=>{
  const db=createTestD1(...migrations);try{
    const response=await endpoint(context(db.database,method));expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({error:{code:'MANUAL_CATALOG_RETIRED'}});
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM catalog_product_mutations').get()?.n).toBe(0);
    expect(db.sqlite.prepare('SELECT outcome_status FROM admin_audit').get()?.outcome_status).toBe(409);
  }finally{db.close();}
});
it('mantiene autenticación, origen y método aun con la escritura retirada',async()=>{
  const db=createTestD1(...migrations);try{
    expect((await collection(context(db.database,'POST',{}))).status).toBe(401);
    expect((await resource(context(db.database,'PATCH',identity,'https://evil.test'))).status).toBe(403);
    expect((await collection(context(db.database,'PUT'))).status).toBe(405);
    expect((await image(context(db.database,'POST'))).status).toBe(405);
    expect((await resource(context(db.database,'GET'))).status).toBe(404);
  }finally{db.close();}
});
