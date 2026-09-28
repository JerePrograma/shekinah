import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MercadoLibreEditorialPanel } from './MercadoLibreEditorialPanel';

afterEach(()=>vi.unstubAllGlobals());
it.each([
  { enabled: false, configured: true, connected: false, authorize: false, sync: false },
  { enabled: true, configured: false, connected: false, authorize: false, sync: false },
  { enabled: true, configured: true, connected: false, authorize: true, sync: false },
  { enabled: true, configured: true, connected: true, authorize: false, sync: true },
])('ofrece sólo las acciones permitidas por la conexión $enabled/$configured/$connected',async state=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({...state,connection:{connected:state.connected},latest:null})));
  render(<MercadoLibreEditorialPanel/>);
  await waitFor(()=>expect(screen.queryByText('Consultando la conexión con Mercado Libre…')).not.toBeInTheDocument());
  expect(screen.queryByRole('button',{name:'Autorizar cuenta de Mercado Libre'})!==null).toBe(state.authorize);
  expect(screen.getByRole('button',{name:'Actualizar contenido de los productos'})).toHaveProperty('disabled',!state.sync);
});
it('explica la conexión pendiente y no habilita importación sin el titular',async()=>{
  const fetchMock=vi.fn<typeof fetch>().mockResolvedValue(Response.json({enabled:false,configured:false,connection:{connected:false},latest:null}));
  vi.stubGlobal('fetch',fetchMock);render(<MercadoLibreEditorialPanel/>);
  expect(await screen.findByText(/La conexión con Mercado Libre necesita preparación/u)).toBeVisible();
  expect(screen.getByText(/publicaciones activas.*nombre, las fotos y la descripción/u)).toBeVisible();
  expect(screen.getByRole('button',{name:'Actualizar contenido de los productos'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'Buscar publicaciones para este producto'})).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('muestra progreso real de los pasos y finalización, sin invocar inventario',async()=>{
  const progress={id:'ml_editorial_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',status:'running',phase:'metadata',items:2,metadataCompleted:1,metadataTotal:2,contentCompleted:0,associations:0,issues:[]};
  const fetchMock=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({enabled:true,configured:true,connection:{connected:true},latest:null}))
    .mockResolvedValueOnce(Response.json(progress)).mockResolvedValueOnce(Response.json({...progress,status:'succeeded',phase:'complete',metadataCompleted:2}));
  vi.stubGlobal('fetch',fetchMock);render(<MercadoLibreEditorialPanel/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Actualizar contenido de los productos'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Actualizar contenido de los productos'}));
  expect(await screen.findByText(/Publicaciones revisadas: 1 de 2/u)).toHaveTextContent('Revisando las publicaciones encontradas.');
  expect(screen.getByText(/Estado: running. Etapa: metadata/u)).not.toBeVisible();
  expect(await screen.findByText('Contenido actualizado. Ya podés revisar los productos.',{}, {timeout:3000})).toBeVisible();
  expect(fetchMock.mock.calls.map(([path])=>path)).toEqual(['/api/admin/mercadolibre/editorial/status','/api/admin/mercadolibre/editorial/sync','/api/admin/mercadolibre/editorial/sync']);
});
it('normaliza un fallo y mantiene la actualización independiente',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({error:{message:'No disponible'}},{status:503})));
  render(<MercadoLibreEditorialPanel/>);expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos completar la consulta o el cambio de contenido');
  expect(screen.getByText(': No disponible')).not.toBeVisible();
  expect(screen.getByRole('button',{name:'Actualizar contenido de los productos'})).toBeDisabled();
});

it.each(['toString','constructor','__proto__'])('usa un mensaje seguro para el código externo desconocido %s',async code=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({error:{code,message:'Detalle para soporte'}},{status:503})));
  render(<MercadoLibreEditorialPanel/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos completar la consulta o el cambio de contenido.');
  expect(screen.getByText(`${code}: Detalle para soporte`)).not.toBeVisible();
  expect(screen.getByRole('button',{name:'Volver a consultar Mercado Libre'})).toBeEnabled();
});

