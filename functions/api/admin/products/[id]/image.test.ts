import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createTestD1} from '../../../../../src/test/d1';
import {MemoryR2Bucket} from '../../../../../server/test/memory-r2';
import {onRequest} from './image';

it.each(['PUT','DELETE'])('la ruta manual de imagen %s no lee ni modifica R2',async method=>{
  const db=createTestD1(...['0001_commerce.sql','0004_catalog_admin.sql'].map(file=>readFileSync(resolve('migrations',file),'utf8')));
  const bucket=new MemoryR2Bucket();const put=vi.spyOn(bucket,'put'),get=vi.spyOn(bucket,'get'),remove=vi.spyOn(bucket,'delete');
  try{
    const response=await onRequest({env:{DB:db.database,CATALOG_IMAGES:bucket,PUBLIC_SITE_URL:'https://example.test'},
      request:new Request('https://example.test/api/admin/products/old/image',{method,headers:{origin:'https://example.test'}}),
      params:{id:'old'},data:{adminIdentity:{actor:'test',sub:'test',authMethod:'password'}},next:()=>Promise.resolve(new Response()),waitUntil:()=>{}});
    expect(response.status).toBe(409);expect(put).not.toHaveBeenCalled();expect(get).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();
  }finally{db.close();}
});
