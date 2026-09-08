import { importEditorialImage } from './mercado-libre-editorial-images';
import { MAX_CATALOG_IMAGE_BYTES } from './catalog-images';
import { MemoryR2Bucket } from './test/memory-r2';

const picture={id:'image-1',url:'https://http2.mlstatic.com/D_NQ_NP_TEST123-O.png'};
const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),character=>character.charCodeAt(0));
afterEach(()=>vi.unstubAllGlobals());
it('conserva bytes originales, deduplica por hash y nunca sigue redirecciones',async()=>{
  const bucket=new MemoryR2Bucket(),put=vi.spyOn(bucket,'put');
  const fetchMock=vi.fn().mockImplementation(()=>Promise.resolve(new Response(png,{headers:{'content-type':'image/png'}})));vi.stubGlobal('fetch',fetchMock);
  const first=await importEditorialImage({CATALOG_IMAGES:bucket},picture,'Dux');
  const again=await importEditorialImage({CATALOG_IMAGES:bucket},picture,'Dux');
  expect(first).toEqual(again);expect(put).toHaveBeenCalledTimes(1);expect(put.mock.calls[0]?.[1]).toEqual(png);
  expect(fetchMock).toHaveBeenCalledWith(picture.url,expect.objectContaining({method:'GET',redirect:'error'}));
});
it.each([
  ['text/html','<script>alert(1)</script>'],['image/png','no es una imagen'],['image/svg+xml','<svg/>'],
] as const)('descarta tipo o contenido incompatible %s',async(type,body)=>{
  const bucket=new MemoryR2Bucket();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(body,{headers:{'content-type':type}})));
  expect(await importEditorialImage({CATALOG_IMAGES:bucket},picture,'Dux')).toBeNull();expect(bucket.keys).toHaveLength(0);
});
it('limita tamaño declarado y tamaño real de streams',async()=>{
  const bucket=new MemoryR2Bucket();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(png,{headers:{'content-type':'image/png','content-length':String(MAX_CATALOG_IMAGE_BYTES+1)}})));
  expect(await importEditorialImage({CATALOG_IMAGES:bucket},picture,'Dux')).toBeNull();
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new Uint8Array(MAX_CATALOG_IMAGE_BYTES+1),{headers:{'content-type':'image/png'}})));
  expect(await importEditorialImage({CATALOG_IMAGES:bucket},picture,'Dux')).toBeNull();expect(bucket.keys).toHaveLength(0);
});
it('distingue ausencia confirmada del medio y error temporal',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status:404})));
  expect(await importEditorialImage({},picture,'Dux')).toBeNull();
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status:503})));
  await expect(importEditorialImage({},picture,'Dux')).rejects.toMatchObject({code:'ML_EDITORIAL_IMAGE_UNAVAILABLE'});
});
