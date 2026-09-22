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
import { currentEditorialRun, parseEditorialState, readEditorialObject, storeEditorialObject } from './mercado-libre-editorial-store';
import { cartLineFingerprint, summarizeCart } from '../src/cart/model';
import { filterProducts } from '../src/catalog/catalog';
import { MemoryR2Bucket } from './test/memory-r2';
import { getPublicCatalogProductDetail, readPublicCatalog } from './dux-public-catalog';

vi.mock('./mercado-libre-editorial-access',async importOriginal=>({
  ...await importOriginal<typeof EditorialAccess>(),editorialApiGet:vi.fn(),
}));
const migrations=readdirSync(resolve('migrations')).filter(file=>file.endsWith('.sql')).sort().map(file=>readFileSync(resolve('migrations',file),'utf8'));
const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),character=>character.charCodeAt(0));
const source={id:'MLA123456789',seller_id:445638367,site_id:'MLA',title:'Producto prueba presentación exacta',status:'active',
  price:99999,available_quantity:999,currency_id:'USD',
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
  const duxItems=items.map(item=>({...item,warehouseStocks:[{depositId:25566,depositName:'Depósito Dux',variantId:null,barcode:null,color:null,size:null,real:14,reserved:2,available:12}]}));
  await persistDuxCatalogSnapshot(db.database,'dux_sync_editorial',duxItems,now);
  const product=projectDuxRuntimeCatalog(await readDuxCatalogSnapshot(db.database),[],[]).products[0]!;
  const local={...product,description:'Descripción local autorizada',images:[{src:`/images/original/catalog/${'a'.repeat(64)}.jpg`,alt:'Local'}],primaryImage:{src:`/images/original/catalog/${'a'.repeat(64)}.jpg`,alt:'Local'}};
  let status='active',title=source.title,description='Información del producto\nAceptamos Mercado Pago',fail=false,emptyImages=false;
  vi.mocked(editorialApiGet).mockImplementation(async(_db,_env,path)=>{
    await Promise.resolve();
    if(fail)throw new MercadoLibreProviderError(401,503,'MERCADO_LIBRE_AUTH_FAILED','Fallo de prueba');
    const url=new URL(path,'https://api.mercadolibre.com');
    if(url.pathname==='/users/me')return{id:445638367,site_id:'MLA'};
    if(url.pathname.endsWith('/items/search')){const ids=url.searchParams.get('status')===status?[source.id]:[];return{paging:{total:ids.length},results:ids};}
    const item={...source,status,title,pictures:emptyImages?[]:source.pictures};
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
  return{db,env,bucket,local,run,approve,setStatus:(value:string)=>{status=value;},setTitle:(value:string)=>{title=value;},setDescription:(value:string)=>{description=value;},setFail:(value:boolean)=>{fail=value;},setEmptyImages:()=>{emptyImages=true;},
    changeDux:()=>persistDuxCatalogSnapshot(db.database,'dux_sync_editorial',duxItems.map(item=>({...item,name:`${item.name} cambiado`})),new Date().toISOString())};
}
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});

// Publish a new immutable fixture version; historical objects/runs are never rewritten.
async function republish(f: Awaited<ReturnType<typeof fixture>>, change: (content: Record<string, unknown>) => void,
  changeSource?: (item: Record<string, unknown>) => void, corrupt: 'content' | 'item' | null = null) {
  const previous = (await currentEditorialRun(f.db.database))!;
  const state = parseEditorialState(previous.state_json);
  const publication = state.publications['DUX-1']!;
  const content = await readEditorialObject<Record<string, unknown>>(f.db.database, publication.hash, 'content');
  change(content);
  const now = new Date().toISOString();
  publication.hash = await storeEditorialObject(f.db.database, 'content', content, now);
  if (changeSource !== undefined) {
    const item = await readEditorialObject<Record<string, unknown>>(f.db.database, state.itemHashes[source.id]!, 'item');
    changeSource(item);
    state.itemHashes[source.id] = await storeEditorialObject(f.db.database, 'item', item, now);
  }
  if (corrupt !== null) {
    const hash = '0'.repeat(64);
    f.db.sqlite.prepare('INSERT INTO ml_editorial_objects VALUES(?,?,?,?)').run(hash, corrupt, '{}', now);
    if (corrupt === 'content') publication.hash = hash; else state.itemHashes[source.id] = hash;
  }
  const id = `ml_editorial_${crypto.randomUUID()}`;
  f.db.sqlite.prepare(`INSERT INTO ml_editorial_runs(id,actor,status,phase,state_json,started_at,updated_at,completed_at)
    VALUES(?,'fixture','succeeded','complete',?,?,?,?)`).run(id,JSON.stringify(state),now,now,now);
  f.db.sqlite.prepare('UPDATE ml_editorial_state SET current_run_id=? WHERE id=1').run(id);
}

