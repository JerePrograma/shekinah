import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { onRequest } from './marketing';
import { onRequest as adminRequest } from './admin/marketing';
import { readDuxCatalogSnapshot } from '../../server/dux-catalog';
import { readDuxCatalogControl } from '../../server/dux-catalog-control';
import type * as CatalogControlModule from '../../server/dux-catalog-control';
import { assertDuxProductsPublished } from '../../server/dux-product-web-settings';
import { writeMarketingCampaign } from '../../server/marketing';
import type { MarketingCampaignInput } from '../../src/commerce/marketing-contracts';
import type { AdminContextData, Env, PagesFunctionContext } from '../../server/platform';
import { SqliteD1 } from '../../server/test/sqlite-d1';

vi.mock('../../server/dux-catalog',()=>({readDuxCatalogSnapshot:vi.fn()}));
vi.mock('../../server/dux-catalog-control',async importOriginal => ({
  ...await importOriginal<typeof CatalogControlModule>(),readDuxCatalogControl:vi.fn(),
}));
vi.mock('../../server/dux-product-web-settings',()=>({assertDuxProductsPublished:vi.fn()}));

const date = '2026-10-22T12:00:00.000Z', version = 'a'.repeat(64);
const input: MarketingCampaignInput = {type:'automatic',title:'Prueba',body:'',ctaLabel:'',href:'',placement:'home',priority:0,
  enabled:true,startsAt:null,endsAt:null,percentOff:10,code:null,minSubtotalMinor:0,maxDiscountMinor:null,productCodes:[],maxRedemptions:null};
const cart = {items:[{productId:'dux-producto',quantity:2,catalogVersion:version}]};
const admin: AdminContextData = {adminIdentity:{sub:'test',actor:'test@example.test',authMethod:'password'},requestId:'marketing-test'};
function setup() {
  return new SqliteD1(readFileSync(resolve('migrations/0001_commerce.sql'),'utf8') +
    readFileSync(resolve('migrations/0028_marketing.sql'),'utf8') + `
    CREATE TABLE checkout_intents(web_request_id TEXT);
    CREATE TABLE commerce_request_rate_limits(scope_key TEXT PRIMARY KEY,request_count INTEGER NOT NULL,
      limit_count INTEGER NOT NULL,updated_at INTEGER NOT NULL,CONSTRAINT commerce_request_limit CHECK(request_count BETWEEN 1 AND limit_count));`);
}
function context(db:SqliteD1,method:string,body?:unknown,data:AdminContextData={},extraEnv:Partial<Env>={}):PagesFunctionContext<Env,string,AdminContextData> {
  return {request:new Request('https://shop.test/api/marketing',{method,headers:{'content-type':'application/json',origin:'https://shop.test','cf-connecting-ip':'127.0.0.1'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})}),env:{DB:db,PUBLIC_SITE_URL:'https://shop.test',DUX_COMPANY_ID:'12862',
      ORDER_TOKEN_SECRET:'test-only-'.repeat(5),...extraEnv},data,params:{},next:()=>Promise.resolve(new Response()),waitUntil:()=>undefined};
}
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(date));
  vi.mocked(readDuxCatalogSnapshot).mockResolvedValue({inventoryRunId:'dux_sync_test',catalogVersion:version,priceListName:'PRECIOS DEL NEGOCIO',
    itemCount:1,priceCounts:{usable:1,placeholder:0,missing_or_zero:0,invalid:0},syncedAt:date,stockReadAt:date,
    items:[{slug:'dux-producto',code:'A-001',name:'Producto',priceAmount:12.34,priceStatus:'usable',categories:[],unitsPerPackage:null,imageUrl:null,description:null}]});
  vi.mocked(readDuxCatalogControl).mockResolvedValue({migrationApplied:true,companyId:'12862',snapshotCollectionEnabled:true,
    publicCatalogEnabled:true,publicCutoverEnabled:false});
  vi.mocked(assertDuxProductsPublished).mockResolvedValue(undefined);
});
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});

it('cotiza sólo precios Dux y rechaza importes del navegador',async()=>{
  const db=setup();
  try {
    await writeMarketingCampaign(db,input);
    const response=await onRequest(context(db,'POST',cart));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({quote:{subtotalMinor:2468,discountMinor:246,totalMinor:2222,
      lines:[{baseUnitPriceMinor:1234,unitPriceMinor:1111,quantity:2}]}});
    expect(assertDuxProductsPublished).toHaveBeenCalledWith(db,['A-001']);
    const forged=await onRequest(context(db,'POST',{...cart,items:[{...cart.items[0],unitPriceMinor:1}]}));
    expect(forged.status).toBe(400);
  } finally{db.close();}
});

it('rechaza catálogo deshabilitado, antiguo y versión cambiada',async()=>{
  const db=setup();
  try {
    vi.mocked(readDuxCatalogControl).mockResolvedValueOnce({...await readDuxCatalogControl(db),publicCatalogEnabled:false});
    expect((await onRequest(context(db,'POST',cart))).status).toBe(503);
    const stale={...await readDuxCatalogSnapshot(db),stockReadAt:'2026-10-21T00:00:00.000Z'};
    vi.mocked(readDuxCatalogSnapshot).mockResolvedValueOnce(stale);
    expect((await onRequest(context(db,'POST',cart))).status).toBe(409);
    expect((await onRequest(context(db,'POST',{items:[{...cart.items[0],catalogVersion:'b'.repeat(64)}]}))).status).toBe(409);
  } finally{db.close();}
});

