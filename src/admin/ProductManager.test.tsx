import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProductManager } from './ProductManager';
import { duxApiFixture } from '../test/dux-api-fixture';

const product={id:'dux-test',slug:'dux-test',path:'/dux-test/',name:'Producto Dux',sku:'DUX-1',price:{amount:1000,currency:'ARS'},priceStatus:'usable',
  categorySlugs:['dux-rubro-1'],categoryNames:['Rubro Dux'],images:[],variants:[],availability:'unavailable',
  commerce:{source:'dux',catalogVersion:'a'.repeat(64),syncedAt:'2026-09-08T12:01:00.000Z',stockSyncedAt:'2026-09-08T12:00:00.000Z',
    availabilityState:'unavailable',checkoutEligible:false,mappingStatus:'unmapped',quantitySemanticsStatus:'unavailable_from_v2_items',
    observedStock:{real:2.375,reserved:0.125,available:2.25},depositName:'Principal'}};
const payload=duxApiFixture({products:[product],imageStorageConfigured:true});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

it('muestra identidad Dux y cantidades sin habilitar creación, edición ni stock manual',async()=>{
  const request=vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));vi.stubGlobal('fetch',request);
  render(<ProductManager/>);
  expect(await screen.findByRole('heading',{name:'Producto Dux'})).toBeVisible();
  expect(screen.getByText('Productos manuales')).toBeVisible();
  expect(screen.getByText('Stock real')).toBeVisible();expect(screen.getByText('Reservado')).toBeVisible();
  expect(screen.getByText('Disponible',{selector:'strong'})).toBeVisible();
  expect(screen.queryByRole('button',{name:'Nuevo producto'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/Editar|Eliminar|Pausar/u})).not.toBeInTheDocument();
  expect(request.mock.calls.every(call=>!call[1]?.method||call[1].method==='GET')).toBe(true);
});

it.each([undefined,false])('rechaza respuestas antiguas aunque el indicador de retiro sea %s',async marker=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({...payload,manualCatalogRetired:marker})));
  render(<ProductManager/>);expect(await screen.findByRole('heading',{name:'No pudimos cargar los productos'})).toBeVisible();
  expect(screen.queryByRole('heading',{name:'Producto Dux'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Nuevo producto'})).not.toBeInTheDocument();
});

it('rechaza un producto sin procedencia Dux incluso si la respuesta declara el retiro',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({...payload,products:[{...product,commerce:undefined}]})));
  render(<ProductManager/>);expect(await screen.findByRole('heading',{name:'No pudimos cargar los productos'})).toBeVisible();
});

it('conserva búsqueda, categorías, reintento y productos sin precio ni contenido',async()=>{
  const request=vi.fn().mockResolvedValueOnce(Response.json({error:{message:'Temporal'}},{status:503}))
    .mockResolvedValue(Response.json(duxApiFixture({products:[product,{...product,id:'dux-vacio',slug:'dux-vacio',path:'/dux-vacio/',sku:'DUX-2',name:'Sin precio',price:null,priceStatus:'missing_or_zero'}],imageStorageConfigured:true})));
  vi.stubGlobal('fetch',request);render(<ProductManager/>);
  expect(await screen.findByRole('heading',{name:'No pudimos cargar los productos'})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:/Reintentar/u}));
  expect(await screen.findByRole('heading',{name:'Sin precio'})).toBeVisible();
  fireEvent.change(screen.getByRole('searchbox',{name:'Buscar'}),{target:{value:'DUX-2'}});
  await waitFor(()=>expect(screen.queryByRole('heading',{name:'Producto Dux'})).not.toBeInTheDocument());
  expect(screen.getByRole('heading',{name:'Sin precio'})).toBeVisible();
});
