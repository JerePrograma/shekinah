import { authorizedDuxWarehouses, captureDuxWarehouseStocks } from './dux-stock-observation';
import { parseDuxWarehouseStocks } from '../src/catalog/model';

const warehouses = [
  {id:3, companyId:1, name:'Central', enabled:true},
  {id:4, companyId:1, name:'Sucursal', enabled:true},
  {id:5, companyId:1, name:'Retirado', enabled:false},
  {id:6, companyId:2, name:'Otra empresa', enabled:true},
];

it('descubre sólo depósitos habilitados de la empresa, incluidas altas y bajas posteriores', () => {
  expect(authorizedDuxWarehouses(warehouses, 1).map(w=>w.id)).toEqual([3,4]);
  expect(authorizedDuxWarehouses([warehouses[1]!, {id:7,companyId:1,name:'Nuevo',enabled:true}],1).map(w=>w.id)).toEqual([4,7]);
  expect(()=>authorizedDuxWarehouses([...warehouses,warehouses[0]!],1)).toThrow('duplicados');
});

it('conserva cada cantidad, variantes, decimales, negativos y ausencias sin importar otro contexto', () => {
  const rows = captureDuxWarehouseStocks([
    {id:3, stock_real:1.123456, stock_reservado:2.5, stock_disponible:-1.376544, id_det_item:12, talle:'A'},
    {id:4, stock_real:null, stock_reservado:0},
    {id:6, stock_real:99, stock_reservado:0, stock_disponible:99},
  ], authorizedDuxWarehouses(warehouses,1));
  expect(rows).toMatchObject([
    {depositId:3, depositName:'Central', variantId:12, size:'A', real:1.123456, reserved:2.5, available:-1.376544},
    {depositId:4, real:null, reserved:0, available:null},
  ]);
  expect(parseDuxWarehouseStocks(JSON.parse(JSON.stringify(rows)) as unknown)).toEqual(rows);
  expect(captureDuxWarehouseStocks([], [warehouses[0]!])).toMatchObject([{real:null,reserved:null,available:null}]);
});

it('rechaza cantidades inválidas y duplicados en vez de sumar o reemplazar', () => {
  const row={id:3,stock_real:5,stock_reservado:0,stock_disponible:5};
  expect(()=>captureDuxWarehouseStocks([row,row],warehouses)).toThrow();
  expect(()=>captureDuxWarehouseStocks([row,{...row,talle:'Contradictorio'}],warehouses)).toThrow();
  expect(()=>captureDuxWarehouseStocks([{...row,talle:0}],warehouses)).toThrow();
  expect(()=>captureDuxWarehouseStocks([{...row,stock_real:'5'}],warehouses)).toThrow();
  expect(()=>captureDuxWarehouseStocks([{...row,id:'3'}],warehouses)).toThrow();
});
