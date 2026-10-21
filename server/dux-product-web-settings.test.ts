import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseProducts } from '../src/catalog/model';
import { createTestD1 } from '../src/test/d1';
import { onRequest as resource } from '../functions/api/admin/products/[id]';
import { onRequest as collection } from '../functions/api/admin/products';
import { onRequest as image } from '../functions/api/admin/products/[id]/image';
import { parseDuxCatalogSourceItems, persistDuxCatalogSnapshot, readDuxCatalogSnapshot } from './dux-catalog';
import { getAdminDuxProductDetail, getPublicCatalogProductDetail, readDuxCatalog, readPublicCatalog } from './dux-public-catalog';
import { applyDuxProductWebSettings, assertDuxProductsPublished, parseDuxProductWebPatch, writeDuxProductWebSettings } from './dux-product-web-settings';
import { createWebOrderRequest, parseWebRequestInput } from './web-order-requests';
import { MemoryR2Bucket } from './test/memory-r2';
import type { AdminContextData, Env, PagesFunctionContext } from './platform';

const timestamp = '2026-09-25T12:00:00.000Z';
const env: Env = { DUX_COMPANY_ID: '12862', PUBLIC_SITE_URL: 'https://example.test' };
const identity: AdminContextData = { adminIdentity: { actor: 'test', sub: 'test', authMethod: 'password' } };
const migrations = readdirSync(resolve('migrations')).filter(file => /^\d{4}_.*\.sql$/u.test(file)).sort();

async function fixture(includeSettings = true, includeName = true) {
  const db = createTestD1(...migrations.filter(file => (includeSettings || !/^002[57]/u.test(file)) && (includeName || !file.startsWith('0027')))
    .map(file => readFileSync(resolve('migrations', file), 'utf8')));
  db.sqlite.prepare(`INSERT INTO dux_tenant_context VALUES (1,'v2','12862','Prueba','1','Sucursal','25566','Depósito',?,?)`).run(timestamp,timestamp);
  db.sqlite.prepare(`INSERT INTO dux_sync_runs (id,kind,status,trigger_actor,processed_count,mapped_count,unmapped_count,
    ambiguous_count,absent_count,failed_count,started_at,completed_at,created_at,updated_at)
    VALUES ('dux_sync_web_test','manual','succeeded','test',2,0,2,0,0,0,?,?,?,?)`).run(timestamp,timestamp,timestamp,timestamp);
  db.sqlite.prepare(`UPDATE dux_catalog_control SET snapshot_collection_enabled=1,updated_by='test',updated_at=?`).run(timestamp);
  const source = parseDuxCatalogSourceItems({ datos: ['A', 'B'].map(code => ({cod_item:code,item:`Producto ${code}`,habilitado:true,
    precios:[{id:1,nombre:'PRECIOS DEL NEGOCIO',precio:1250}],rubro:{id:10,nombre:'Hierbas'}})) }).map(item => ({ ...item, warehouseStocks: [] }));
  await persistDuxCatalogSnapshot(db.database,'dux_sync_web_test',source,timestamp);
  db.sqlite.prepare(`UPDATE dux_catalog_control SET public_catalog_enabled=1,updated_by='test',updated_at=?`).run(timestamp);
  const product = (await readDuxCatalog(db.database,env)).productDetails[0]!;
  const bucket = new MemoryR2Bucket();
  function context(method: string, value?: unknown, data = identity, origin = 'https://example.test'): PagesFunctionContext<Env,'id',AdminContextData> {
    return { env:{...env,DB:db.database,CATALOG_IMAGES:bucket},params:{id:product.id},data,
      request:new Request(`https://example.test/api/admin/products/${product.id}`,{method,headers:{origin,'content-type':'application/json'},
        ...(value === undefined ? {} : {body:JSON.stringify(value)})}),next:()=>Promise.resolve(new Response()),waitUntil:()=>{} };
  }
  return {db,product,bucket,context};
}

