import type { Env, PagesFunctionContext } from '../../../../server/platform';
import { SqliteD1 } from '../../../../server/test/sqlite-d1';
import { onRequest } from './prepare';

const doubles=vi.hoisted(()=>({advance:vi.fn(),receipt:vi.fn(),consume:vi.fn(),limits:vi.fn()}));
vi.mock('../../../../server/direct-checkout',()=>({advanceDirectCheckout:doubles.advance}));
vi.mock('../../../../server/web-order-requests',()=>({getWebRequestByToken:doubles.receipt}));
vi.mock('../../../../server/web-request-rate-limit',()=>({consumeWebRequestAccess:doubles.consume,webRequestLimits:doubles.limits}));
const token='a'.repeat(64);
function context(db:SqliteD1,method='POST',origin='https://example.test',body?:string):PagesFunctionContext<Env,'publicToken'> {
  return {request:new Request(`https://example.test/api/orders/${token}/prepare`,{method,headers:{origin},...(body===undefined?{}:{body})}),
    env:{DB:db,PUBLIC_SITE_URL:'https://example.test',ORDER_TOKEN_SECRET:'o'.repeat(40)},params:{publicToken:token},data:{},
    next:()=>Promise.resolve(new Response(null,{status:404})),waitUntil:()=>undefined};
}
beforeEach(()=>{
  doubles.advance.mockReset().mockResolvedValue(undefined);
  doubles.receipt.mockReset().mockResolvedValue({preparationStatus:'preparing',checkoutAvailable:false});
  doubles.consume.mockReset().mockResolvedValue(undefined);
  doubles.limits.mockReset().mockResolvedValue([{key:'access:global:1',limit:5000},{key:'access:ip:1:hash',limit:40}]);
});

it('GET nunca prepara ni muta la compra; rechaza origen ajeno y body antes del proveedor',async()=>{
  const db=new SqliteD1('');
  try {
    expect((await onRequest(context(db,'GET'))).status).toBe(405);
    expect((await onRequest(context(db,'POST','https://foreign.test'))).status).toBe(403);
    expect((await onRequest(context(db,'POST','https://example.test','{"total":1}'))).status).toBe(400);
    expect(doubles.advance).not.toHaveBeenCalled();
    expect(doubles.consume).not.toHaveBeenCalled();
  } finally {db.close();}
});

it('usa sólo la identidad protegida y conserva cupos global, IP y solicitud',async()=>{
  const db=new SqliteD1('');
  try {
    const ctx=context(db); const response=await onRequest(ctx);
    expect(response.status).toBe(200);
    expect(doubles.advance).toHaveBeenCalledWith(db,ctx.env,token);
    const scopes=doubles.consume.mock.calls[0]?.[1] as {key:string;limit:number}[];
    expect(scopes[0]).toEqual({key:'access:global:1',limit:5000});
    expect(scopes[1]).toEqual({key:'prepare:access:ip:1:hash',limit:160});
    expect(scopes[2]?.key).toMatch(/^prepare:request:\d+:[a-f0-9]{64}$/u);
    expect(scopes[2]?.limit).toBe(128);
    expect(JSON.stringify(scopes)).not.toContain(token);
    expect(await response.json()).toEqual({preparationStatus:'preparing',checkoutAvailable:false});
  } finally {db.close();}
});