it('completa metadata sin descargar medios sin asociación y publica campos aprobados de forma idempotente',async()=>{
  const f=await fixture();try{
    const duxBefore=await readDuxCatalogSnapshot(f.db.database);
    await f.run();expect(fetch).not.toHaveBeenCalled();expect(f.bucket.keys).toHaveLength(0);
    expect(await applyMercadoLibreEditorial(f.db.database,f.env,[f.local])).toEqual([f.local]);
    const review=await getEditorialReview(f.db.database,f.env,'DUX-1',null);expect(review.candidates).toMatchObject([{state:'pending_review',unique:true}]);
    await f.approve();const put=vi.spyOn(f.bucket,'put');await f.run();
    const published=(await applyMercadoLibreEditorial(f.db.database,f.env,[f.local]))[0]!;
    expect(published.name).toBe(source.title);
    expect(published.description).toBe('Información del producto');expect(published.images).toHaveLength(1);
    expect(published.images[0]!.src).toMatch(/^\/api\/catalog-images\//u);expect(published.commerce).toEqual(f.local.commerce);
    expect(published.commerce).toMatchObject({source:'dux',observedStock:{real:14,reserved:2,available:12}});
    expect({ ...published, name:f.local.name, description:f.local.description, images:f.local.images, primaryImage:f.local.primaryImage }).toEqual(f.local);
    expect(await applyMercadoLibreEditorial(f.db.database,f.env,[])).toEqual([]);
    expect(filterProducts([published], { query:'presentación exacta', categorySlug:'all' })).toEqual([published]);
    const cart = { version:1 as const, items:[{ productId:f.local.id, quantity:2 }], updatedAt:new Date().toISOString() };
    const before = summarizeCart(cart,[f.local]), after = summarizeCart(cart,[published]);
    expect(after.items[0]?.product.name).toBe(source.title);
    expect(after.total).toBe(before.total);
    const fingerprint = (products: typeof before.items) => cartLineFingerprint(products.map(({product,quantity}) => ({
      productId:product.id,quantity,catalogVersion:product.commerce!.catalogVersion,
    })));
    expect(fingerprint(after.items)).toBe(fingerprint(before.items));
    const objects=f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM ml_editorial_objects').get()?.n;
    await f.run();expect(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM ml_editorial_objects').get()?.n).toBe(objects);expect(put).toHaveBeenCalledTimes(1);
    expect(await isMercadoLibreEditorialImageReferenced(f.db.database,published.images[0]!.src)).toBe(true);
    expect(f.db.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(await readDuxCatalogSnapshot(f.db.database)).toEqual(duxBefore);
    expect(()=>f.db.sqlite.exec('DELETE FROM ml_editorial_decisions')).toThrow('IMMUTABLE');
  }finally{f.db.close();}
},20000);

it('proyecta el mismo nombre en listado y ficha sin cambiar rutas ni crear productos ML',async()=>{
  const f=await fixture();try{
    await f.run();await f.approve();await f.run();
    await updateDuxCatalogControl(f.db.database,'test',{publicCatalogEnabled:true});
    const catalog=await readPublicCatalog(f.db.database,f.env);
    expect(catalog.products).toHaveLength(2);
    expect(catalog.products.find(product=>product.id===f.local.id)?.name).toBe(source.title);
    const detail=await getPublicCatalogProductDetail(f.db.database,f.env,f.local.id);
    expect(detail?.name).toBe(source.title);expect(detail?.slug).toBe(f.local.slug);
    expect(detail?.sku).toBe('DUX-1');expect(detail?.price).toEqual(f.local.price);
    expect(await getPublicCatalogProductDetail(f.db.database,f.env,'publicacion-ml-sin-dux')).toBeNull();
    expect((await applyMercadoLibreEditorial(f.db.database,{...f.env,MERCADO_LIBRE_EDITORIAL_ENABLED:'false'},[f.local]))[0]).toBe(f.local);
  }finally{f.db.close();}
},20000);

it('conserva nombre, descripción e imágenes anteriores si la API falla a mitad de la nueva ejecución',async()=>{
  const f=await fixture();try{
    await f.run();await f.approve();await f.run();
    const previous=await applyMercadoLibreEditorial(f.db.database,f.env,[f.local]);
    const before=await currentEditorialRun(f.db.database);
    const started=await advanceEditorialSync(f.db.database,f.env,'test',null);
    vi.mocked(editorialApiGet).mockRejectedValueOnce(new MercadoLibreProviderError(503,503,'MERCADO_LIBRE_UNAVAILABLE','Fallo temporal de prueba'));
    await expect(advanceEditorialSync(f.db.database,f.env,'test',started.id)).rejects.toMatchObject({code:'MERCADO_LIBRE_UNAVAILABLE'});
    expect((await currentEditorialRun(f.db.database))?.id).toBe(before?.id);
    expect(await applyMercadoLibreEditorial(f.db.database,f.env,[f.local])).toEqual(previous);
  }finally{f.db.close();}
},20000);

it.each(['paused','closed','under_review','inactive','deleted'])('retira todos los campos ML sólo tras una corrida completa que confirma %s',async status=>{
  const f=await fixture();try{
    await f.run();await f.approve();await f.run();
    const before=await currentEditorialRun(f.db.database);
    f.setStatus(status);
    const started=await advanceEditorialSync(f.db.database,f.env,'test',null);
    expect((await currentEditorialRun(f.db.database))?.id).toBe(before?.id);
    expect((await applyMercadoLibreEditorial(f.db.database,f.env,[f.local]))[0]?.name).toBe(source.title);
    expect(started.status).toBe('running');
    const result=await f.run();expect(result.issues).toContainEqual({code:'DUX-1',reason:'confirmed_listing_withdrawal'});
    expect(await applyMercadoLibreEditorial(f.db.database,f.env,[f.local])).toEqual([f.local]);
    expect((await readDuxCatalogSnapshot(f.db.database)).items).toHaveLength(2);
    expect((await getEditorialReview(f.db.database,f.env,'DUX-1',source.id)).sources).toEqual([]);
    expect(vi.mocked(editorialApiGet).mock.calls.filter(([, ,path])=>path.includes('/items/search')).every(([, ,path])=>new URL(path,'https://api.mercadolibre.com').searchParams.get('status')==='active')).toBe(true);
  }finally{f.db.close();}
},20000);

it('lee objetos históricos sin título y rechaza sus fuentes pausadas ya acreditadas',async()=>{
  const f=await fixture();try{
    await f.run();await f.approve();await f.run();
    await republish(f,content=>{delete content.title;});
    const historical=(await applyMercadoLibreEditorial(f.db.database,f.env,[f.local]))[0]!;
    expect(historical.name).toBe(f.local.name);expect(historical.description).toBe('Información del producto');
    expect(historical.images[0]?.src).toMatch(/^\/api\/catalog-images\//u);
    await republish(f,()=>{},item=>{item.status='paused';});
    expect(await applyMercadoLibreEditorial(f.db.database,f.env,[f.local])).toEqual([f.local]);
  }finally{f.db.close();}
},20000);

it.each(['seller','source','revision','item','variation','dux','title','invalid_title','content_hash','item_hash'])('conserva fallback ante contenido incompatible: %s',async fault=>{
  const f=await fixture();try{
    await f.run();await f.approve();await f.run();
    await republish(f,content=>{
      if(fault==='seller')content.sellerId='123';
      if(fault==='source')content.sourceIdentity='{}';
      if(fault==='revision')content.revision=2;
      if(fault==='item')content.itemId='MLA987654321';
      if(fault==='variation')content.variationId='1';
      if(fault==='dux')content.duxIdentity={code:'DUX-1',name:'Otra identidad'};
      if(fault==='title')content.title='Título distinto del aprobado';
      if(fault==='invalid_title')content.title='\u0000';
    },undefined,fault==='content_hash'?'content':fault==='item_hash'?'item':null);
    expect(await applyMercadoLibreEditorial(f.db.database,f.env,[f.local])).toEqual([f.local]);
  }finally{f.db.close();}
},20000);

it('requiere nueva revisión si cambia el título aprobado y no aplica una asociación revocada',async()=>{
  const f=await fixture();try{
    await f.run();await f.approve();await f.run();f.setTitle('Nueva presentación del proveedor');
    const result=await f.run();expect(result.issues).toContainEqual({code:'DUX-1',reason:'source_identity_requires_review'});
    expect(await applyMercadoLibreEditorial(f.db.database,f.env,[f.local])).toEqual([f.local]);
    f.setTitle(source.title);await f.run();
    f.db.sqlite.prepare("UPDATE ml_editorial_links SET status='revoked',revision=revision+1 WHERE cod_item='DUX-1'").run();
    expect(await applyMercadoLibreEditorial(f.db.database,f.env,[f.local])).toEqual([f.local]);
  }finally{f.db.close();}
},20000);

it('retira el overlay si cambia la identidad Dux vigente sin cambiar la existencia del producto',async()=>{
  const f=await fixture();try{
    await f.run();await f.approve();await f.run();await f.changeDux();
    const current=projectDuxRuntimeCatalog(await readDuxCatalogSnapshot(f.db.database),[],[]).products;
    expect(current).toHaveLength(2);
    expect(await applyMercadoLibreEditorial(f.db.database,f.env,current)).toEqual(current);
    expect((await f.run()).issues).toContainEqual({code:'DUX-1',reason:'dux_identity_requires_review'});
  }finally{f.db.close();}
},20000);

it('falla sin publicar al retomar un scan histórico de pausadas',async()=>{
  const f=await fixture();try{
    await f.run();const before=(await currentEditorialRun(f.db.database))!;
    const first=await advanceEditorialSync(f.db.database,f.env,'test',null);
    const row=f.db.sqlite.prepare('SELECT state_json FROM ml_editorial_runs WHERE id=?').get(first.id)!;
    const state=parseEditorialState(String(row.state_json));state.searchStatus=1;
    f.db.sqlite.prepare("UPDATE ml_editorial_runs SET phase='search',state_json=? WHERE id=?").run(JSON.stringify(state),first.id);
    await expect(advanceEditorialSync(f.db.database,f.env,'test',first.id)).rejects.toMatchObject({code:'ML_EDITORIAL_SEARCH_STATE'});
    expect((await currentEditorialRun(f.db.database))?.id).toBe(before.id);
  }finally{f.db.close();}
});

it('conserva local por campo cuando faltan descripción o imágenes válidas',async()=>{
  const f=await fixture();try{
    await f.run();await f.approve();f.setDescription('');await f.run();
    let published=(await applyMercadoLibreEditorial(f.db.database,f.env,[f.local]))[0]!;
    expect(published.description).toBe(f.local.description);expect(published.images[0]!.src).not.toBe(f.local.images[0]!.src);
    f.setEmptyImages();f.setDescription('Descripción del proveedor');await f.run();
    published=(await applyMercadoLibreEditorial(f.db.database,f.env,[f.local]))[0]!;
    expect(published.images).toEqual(f.local.images);expect(published.description).toBe('Descripción del proveedor');
    expect(published.name).toBe(source.title);
  }finally{f.db.close();}
},20000);

it('conserva la última publicación frente a autorización fallida o paginación incompleta',async()=>{
  const f=await fixture();try{
    await f.run();await f.approve();await f.run();const before=await currentEditorialRun(f.db.database);
    f.setFail(true);await expect(f.run()).rejects.toMatchObject({code:'MERCADO_LIBRE_AUTH_FAILED'});f.setFail(false);
    vi.mocked(editorialApiGet).mockImplementation((_db,_env,path)=>Promise.resolve(path==='/users/me'?{id:445638367,site_id:'MLA'}:{paging:{total:100},results:[]}));
    await expect(f.run()).rejects.toMatchObject({code:'ML_EDITORIAL_SEARCH_INCOMPLETE'});
    expect((await currentEditorialRun(f.db.database))?.id).toBe(before?.id);
    const preserved=(await applyMercadoLibreEditorial(f.db.database,f.env,[f.local]))[0]!;
    expect(preserved.name).toBe(source.title);expect(preserved.description).toBe('Información del producto');
    expect(preserved.images[0]?.src).toMatch(/^\/api\/catalog-images\//u);
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

it('rechaza aprobar una publicación que dejó de estar activa después de la revisión',async()=>{
  const f=await fixture();try{
    await f.run();f.setStatus('paused');
    await expect(f.approve()).rejects.toMatchObject({code:'ML_EDITORIAL_SOURCE_CHANGED'});
    expect(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM ml_editorial_links').get()?.n).toBe(0);
  }finally{f.db.close();}
});