it('protege origen y datos repetidos; sin cupón no exige secreto',async()=>{
  const db=setup();
  try {
    const noSecret={...context(db,'POST',cart)};
    const env={DB:db,PUBLIC_SITE_URL:'https://shop.test',DUX_COMPANY_ID:'12862'};
    expect((await onRequest({...noSecret,env})).status).toBe(200);
    const cross=context(db,'POST',cart);cross.request.headers.set('origin','https://foreign.test');
    expect((await onRequest(cross)).status).toBe(403);
    expect((await onRequest(context(db,'POST',{items:[...cart.items,...cart.items]}))).status).toBe(400);
  } finally{db.close();}
});

it('limita intentos de cupón sin agotar acceso o creación de pedidos, y no guarda IP',async()=>{
  const db=setup();
  try {
    await writeMarketingCampaign(db,{...input,type:'coupon',code:'PRUEBA'});
    for(let attempt=0;attempt<30;attempt+=1) {
      expect((await onRequest(context(db,'POST',{...cart,couponCode:'PRUEBA'}))).status).toBe(200);
    }
    const limited=await onRequest(context(db,'POST',{...cart,couponCode:'PRUEBA'}));
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({error:{code:'MARKETING_RATE_LIMITED'}});
    const counters=await db.prepare('SELECT scope_key,request_count FROM commerce_request_rate_limits').all();
    expect(counters.results).toHaveLength(2);
    expect(counters.results?.every(row=>typeof row.scope_key==='string' && row.scope_key.startsWith('marketing:'))).toBe(true);
    expect(JSON.stringify(counters)).not.toContain('127.0.0.1');
    expect((await onRequest(context(db,'POST',cart))).status).toBe(200);
  } finally{db.close();}
});

it('GET público no expone códigos y sólo retorna anuncios y automáticas activos',async()=>{
  const db=setup();
  try {
    await writeMarketingCampaign(db,{...input,type:'coupon',code:'SECRETO'});
    await writeMarketingCampaign(db,{...input,type:'announcement',percentOff:null,body:'Primera línea\nSegunda línea'});
    const response=await onRequest(context(db,'GET'));
    const result=await response.text();
    expect(response.status).toBe(200);expect(result).not.toContain('SECRETO');expect(result).toContain('Primera línea');
  } finally{db.close();}
});

it('admin exige identidad y mismo origen y registra creación, edición y fallos sin datos privados',async()=>{
  const db=setup();
  try {
    expect((await adminRequest(context(db,'POST',input))).status).toBe(401);
    expect(await db.prepare('SELECT count(*) AS count FROM marketing_campaigns').first()).toEqual({count:0});
    const created=await adminRequest(context(db,'POST',input,admin));expect(created.status).toBe(201);
    const {campaign}=await created.json() as {campaign:{id:string}};
    const updated=await adminRequest(context(db,'PUT',{...input,id:campaign.id,enabled:false},admin));expect(updated.status).toBe(200);
    const listed=await adminRequest(context(db,'GET',undefined,admin));expect(listed.status).toBe(200);
    const forged=await adminRequest(context(db,'PUT',{...input,id:campaign.id,redemptionCount:99},admin));expect(forged.status).toBe(400);
    const audit=await db.prepare('SELECT action,target_id,outcome_status,metadata_json FROM admin_audit ORDER BY rowid').all();
    expect(audit.results).toEqual([
      {action:'marketing.campaigns.create',target_id:campaign.id,outcome_status:201,metadata_json:'{}'},
      {action:'marketing.campaigns.update',target_id:campaign.id,outcome_status:200,metadata_json:'{}'},
      {action:'marketing.campaigns.list',target_id:null,outcome_status:200,metadata_json:'{}'},
      {action:'marketing.campaigns.update',target_id:campaign.id,outcome_status:400,metadata_json:'{}'},
    ]);
    const cross=context(db,'POST',input,admin);cross.request.headers.set('origin','https://foreign.test');
    expect((await adminRequest(cross)).status).toBe(403);
  } finally{db.close();}
});

it('rechaza métodos no autorizados',async()=>{
  const db=setup();
  try {
    expect((await onRequest(context(db,'DELETE'))).status).toBe(405);
    expect((await adminRequest(context(db,'DELETE',undefined,admin))).status).toBe(405);
  } finally{db.close();}
});

it('POST admin recupera una respuesta perdida con la misma clave y nunca edita mediante replay',async()=>{
  const db=setup();
  try {
    const key=crypto.randomUUID();
    const create=(body:unknown=input,creationKey:string=key)=>{
      const value=context(db,'POST',body,admin);value.request.headers.set('Idempotency-Key',creationKey);return adminRequest(value);
    };
    const first=await create();expect(first.status).toBe(201);
    const saved:unknown=await first.json();
    const replay=await create();expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(saved);
    expect(await db.prepare('SELECT count(*) AS count FROM marketing_campaigns').first()).toEqual({count:1});
    const changed=await create({...input,title:'Cambio incierto'});expect(changed.status).toBe(409);
    await expect(changed.json()).resolves.toMatchObject({error:{code:'MARKETING_IDEMPOTENCY_CONFLICT'}});
    expect((await create(input,'invalid-key')).status).toBe(400);
    expect(await db.prepare('SELECT title FROM marketing_campaigns').first()).toEqual({title:input.title});
  }finally{db.close();}
});