it('da de baja y reactiva por API sin cambiar identidad, stock, precio, descripción ni snapshot', async () => {
  const f = await fixture();
  try {
    const before = await readDuxCatalogSnapshot(f.db.database);
    const response = await resource(f.context('DELETE'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({product:{...f.product,publicationStatus:'unpublished'}});
    expect(await getPublicCatalogProductDetail(f.db.database,env,f.product.id)).toBeNull();
    const publicCatalog = await readPublicCatalog(f.db.database,env);
    expect(publicCatalog.products).toHaveLength(1);
    expect(publicCatalog.categories[0]?.productCount).toBe(1);
    const admin = await collection(f.context('GET'));
    const body: unknown = await admin.json();
    expect(body).toHaveProperty('products');
    expect((await readDuxCatalog(f.db.database,env)).productDetails.find(product => product.id === f.product.id))
      .toMatchObject({publicationStatus:'unpublished'});
    expect((await resource(f.context('GET'))).status).toBe(200);
    expect(await readDuxCatalogSnapshot(f.db.database)).toEqual(before);
    expect(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM catalog_product_mutations').get()?.n).toBe(0);
    const restored = await resource(f.context('PATCH',{publicationStatus:'published'}));
    expect(restored.status).toBe(200);
    expect(await getPublicCatalogProductDetail(f.db.database,env,f.product.id)).toEqual(f.product);
    expect(f.db.sqlite.prepare("SELECT COUNT(*) AS n FROM admin_audit WHERE outcome_status=200").get()?.n).toBeGreaterThanOrEqual(4);
  } finally {f.db.close();}
});

it('edita descripción y permite vaciarla; actualizaciones de campos distintos no se pisan', async () => {
  const f = await fixture();
  try {
    await Promise.all([
      resource(f.context('PATCH',{description:' Descripción del cliente. '})),
      resource(f.context('PATCH',{publicationStatus:'unpublished'})),
    ]);
    expect(await getAdminDuxProductDetail(f.db.database,env,f.product.id)).toMatchObject({description:'Descripción del cliente.',publicationStatus:'unpublished'});
    await resource(f.context('PATCH',{description:''}));
    const current = await getAdminDuxProductDetail(f.db.database,env,f.product.id);
    expect(current?.description).toBeUndefined();
    expect(current?.publicationStatus).toBe('unpublished');
    const row = f.db.sqlite.prepare('SELECT description,updated_by FROM dux_product_web_settings').get();
    expect(row).toMatchObject({description:'',updated_by:'test'});
    expect(parseProducts([current],(await readDuxCatalog(f.db.database,env)).categories)[0]?.publicationStatus).toBe('unpublished');
  } finally {f.db.close();}
});

it('el nombre web manual prevalece por SKU, omitirlo lo conserva y null vuelve al nombre Dux vigente', async () => {
  const f = await fixture();
  try {
    expect(parseDuxProductWebPatch({ name: '  Aceite de coco 180 cc  ' })).toEqual({ name: 'Aceite de coco 180 cc' });
    const before = await readDuxCatalogSnapshot(f.db.database);
    const response = await resource(f.context('PATCH', { name: '  Nombre del comercio  ' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ product: { ...f.product, name: 'Nombre del comercio',
      duxName: f.product.name, nameOverride: 'Nombre del comercio' } });
    await resource(f.context('PATCH', { description: 'Descripción manual.', publicationStatus: 'unpublished' }));
    const manual = await getAdminDuxProductDetail(f.db.database, env, f.product.id);
    expect(manual).toMatchObject({ name: 'Nombre del comercio', nameOverride: 'Nombre del comercio',
      description: 'Descripción manual.', publicationStatus: 'unpublished', commerce: f.product.commerce,
      sku: f.product.sku, id: f.product.id, slug: f.product.slug, path: f.product.path });
    const inherited = { ...f.product, name: 'Nombre Dux actualizado', duxName: 'Nombre Dux actualizado',
      description: 'Descripción editorial ML.', images: [], variants: [] };
    expect((await applyDuxProductWebSettings(f.db.database, [inherited]))[0])
      .toMatchObject({ name: 'Nombre del comercio', duxName: 'Nombre Dux actualizado', description: 'Descripción manual.' });
    const reset = await resource(f.context('PATCH', { name: null }));
    expect(reset.status).toBe(200);
    const current = await getAdminDuxProductDetail(f.db.database, env, f.product.id);
    expect(current).toMatchObject({ name: f.product.name, duxName: f.product.name,
      description: 'Descripción manual.', publicationStatus: 'unpublished' });
    expect(current?.nameOverride).toBeUndefined();
    const reapplied = (await applyDuxProductWebSettings(f.db.database, [{ ...inherited, name: 'Nombre del comercio', nameOverride: 'Nombre del comercio' }]))[0]!;
    expect(reapplied.name).toBe('Nombre Dux actualizado');
    expect(reapplied.nameOverride).toBeUndefined();
    expect(f.db.sqlite.prepare('SELECT name_override FROM dux_product_web_settings WHERE cod_item=?').get(f.product.sku!)?.name_override).toBeNull();
    expect(await readDuxCatalogSnapshot(f.db.database)).toEqual(before);
  } finally { f.db.close(); }
});

it('ediciones concurrentes de nombre, descripción e imagen conservan los campos independientes y no tocan stock', async () => {
  const f = await fixture();
  try {
    const images = [{ src: `/api/catalog-images/${crypto.randomUUID()}.png`, alt: 'Imagen manual' }];
    await Promise.all([
      writeDuxProductWebSettings(f.db.database, f.product.sku!, 'test', { name: 'Nombre manual' }),
      writeDuxProductWebSettings(f.db.database, f.product.sku!, 'test', { description: 'Descripción manual' }),
      writeDuxProductWebSettings(f.db.database, f.product.sku!, 'test', { images }),
      writeDuxProductWebSettings(f.db.database, f.product.sku!, 'test', { publicationStatus: 'unpublished' }),
    ]);
    const current = await getAdminDuxProductDetail(f.db.database, env, f.product.id);
    expect(current).toMatchObject({ name: 'Nombre manual', nameOverride: 'Nombre manual', duxName: f.product.name,
      description: 'Descripción manual', images, publicationStatus: 'unpublished', commerce: f.product.commerce, sku: f.product.sku });
    expect((await getAdminDuxProductDetail(f.db.database, env, (await readDuxCatalogSnapshot(f.db.database)).items[1]!.slug))?.nameOverride).toBeUndefined();
    const admin = await collection(f.context('GET'));
    const adminBody: unknown = await admin.json();
    expect(adminBody).toHaveProperty('products.0.name', 'Nombre manual');
    await writeDuxProductWebSettings(f.db.database, f.product.sku!, 'test', { publicationStatus: 'published' });
    const summary = (await readPublicCatalog(f.db.database, env)).products.find(product => product.sku === f.product.sku);
    expect(summary?.name).toBe('Nombre manual');
    expect(summary).not.toHaveProperty('duxName');
    expect(summary).not.toHaveProperty('nameOverride');
  } finally { f.db.close(); }
});

it('antes de 0027 hereda el nombre, admite ediciones anteriores y rechaza nombre explícito sin escrituras parciales', async () => {
  const f = await fixture(true, false);
  try {
    expect(f.product).toMatchObject({ name: 'Producto A', duxName: 'Producto A' });
    expect((await resource(f.context('PATCH', { description: 'Anterior', publicationStatus: 'unpublished' }))).status).toBe(200);
    const images = [{ src: `/api/catalog-images/${crypto.randomUUID()}.png`, alt: 'Imagen anterior' }];
    await writeDuxProductWebSettings(f.db.database, f.product.sku!, 'test', { images });
    for (const name of ['Nombre manual', null]) {
      const response = await resource(f.context('PATCH', { name, description: 'No debe escribirse' }));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: { code: 'PRODUCT_WEB_NAME_MIGRATION_REQUIRED' } });
    }
    const current = await getAdminDuxProductDetail(f.db.database, env, f.product.id);
    expect(current).toMatchObject({ name: 'Producto A', duxName: 'Producto A', description: 'Anterior',
      images, publicationStatus: 'unpublished' });
    expect(current?.nameOverride).toBeUndefined();
  } finally { f.db.close(); }
});

it.each([{sku:'OTRO'}, {name:''}, {name:'   '}, {name:'a'.repeat(501)}, {name:'Aceite\n500 cc'}, {name:'Aceite\u0000500 cc'}, {name:'Aceite\u007f500 cc'}, {name:'Aceite\u0085500 cc'}, {name:12},
  {price:12}, {stockQuantity:3}, {images:[]}, {availability:'available'}, {}, {description:null}, {description:'a'.repeat(12001)}, {publicationStatus:'deleted'}])('rechaza campos ajenos o inválidos %j', value => {
  expect(() => parseDuxProductWebPatch(value)).toThrow(expect.objectContaining({code:'INVALID_PRODUCT_WEB_SETTINGS'}));
});

it('conserva autenticación, mismo origen, alta manual retirada y aislamiento por empresa', async () => {
  const f = await fixture();
  try {
    expect((await resource(f.context('DELETE',undefined,{}))).status).toBe(401);
    expect((await resource(f.context('DELETE',undefined,identity,'https://evil.test'))).status).toBe(403);
    expect((await collection(f.context('POST',{name:'nuevo'}))).status).toBe(409);
    expect((await resource(f.context('PUT',{name:'nuevo'}))).status).toBe(409);
    expect(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM dux_product_web_settings').get()?.n).toBe(0);
    expect(() => f.db.sqlite.prepare(`INSERT INTO dux_product_web_settings
      (company_id,cod_item,publication_status,description,images_json,updated_by,created_at,updated_at)
      VALUES ('999','A','unpublished',NULL,NULL,'test',?,?)`).run(timestamp,timestamp)).toThrow();
  } finally {f.db.close();}
});

it('compatibilidad previa a 0025: lectura publicada, escritura falla explícitamente sin reactivar catálogo manual', async () => {
  const f = await fixture(false);
  try {
    expect((await readPublicCatalog(f.db.database,env)).products).toHaveLength(2);
    const response = await resource(f.context('PATCH',{description:'Nueva'}));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({error:{code:'PRODUCT_WEB_SETTINGS_MIGRATION_REQUIRED'}});
    expect(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM catalog_product_mutations').get()?.n).toBe(0);
  } finally {f.db.close();}
});

it('sube, reemplaza y quita imagen sin alterar publicación; valida bytes y conserva referencia ante falla', async () => {
  const f = await fixture();
  const bytes = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const upload = () => image({...f.context('PUT'),request:new Request(`https://example.test/api/admin/products/${f.product.id}/image`,{method:'PUT',headers:{origin:'https://example.test','content-type':'image/png'},body:bytes})});
  try {
    await resource(f.context('DELETE'));
    const first = await upload(); expect(first.status).toBe(200);
    const original = await getAdminDuxProductDetail(f.db.database,env,f.product.id);
    expect(original?.primaryImage?.src).toMatch(/^\/api\/catalog-images\//u);
    expect(original?.publicationStatus).toBe('unpublished');
    expect(f.bucket.keys.length).toBe(1);
    f.db.sqlite.exec(`CREATE TRIGGER fail_web_image BEFORE UPDATE OF images_json ON dux_product_web_settings BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;`);
    expect((await upload()).status).toBe(500);
    expect((await getAdminDuxProductDetail(f.db.database,env,f.product.id))?.primaryImage).toEqual(original?.primaryImage);
    expect(f.bucket.keys.length).toBe(1);
    f.db.sqlite.exec('DROP TRIGGER fail_web_image');
    expect((await upload()).status).toBe(200);
    expect(f.bucket.keys.length).toBe(1);
    expect((await image(f.context('DELETE'))).status).toBe(200);
    expect((await getAdminDuxProductDetail(f.db.database,env,f.product.id))?.images).toEqual([]);
    expect(f.bucket.keys.length).toBe(0);
    const invalid = await image({...f.context('PUT'),request:new Request('https://example.test/image',{method:'PUT',headers:{origin:'https://example.test','content-type':'image/png'},body:'not png'})});
    expect(invalid.status).toBe(415);
  } finally {f.db.close();}
});

it('impide usar un carrito viejo y conserva recuperación de solicitudes ya creadas', async () => {
  const f = await fixture();
  try {
    const snapshot = await readDuxCatalogSnapshot(f.db.database);
    const input = parseWebRequestInput({mode:'create',idempotencyKey:crypto.randomUUID(),ownerSecret:'a'.repeat(64),
      items:[{productId:f.product.id,quantity:1,catalogVersion:snapshot.catalogVersion}],
      fulfillment:{method:'coordinated_pickup',fullName:'Cliente de prueba',phone:'1234567890',address:'',locality:'',province:'',postalCode:''}});
    const create = (value = input) => createWebOrderRequest(f.db.database,value,'test-secret'.repeat(5),()=>Promise.resolve(snapshot),[]);
    const existing = await create();
    await writeDuxProductWebSettings(f.db.database,f.product.sku!,'test',{publicationStatus:'unpublished'});
    await expect(assertDuxProductsPublished(f.db.database,[f.product.sku!])).rejects.toMatchObject({code:'PRODUCT_UNPUBLISHED'});
    expect(await create()).toMatchObject({created:false,receipt:existing.receipt});
    await expect(create({...input,idempotencyKey:crypto.randomUUID()})).rejects.toMatchObject({code:'PRODUCT_UNPUBLISHED'});
    expect(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM checkout_intents').get()?.n).toBe(1);
  } finally {f.db.close();}
});

it('un override vacío oculta la fuente preservada sin destruirla', async () => {
  const f = await fixture();
  try {
    const inherited = {...f.product,description:'Origen conservado',shortDescription:'Breve',images:[{src:`/images/original/catalog/${'a'.repeat(64)}.webp`,alt:'Original'}]};
    await writeDuxProductWebSettings(f.db.database,f.product.sku!,'test',{description:'',images:[]});
    const result = (await applyDuxProductWebSettings(f.db.database,[inherited]))[0]!;
    expect(result.description).toBeUndefined(); expect(result.shortDescription).toBeUndefined(); expect(result.images).toEqual([]);
    expect(inherited.description).toBe('Origen conservado'); expect(inherited.images).toHaveLength(1);
  } finally {f.db.close();}
});

it('D1 impide que una baja concurrente al registro atraviese la validación de carrito', async () => {
  const f = await fixture();
  try {
    const snapshot = await readDuxCatalogSnapshot(f.db.database);
    const input = parseWebRequestInput({mode:'create',idempotencyKey:crypto.randomUUID(),ownerSecret:'a'.repeat(64),
      items:[{productId:f.product.id,quantity:1,catalogVersion:snapshot.catalogVersion}],
      fulfillment:{method:'coordinated_pickup',fullName:'Cliente de prueba',phone:'1234567890',address:'',locality:'',province:'',postalCode:''}});
    const batch = f.db.database.batch.bind(f.db.database);
    vi.spyOn(f.db.database,'batch').mockImplementationOnce(async statements => {
      await writeDuxProductWebSettings(f.db.database,f.product.sku!,'test',{publicationStatus:'unpublished'});
      return batch(statements);
    });
    await expect(createWebOrderRequest(f.db.database,input,'test-secret'.repeat(5),()=>Promise.resolve(snapshot),[])).rejects.toMatchObject({code:'PRODUCT_UNPUBLISHED'});
    expect(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM checkout_intents').get()?.n).toBe(0);
  } finally {f.db.close();}
});
