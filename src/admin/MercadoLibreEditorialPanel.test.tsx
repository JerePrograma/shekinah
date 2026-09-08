import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MercadoLibreEditorialPanel } from './MercadoLibreEditorialPanel';

afterEach(()=>vi.unstubAllGlobals());
it('explica la conexión pendiente y no habilita importación sin el titular',async()=>{
  const fetchMock=vi.fn<typeof fetch>().mockResolvedValue(Response.json({enabled:false,configured:false,connection:{connected:false},latest:null}));
  vi.stubGlobal('fetch',fetchMock);render(<MercadoLibreEditorialPanel/>);
  expect(await screen.findByText(/Conexión editorial pendiente/u)).toBeVisible();
  expect(screen.getByRole('button',{name:'Actualizar contenido editorial'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'Revisar asociación'})).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('muestra progreso real de los pasos y finalización, sin invocar inventario',async()=>{
  const progress={id:'ml_editorial_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',status:'running',phase:'metadata',items:2,metadataCompleted:1,metadataTotal:2,contentCompleted:0,associations:0,issues:[]};
  const fetchMock=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({enabled:true,configured:true,connection:{connected:true},latest:null}))
    .mockResolvedValueOnce(Response.json(progress)).mockResolvedValueOnce(Response.json({...progress,status:'succeeded',phase:'complete',metadataCompleted:2}));
  vi.stubGlobal('fetch',fetchMock);render(<MercadoLibreEditorialPanel/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Actualizar contenido editorial'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Actualizar contenido editorial'}));
  expect(await screen.findByText(/Publicaciones: 1\/2/u)).toBeVisible();
  expect(await screen.findByText('Importación editorial completa.',{}, {timeout:3000})).toBeVisible();
  expect(fetchMock.mock.calls.map(([path])=>path)).toEqual(['/api/admin/mercadolibre/editorial/status','/api/admin/mercadolibre/editorial/sync','/api/admin/mercadolibre/editorial/sync']);
});
it('normaliza un fallo y mantiene la actualización independiente',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({error:{message:'No disponible'}},{status:503})));
  render(<MercadoLibreEditorialPanel/>);expect(await screen.findByRole('alert')).toHaveTextContent('No disponible');
  expect(screen.getByRole('button',{name:'Actualizar contenido editorial'})).toBeDisabled();
});