it('explica cómo resolver la falta de una primera actualización sin mostrar el código técnico',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({enabled:true,configured:true,connection:{connected:true},latest:null}))
    .mockResolvedValueOnce(Response.json({error:{code:'ML_EDITORIAL_INITIAL_IMPORT_REQUIRED',message:'El estado editorial no existe.'}},{status:409})));
  render(<MercadoLibreEditorialPanel/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Buscar publicaciones para este producto'})).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Código del producto en Dux'),{target:{value:'DU1'}});
  fireEvent.click(screen.getByRole('button',{name:'Buscar publicaciones para este producto'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Primero actualizá el contenido de los productos.');
  expect(screen.getByText(/ML_EDITORIAL_INITIAL_IMPORT_REQUIRED:/u)).not.toBeVisible();
  fireEvent.click(screen.getByText('Información para soporte: Mercado Libre'));
  expect(screen.getByText(/ML_EDITORIAL_INITIAL_IMPORT_REQUIRED:/u)).toBeVisible();
});

it('vuelve a consultar una conexión fallida sin iniciar una importación',async()=>{
  const fetchMock=vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('network internal'))
    .mockResolvedValueOnce(Response.json({enabled:true,configured:true,connection:{connected:true},latest:null}));
  vi.stubGlobal('fetch',fetchMock);render(<MercadoLibreEditorialPanel/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Volvé a consultar el estado');
  fireEvent.click(screen.getByRole('button',{name:'Volver a consultar Mercado Libre'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Actualizar contenido de los productos'})).toBeEnabled());
  expect(screen.getByRole('heading',{name:'Contenido de Mercado Libre'})).toHaveFocus();
  expect(fetchMock.mock.calls.map(([path])=>path)).toEqual(['/api/admin/mercadolibre/editorial/status','/api/admin/mercadolibre/editorial/status']);
});

it('presenta la revisión en español y conserva las comprobaciones y el contrato de aprobación',async()=>{
  const review={dux:{name:'Producto de prueba',code:'DU1',unitsPerPackage:1},duxIdentityHash:'identity',association:null,
    candidates:[{unique:true}],sources:[{hash:'evidence',units:[{itemId:'MLA12345',variationId:'123',title:'Publicación de prueba',status:'active',sku:'DU1',pictures:[],
      attributes:[{id:'COLOR',value:'Verde'},{id:'CUSTOM_ATTRIBUTE',value:'Dato informado'}]}]}]};
  const fetchMock=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({enabled:true,configured:true,connection:{connected:true},latest:null}))
    .mockResolvedValueOnce(Response.json(review)).mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(Response.json(review));
  vi.stubGlobal('fetch',fetchMock);render(<MercadoLibreEditorialPanel/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Buscar publicaciones para este producto'})).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Código del producto en Dux'),{target:{value:'DU1'}});
  fireEvent.click(screen.getByRole('button',{name:'Buscar publicaciones para este producto'}));
  fireEvent.change(await screen.findByLabelText('Publicación y variante'),{target:{value:'MLA12345:123'}});
  expect(screen.getByText('Color: Verde')).toBeVisible();
  expect(screen.getByText('Característica de la publicación: Dato informado')).toBeVisible();
  expect(screen.getByText('CUSTOM_ATTRIBUTE: Dato informado')).not.toBeVisible();
  const approve=screen.getByRole('button',{name:'Usar esta publicación para el producto'});
  expect(approve).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox',{name:'Comprobé que es el mismo producto y presentación.'}));
  fireEvent.click(screen.getByRole('checkbox',{name:'Comprobé la cantidad y el contenido del paquete.'}));
  fireEvent.click(screen.getByRole('checkbox',{name:'Comprobé la variante exacta, sin mezclar presentaciones.'}));
  fireEvent.change(screen.getByLabelText('Qué comprobaste y por qué tomás esta decisión'),{target:{value:'Presentación y cantidad comprobadas.'}});
  expect(approve).toBeEnabled();
  fireEvent.click(approve);
  await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith('/api/admin/mercadolibre/editorial/review',expect.objectContaining({method:'POST',body:JSON.stringify({
    code:'DU1',itemId:'MLA12345',variationId:'123',evidenceHash:'evidence',duxIdentityHash:'identity',decision:'approve',reason:'Presentación y cantidad comprobadas.',
    presentationVerified:true,packVerified:true,variantVerified:true,images:true,description:true,expectedRevision:0,
  })})));
});
