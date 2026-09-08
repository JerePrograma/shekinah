import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTestD1 } from '../src/test/d1';
import { parseDuxCatalogSourceItems, persistDuxCatalogSnapshot, projectDuxRuntimeCatalog, readDuxCatalogSnapshot } from './dux-catalog';
import { updateDuxCatalogControl } from './dux-catalog-control';
import { MercadoLibreProviderError } from './mercado-libre';
import { editorialApiGet } from './mercado-libre-editorial-access';
import type * as EditorialAccess from './mercado-libre-editorial-access';
import { applyMercadoLibreEditorial, isMercadoLibreEditorialImageReferenced } from './mercado-libre-editorial-public';
import { getEditorialReview, reviewEditorialAssociation } from './mercado-libre-editorial-review';
import { advanceEditorialSync } from './mercado-libre-editorial-sync';
import { currentEditorialRun, parseEditorialState } from './mercado-libre-editorial-store';
import { MemoryR2Bucket } from './test/memory-r2';

vi.mock('./mercado-libre-editorial-access',async importOriginal=>({
  ...await importOriginal<typeof EditorialAccess>(),editorialApiGet:vi.fn(),
}));
const migrations=readdirSync(resolve('migrations')).filter(file=>file.endsWith('.sql')).sort().map(file=>readFileSync(resolve('migrations',file),'utf8'));
const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),character=>character.charCodeAt(0));
const source={id:'MLA123456789',seller_id:445638367,site_id:'MLA',title:'Producto prueba presentación exacta',status:'active',
  attributes:[{id:'SELLER_SKU',value_name:'DUX-1'}],seller_custom_field:null,variations:[],
  pictures:[{id:'one',secure_url:'https://http2.mlstatic.com/D_NQ_NP_TEST123-O.png'}]};

async function fixture(){
  const db=createTestD1(...migrations),bucket=new MemoryR2Bucket();
  const env={DUX_COMPANY_ID:'12862',MERCADO_LIBRE_EDITORIAL_ENABLED:'true',MERCADO_LIBRE_EXPECTED_SELLER_ID:'445638367',CATALOG_IMAGES:bucket};
  const now=new Date().toISOString();
  db.sqlite.prepare("INSERT INTO dux_tenant_context VALUES (1,'v2','12862','Test','1','Branch','25566','Deposit',?,?)").run(now,now);
  db.sqlite.prepare("INSERT INTO dux_sync_runs(id,kind,status,trigger_actor,started_at,completed_at,created_at,updated_at) VALUES('dux_sync_editorial','manual','succeeded','test',?,?,?,?)").run(now,now,now,now);
  await updateDuxCatalogControl(db.database,'test',{snapshotCollectionEnabled:true});
  const items=parseDuxCatalogSourceItems({datos:['DUX-1','DUX-2'].map(code=>({cod_item:code,item:`Producto ${code}`,habilitado:true,
    precios:[{id:1,nombre:'PRECIOS DEL NEGOCIO',precio:1250}],ctd_unidades_por_bulto:null,rubro:null,sub_rubro:null,imagen_url:null,descripcion:null}))});
  await persistDuxCatalogSnapshot(db.database,'dux_sync_editorial',items,now);
  const product=projectDuxRuntimeCatalog(await readDuxCatalogSnapshot(db.database),[],[]).products[0]!;
  const local={...product,description:'Descripción local autorizada',images:[{src:`/images/original/catalog/${'a'.repeat(64)}.jpg`,alt:'Local'}],primaryImage:{src:`/images/original/catalog/${'a'.repeat(64)}.jpg`,alt:'Local'}};
  let status='active',description='Información del producto\nAceptamos Mercado Pago',fail=false,emptyImages=false;
  vi.mocked(editorialApiGet).mockImplementation(async(_db,_env,path)=>{
    await Promise.resolve();
    if(fail)throw new MercadoLibreProviderError(401,503,'MERCADO_LIBRE_AUTH_FAILED','Fallo de prueba');
    const url=new URL(path,'https://api.mercadolibre.com');
    if(url.pathname==='/users/me')return{id:445638367,site_id:'MLA'};
    if(url.pathname.endsWith('/items/search')){const ids=url.searchParams.get('status')===status?[source.id]:[];return{paging:{total:ids.length},results:ids};}
    const item={...source,status,pictures:emptyImages?[]:source.pictures};
    if(url.pathname==='/items/bulk')return[{id:source.id,status_code:200,body:item}];
    if(url.pathname.endsWith('/description'))return{plain_text:description};
    if(url.pathname===`/items/${source.id}`)return item;
    throw Error('Unexpected official resource');
  });
  vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(new Response(png,{headers:{'content-type':'image/png'}}))));
  async function run(){let id:string|null=null;for(let step=0;step<30;step++){const result=await advanceEditorialSync(db.database,env,'test',id);id=result.id;if(result.status!=='running')return result;}throw Error('Run did not finish');}
  async function approve(code='DUX-1'){
    const review=await getEditorialReview(db.database,env,code,source.id);
    return reviewEditorialAssociation(db.database,env,'reviewer',{code,itemId:source.id,variationId:null,evidenceHash:review.sources[0]!.hash,duxIdentityHash:review.duxIdentityHash,
      decision:'approve',reason:'Presentación, pack y variante contrastados explícitamente en el fixture.',presentationVerified:true,packVerified:true,variantVerified:true,
      images:true,description:true,expectedRevision:0});
  }
  return{db,env,bucket,local,run,approve,setStatus:(value:string)=>{status=value;},setDescription:(value:string)=>{description=value;},setFail:(value:boolean)=>{fail=value;},setEmptyImages:()=>{emptyImages=true;}};
}
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});

