import { act, render, screen } from '@testing-library/react';
import { DuxStock } from './DuxStock';
import { parseProduct } from './model';

afterEach(()=>vi.useRealTimers());
it('avisa al superar 15 minutos sin cambiar la fecha ni ocultar cantidades ausentes', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-08T12:14:59Z'));
  const product=parseProduct({id:'dux-test',slug:'dux-test',path:'/dux-test/',name:'Dux',categorySlugs:[],categoryNames:[],price:null,priceStatus:'missing_or_zero',
    commerce:{source:'dux',catalogVersion:'a'.repeat(64),syncedAt:'2026-09-08T12:01:00Z',stockSyncedAt:'2026-09-08T12:00:00Z',
      availabilityState:'unavailable',checkoutEligible:false,mappingStatus:'unmapped',quantitySemanticsStatus:'unavailable_from_v2_items',
      warehouseStocks:[{depositId:3,depositName:'Central',variantId:null,barcode:null,size:null,color:null,real:-1.25,reserved:null,available:-2.5},
        {depositId:4,depositName:'Sucursal',variantId:12,barcode:null,size:'A',color:null,real:null,reserved:0,available:null}]}});
  render(<DuxStock product={product}/>);
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByText(/no permite confirmar un total/u)).toBeVisible();
  expect(screen.getAllByText('No informado')).toHaveLength(3);
  expect(document.querySelector('time')).toHaveTextContent('09:00:00');
  await act(()=>vi.advanceTimersByTime(2000));
  expect(screen.getByRole('status')).toHaveTextContent('15 minutos');
  expect(document.querySelector('time')).toHaveAttribute('datetime','2026-09-08T12:00:00Z');
  expect(screen.getByText('-2,5')).toBeVisible();
});
