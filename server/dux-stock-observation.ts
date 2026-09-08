import { parseDuxWarehouseStocks, type DuxWarehouseStock } from '../src/catalog/model';
import type { DuxWarehouse } from './dux-api';
import { HttpError } from './http';

/** The complete warehouse directory establishes company ownership before any stock is used. */
export function authorizedDuxWarehouses(warehouses: readonly DuxWarehouse[], companyId: number): readonly DuxWarehouse[] {
  const ids = new Set<number>();
  for (const warehouse of warehouses) {
    if (ids.has(warehouse.id)) throw new HttpError(502, 'DUX_DUPLICATE_WAREHOUSE', 'Dux devolvió depósitos duplicados.');
    ids.add(warehouse.id);
  }
  return Object.freeze(warehouses.filter(w => w.companyId === companyId && w.enabled));
}

export function captureDuxWarehouseStocks(value: unknown, warehouses: readonly DuxWarehouse[]): readonly DuxWarehouseStock[] {
  if (!Array.isArray(value)) throw new HttpError(502, 'DUX_RESPONSE_INVALID', 'Dux no devolvió el bloque de inventario.');
  const permitted = new Map(warehouses.map(w => [w.id, w]));
  const rows: Record<string, unknown>[] = [];
  for (const raw of value as unknown[]) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new HttpError(502, 'DUX_RESPONSE_INVALID', 'Dux devolvió stock no válido.');
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'number' || !Number.isSafeInteger(r.id) || r.id <= 0) throw new HttpError(502, 'DUX_RESPONSE_INVALID', 'Dux devolvió un depósito no válido.');
    const warehouse = permitted.get(r.id);
    if (!warehouse) continue;
    rows.push({depositId:r.id, depositName:warehouse.name, variantId:r.id_det_item ?? null,
      barcode:optionalText(r.cod_barra_detalle), size:optionalText(r.talle), color:optionalText(r.color),
      real:r.stock_real ?? null, reserved:r.stock_reservado ?? null, available:r.stock_disponible ?? null});
  }
  for (const warehouse of warehouses) {
    if (!rows.some(r => r.depositId === warehouse.id)) rows.push({depositId:warehouse.id, depositName:warehouse.name,
      variantId:null, barcode:null, size:null, color:null, real:null, reserved:null, available:null});
  }
  try { return parseDuxWarehouseStocks(rows); }
  catch { throw new HttpError(502, 'DUX_RESPONSE_INVALID', 'Dux devolvió cantidades o identidades de stock no válidas.'); }
}

function optionalText(value: unknown): unknown {
  return value === '' || value === undefined ? null : value;
}