it('completa metadata sin descargar medios sin asociación y publica campos aprobados de forma idempotente',async()=>{
  const f=await fixture();try{
    await f.run();expect(fetch).not.toHaveBeenCalled();expect(f.bucket.keys).toHaveLength(0);
    const review=await getEditorialReview(f.db.database,f.env,'DUX-1',null);expect(review.candidates).toMatchObject([{state:'pending_review',unique:true}]);
    await f.approve();const put=vi.spyOn(f.bucket,'put');await f.run();
    const published=(await applyMercadoLibreEditorial(f.db.database,f.env,[f.local]))[0]!;
    expect(published.description).toBe('Información del producto');expect(published.images).toHaveLength(1);
    expect(published.images[0]!.src).toMatch(/^\/api\/catalog-images\//u);expect(published.commerce).toEqual(f.local.commerce);
    const objects=f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM ml_editorial_objects').get()?.n;
    await f.run();expect(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM ml_editorial_objects').get()?.n).toBe(objects);expect(put).toHaveBeenCalledTimes(1);
    expect(await isMercadoLibreEditorialImageReferenced(f.db.database,published.images[0]!.src)).toBe(true);
    expect(f.db.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(()=>f.db.sqlite.exec('DELETE FROM ml_editorial_decisions')).toThrow('IMMUTABLE');
  }finally{f.db.close();}
},20000);

it('conserva local por campo, admite pausadas y retira únicamente una baja confirmada',async()=>{
  const f=await fixture();try{
    await f.run();await f.approve();f.setDescription('');f.setStatus('paused');await f.run();
    let published=(await applyMercadoLibreEditorial(f.db.database,f.env,[f.local]))[0]!;
    expect(published.description).toBe(f.local.description);expect(published.images[0]!.src).not.toBe(f.local.images[0]!.src);
    f.setEmptyImages();f.setDescription('Descripción del proveedor');await f.run();
    published=(await applyMercadoLibreEditorial(f.db.database,f.env,[f.local]))[0]!;
    expect(published.images).toEqual(f.local.images);expect(published.description).toBe('Descripción del proveedor');
    f.setStatus('closed');await f.run();expect(await applyMercadoLibreEditorial(f.db.database,f.env,[f.local])).toEqual([f.local]);
  }finally{f.db.close();}
},20000);

it('conserva la última publicación frente a autorización fallida o paginación incompleta',async()=>{
  const f=await fixture();try{
    await f.run();await f.approve();await f.run();const before=await currentEditorialRun(f.db.database);
    f.setFail(true);await expect(f.run()).rejects.toMatchObject({code:'MERCADO_LIBRE_AUTH_FAILED'});f.setFail(false);
    vi.mocked(editorialApiGet).mockImplementation((_db,_env,path)=>Promise.resolve(path==='/users/me'?{id:445638367,site_id:'MLA'}:{paging:{total:100},results:[]}));
    await expect(f.run()).rejects.toMatchObject({code:'ML_EDITORIAL_SEARCH_INCOMPLETE'});
    expect((await currentEditorialRun(f.db.database))?.id).toBe(before?.id);
  }finally{f.db.close();}
},20000);

it('impide asociaciones sin verificación de pack, contra productos ajenos a Dux y duplicadas',async()=>{
  const f=await fixture();try{
    await f.run();const review=await getEditorialReview(f.db.database,f.env,'DUX-1',source.id);
    const input={code:'DUX-1',itemId:source.id,variationId:null,evidenceHash:review.sources[0]!.hash,duxIdentityHash:review.duxIdentityHash,decision:'approve',reason:'Revisión incompleta',presentationVerified:true,packVerified:false,variantVerified:true,images:true,description:true,expectedRevision:0};
    await expect(reviewEditorialAssociation(f.db.database,f.env,'test',{...input,duxIdentityHash:'0'.repeat(64),packVerified:true})).rejects.toMatchObject({code:'ML_EDITORIAL_DUX_IDENTITY_CHANGED'});
    await expect(reviewEditorialAssociation(f.db.database,f.env,'test',input)).rejects.toMatchObject({code:'ML_EDITORIAL_IDENTITY_REVIEW_REQUIRED'});
    await expect(reviewEditorialAssociation(f.db.database,f.env,'test',{...input,code:'manual'})).rejects.toMatchObject({code:'ML_EDITORIAL_DUX_PRODUCT_MISSING'});
    await f.approve();await expect(f.approve('DUX-2')).rejects.toMatchObject({code:'ML_EDITORIAL_REVIEW_CONFLICT'});
    expect(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM ml_editorial_links').get()?.n).toBe(1);
  }finally{f.db.close();}
},20000);

it('no permite dos pasos simultáneos, estado corrupto ni publicación parcial',async()=>{
  const f=await fixture();try{
    const first=await advanceEditorialSync(f.db.database,f.env,'test',null);
    f.db.sqlite.prepare('UPDATE ml_editorial_runs SET lease_owner=?,lease_until=? WHERE id=?').run('other',new Date(Date.now()+60000).toISOString(),first.id);
    await expect(advanceEditorialSync(f.db.database,f.env,'test',first.id)).rejects.toMatchObject({code:'ML_EDITORIAL_BUSY'});
    expect(()=>f.db.sqlite.prepare('INSERT INTO ml_editorial_state VALUES(1,?,?)').run(first.id,new Date().toISOString())).toThrow('REQUIRES_COMPLETE_RUN');
    expect(()=>parseEditorialState('{"schemaVersion":1}')).toThrow();
  }finally{f.db.close();}
});
