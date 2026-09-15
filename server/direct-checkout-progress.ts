import { parseDuxOrderEvidence } from './dux-order-api';
import type { DuxCommerceItem, DuxOrderEvidence, DuxOrderRequest } from './dux-order-api';
import { HttpError } from './http';
import { isRecord } from './validation';

export type DirectLine = Readonly<{
  productId: string; code: string; name: string; quantity: number; unitPriceMinor: number;
  stockBefore: DuxCommerceItem; observedAt: string;
}>;
export type DirectProgress = Readonly<{
  version: 1; catalogVersion: string; lines: readonly DirectLine[];
  order: DuxOrderEvidence | null; stockAfter: readonly DuxCommerceItem[]; stockObservedAt: string | null;
}>;

export function parseDirectProgress(json: string): DirectProgress {
  try {
    const value: unknown = JSON.parse(json);
    if (!isRecord(value) || value.version !== 1 || typeof value.catalogVersion !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(value.catalogVersion) || !Array.isArray(value.lines) || value.lines.length > 50 ||
        !Array.isArray(value.stockAfter) || value.stockAfter.length > value.lines.length) throw invalid();
    const lines = value.lines.map((raw: unknown) => {
      if (!isRecord(raw) || typeof raw.productId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,179}$/u.test(raw.productId) ||
          typeof raw.observedAt !== 'string' || !Number.isFinite(Date.parse(raw.observedAt))) throw invalid();
      const item = parseItem(raw.stockBefore);
      if (raw.code !== item.code || raw.name !== item.name || raw.unitPriceMinor !== item.priceMinor) throw invalid();
      const quantity = integer(raw.quantity, 1, 99);
      if (Math.floor(item.availableStock) < quantity) throw invalid();
      return Object.freeze({ productId: raw.productId, code: item.code, name: item.name,
        unitPriceMinor: item.priceMinor, quantity, stockBefore: item, observedAt: raw.observedAt });
    });
    if (new Set(lines.map(line => line.code)).size !== lines.length || new Set(lines.map(line => line.productId)).size !== lines.length) throw invalid();
    const stockAfter = value.stockAfter.map(parseItem);
    if (new Set(stockAfter.map(item => item.code)).size !== stockAfter.length ||
        stockAfter.some(item => !lines.some(line => line.code === item.code))) throw invalid();
    const order = value.order === null ? null : parseNormalizedOrder(value.order);
    const stockObservedAt = value.stockObservedAt ?? null;
    if (stockObservedAt !== null && (typeof stockObservedAt !== 'string' || !Number.isFinite(Date.parse(stockObservedAt)))) throw invalid();
    if (stockAfter.length > 0 && stockObservedAt === null) throw invalid();
    return Object.freeze({ version: 1, catalogVersion: value.catalogVersion, lines, order, stockAfter, stockObservedAt });
  } catch { throw invalid(); }
}

export function directProviderRequest(progress: DirectProgress, tenant: Readonly<{
  companyId: number; branchId: number; depositId: number; personalId: number; customerId: number;
}>, reference: string, date: string): DuxOrderRequest {
  return Object.freeze({ id_empresa: tenant.companyId, id_sucursal: tenant.branchId,
    id_deposito: tenant.depositId, id_personal: tenant.personalId, id_cliente: tenant.customerId,
    referencia: reference, fecha: date,
    items: progress.lines.map(line => Object.freeze({ cod_item: line.code, ctd: line.quantity,
      // Dux recibe precio unitario neto e IVA por separado; el cliente ve el
      // precio final de la lista comercial. El total retornado se coteja luego.
      precio_uni: Number((line.unitPriceMinor / 100 / (1 + line.stockBefore.vatPercent / 100)).toFixed(8)),
      porc_iva: line.stockBefore.vatPercent, porc_desc: 0 as const,
    })),
  });
}

export function parseStoredProviderRequest(json: string): DuxOrderRequest {
  try {
    const value: unknown = JSON.parse(json);
    if (!isRecord(value) || !isRecord(value.providerRequest)) throw invalid();
    const raw = value.providerRequest;
    if (typeof raw.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(raw.fecha) ||
        !Number.isFinite(Date.parse(raw.fecha)) || !Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 50) throw invalid();
    const items = raw.items.map((entry: unknown) => {
      if (!isRecord(entry) || entry.porc_desc !== 0) throw invalid();
      return { cod_item: text(entry.cod_item, 300), ctd: integer(entry.ctd, 1, 99),
        precio_uni: number(entry.precio_uni, Number.MIN_VALUE), porc_iva: number(entry.porc_iva, 0, 100), porc_desc: 0 as const };
    });
    if (new Set(items.map(item => item.cod_item)).size !== items.length) throw invalid();
    return { id_empresa: integer(raw.id_empresa), id_sucursal: integer(raw.id_sucursal),
      id_deposito: integer(raw.id_deposito), id_personal: integer(raw.id_personal), id_cliente: integer(raw.id_cliente),
      referencia: text(raw.referencia, 200), fecha: raw.fecha, items };
  } catch { throw invalid(); }
}

export function hasPhysicalReservation(line: DirectLine, after: DuxCommerceItem): boolean {
  return after.code === line.code && after.availableStock >= 0 &&
    after.realStock === line.stockBefore.realStock &&
    after.reservedStock >= line.stockBefore.reservedStock + line.quantity &&
    after.availableStock <= line.stockBefore.availableStock - line.quantity;
}

function parseItem(value: unknown): DuxCommerceItem {
  if (!isRecord(value)) throw invalid();
  return { code: text(value.code, 300), name: text(value.name, 500), priceMinor: integer(value.priceMinor),
    vatPercent: number(value.vatPercent, 0, 100), realStock: number(value.realStock, -Number.MAX_VALUE),
    reservedStock: number(value.reservedStock, 0), availableStock: number(value.availableStock, -Number.MAX_VALUE) };
}
function parseNormalizedOrder(value: unknown): DuxOrderEvidence {
  if (!isRecord(value) || !Array.isArray(value.lines)) throw invalid();
  return parseDuxOrderEvidence({ id_pedido: value.id, nro_pedido: value.number, id_empresa: value.companyId,
    id_sucursal_empresa: value.branchId, referencia: value.reference, anulado: value.cancelled,
    id_moneda: 1, total: integer(value.totalMinor) / 100,
    estado_facturacion: value.invoiceState, estado_remito: value.deliveryState,
    detalles: value.lines.map((entry: unknown) => {
      if (!isRecord(entry)) throw invalid();
      return { cod_item: entry.code, id_det_item: entry.variantId, ctd: entry.quantity,
        precio_uni: entry.unitPrice, porc_iva: entry.vatPercent, porc_desc: entry.discountPercent };
    }),
  });
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw invalid();
  return value;
}
function integer(value: unknown, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  const result = number(value, min, max);
  if (!Number.isSafeInteger(result)) throw invalid();
  return result;
}
function number(value: unknown, min: number, max = Number.MAX_VALUE): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw invalid();
  return value;
}
function invalid(): HttpError {
  return new HttpError(503, 'DIRECT_CHECKOUT_EVIDENCE_INVALID', 'La preparación de la compra necesita revisión.');
}
