import { DUX_API_BASE_URL, parseDuxItemPage, selectDuxItemStock } from './dux-api';
import type { DuxFetch } from './dux-api';
import { DUX_PUBLIC_PRICE_LIST_NAME, parseDuxCatalogSourceItems } from './dux-catalog';
import { HttpError } from './http';

// Contrato oficial /reference/crear_pedido.md y /reference/listar_pedidos.md,
// revisado el 2026-09-15. Un pedido devuelto no acredita por sí solo su reserva.
export type DuxOrderRequest = Readonly<{
  id_empresa: number;
  id_sucursal: number;
  id_personal: number;
  id_cliente: number;
  id_deposito: number;
  fecha: string;
  referencia: string;
  items: readonly Readonly<{
    cod_item: string;
    ctd: number;
    precio_uni: number;
    porc_iva: number;
    porc_desc: 0;
  }>[];
}>;

export type DuxOrderEvidence = Readonly<{
  id: number;
  number: number;
  companyId: number;
  branchId: number;
  reference: string;
  cancelled: boolean;
  totalMinor: number;
  invoiceState: string;
  deliveryState: string;
  lines: readonly Readonly<{
    code: string;
    variantId: number | null;
    quantity: number;
    unitPrice: number;
    vatPercent: number;
    discountPercent: number;
  }>[];
}>;

export type DuxOrderLookup = Readonly<{
  companyId: number;
  branchId: number;
  reference: string;
  dateFrom: string;
  dateTo: string;
}>;

export type DuxCommerceItem = Readonly<{
  code: string;
  name: string;
  priceMinor: number;
  vatPercent: number;
  realStock: number;
  reservedStock: number;
  availableStock: number;
}>;

export class DuxOrderApiClient {
  private readonly fetchImplementation: DuxFetch;

  constructor(private readonly options: Readonly<{
    accessToken: string;
    // El coordinador D1 debe autorizar y espaciar TODAS las llamadas del tenant,
    // incluidas las de reconciliación. No usar un reloj aislado por comprador.
    beforeRequest: () => Promise<void>;
    fetch?: DuxFetch;
  }>) {
    if (!options.accessToken || options.accessToken.length > 4096 || options.accessToken.trim() !== options.accessToken) {
      throw new HttpError(503, 'DUX_TOKEN_INVALID', 'Dux no está configurado correctamente.');
    }
    // El fetch nativo de Workers no admite una instancia ajena como `this`.
    this.fetchImplementation = options.fetch ?? ((input, init) => fetch(input, init));
  }

  async readItem(code: string, depositId: number): Promise<DuxCommerceItem> {
    const parameters = new URLSearchParams({ cod_item: text(code, 300), id_deposito: String(identifier(depositId)), offset: '0', limit: '50' });
    const value = await this.request('/v2/items', parameters);
    const page = parseDuxItemPage(value);
    if (page.pagination.total !== 1 || page.data.length !== 1 || page.pagination.hasMore || page.pagination.offset !== 0) throw invalid();
    const item = page.data[0];
    if (item === undefined || item.code !== code || !item.enabled) throw invalid();
    const stock = selectDuxItemStock(item, { warehouseId: depositId });
    if (stock.variantDetailId !== null) throw invalid();
    const source = parseDuxCatalogSourceItems(value)[0];
    const prices = source?.prices?.filter((price) => price.name?.toLocaleUpperCase('es-AR') === DUX_PUBLIC_PRICE_LIST_NAME);
    const price = prices?.[0];
    if (prices?.length !== 1 || price?.valid !== true || price.amount === null || price.amount <= 2) throw invalid();
    const raw = record(value);
    if (!Array.isArray(raw.datos)) throw invalid();
    return Object.freeze({
      code: item.code, name: item.name, priceMinor: money(price.amount),
      vatPercent: percentage(record(raw.datos[0]).porc_iva),
      realStock: stock.realQuantity, reservedStock: stock.reservedQuantity,
      availableStock: stock.availableQuantity,
    });
  }

  async findOrder(lookup: DuxOrderLookup): Promise<DuxOrderEvidence | null> {
    const parameters = new URLSearchParams({
      id_empresa: String(identifier(lookup.companyId)), id_sucursal: String(identifier(lookup.branchId)),
      referencia: text(lookup.reference, 200), fecha_desde: date(lookup.dateFrom), fecha_hasta: date(lookup.dateTo),
      offset: '0', limit: '50',
    });
    const value = record(await this.request('/v2/pedidos', parameters));
    const pagination = record(value.paginacion);
    if (!Array.isArray(value.datos) || value.datos.length > 50 || pagination.hay_mas !== false ||
        pagination.offset !== 0 || pagination.limit !== 50 || pagination.total !== value.datos.length) throw invalid();
    const orders = value.datos.map(parseDuxOrderEvidence);
    if (orders.some((order) => order.companyId !== lookup.companyId || order.branchId !== lookup.branchId)) throw invalid();
    // El filtro del proveedor no se presupone exacto: la referencia retornada
    // se coteja antes de recuperar un POST cuyo resultado sea desconocido.
    const matching = orders.filter((order) => order.reference === lookup.reference);
    if (matching.length > 1) {
      throw new HttpError(409, 'DUX_ORDER_REFERENCE_AMBIGUOUS', 'Dux devolvió más de un pedido para esta compra.');
    }
    return matching[0] ?? null;
  }

  async createOrder(input: DuxOrderRequest, beforeSend?: () => Promise<void>): Promise<DuxOrderEvidence> {
    const body = validateOrderRequest(input);
    // Nunca reintentar un POST, ni ante 429/5xx, timeout, JSON inválido o una
    // respuesta incompleta. El llamador conserva el intento y consulta referencia.
    const value = await this.request('/v2/pedidos', new URLSearchParams(), body, beforeSend);
    try {
      const order = parseDuxOrderEvidence(record(value).datos);
      if (!duxOrderMatchesRequest(order, body)) throw invalid();
      return order;
    }
    catch { throw uncertain(); }
  }

  private async request(path: '/v2/items' | '/v2/pedidos', parameters: URLSearchParams, body?: DuxOrderRequest, beforeSend?: () => Promise<void>): Promise<unknown> {
    await this.options.beforeRequest();
    if (beforeSend !== undefined) await beforeSend();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    let headersReceived = false;
    try {
      const url = new URL(`${DUX_API_BASE_URL}${path}`);
      url.search = parameters.toString();
      const response = await this.fetchImplementation(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${this.options.accessToken}`, accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        redirect: 'manual', cache: 'no-store', signal: controller.signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      headersReceived = true;
      if (!response.ok) {
        // Sólo metadatos acotados: nunca token, query, referencia, headers ni
        // cuerpo del proveedor. El diagnóstico no cambia retries ni guards.
        console.warn('dux_order_api_transport_failure', {
          endpoint: path, method: body === undefined ? 'GET' : 'POST', providerStatus: response.status,
        });
        await response.body?.cancel();
        throw body === undefined ? unavailable() : uncertain();
      }
      return await readBoundedJson(response);
    } catch (error: unknown) {
      if (!headersReceived) {
        console.warn('dux_order_api_transport_failure', {
          endpoint: path, method: body === undefined ? 'GET' : 'POST', providerStatus: null,
          errorClass: controller.signal.aborted ? 'timeout' : 'fetch_exception',
        });
      }
      if (body !== undefined) throw uncertain();
      if (error instanceof HttpError) throw error;
      throw unavailable();
    } finally { clearTimeout(timer); }
  }
}

export function duxOrderMatchesRequest(order: DuxOrderEvidence, input: DuxOrderRequest): boolean {
  if (order.companyId !== input.id_empresa || order.branchId !== input.id_sucursal ||
      order.reference !== input.referencia || order.cancelled || order.lines.length !== input.items.length) return false;
  const seen = new Set<string>();
  return order.lines.every((line) => {
    const expected = input.items.find((item) => item.cod_item === line.code);
    if (seen.has(line.code) || expected === undefined || line.variantId !== null) return false;
    seen.add(line.code);
    return line.quantity === expected.ctd && Math.abs(line.unitPrice - expected.precio_uni) < 0.00000001 &&
      line.vatPercent === expected.porc_iva && line.discountPercent === expected.porc_desc;
  });
}

export function parseDuxOrderEvidence(value: unknown): DuxOrderEvidence {
  const row = record(value);
  if (typeof row.anulado !== 'boolean' || !Array.isArray(row.detalles) || row.detalles.length < 1 || row.detalles.length > 50 || row.id_moneda !== 1) throw invalid();
  return Object.freeze({
    id: identifier(row.id_pedido), number: identifier(row.nro_pedido),
    companyId: identifier(row.id_empresa), branchId: identifier(row.id_sucursal_empresa),
    reference: text(row.referencia, 200), cancelled: row.anulado, totalMinor: money(row.total),
    invoiceState: text(row.estado_facturacion, 80), deliveryState: text(row.estado_remito, 80),
    lines: Object.freeze(row.detalles.map((value: unknown) => {
      const line = record(value);
      return Object.freeze({
        code: text(line.cod_item, 300), variantId: line.id_det_item == null ? null : identifier(line.id_det_item),
        quantity: positive(line.ctd), unitPrice: positive(line.precio_uni),
        vatPercent: percentage(line.porc_iva), discountPercent: percentage(line.porc_desc),
      });
    })),
  });
}

function validateOrderRequest(input: DuxOrderRequest): DuxOrderRequest {
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) throw invalid();
  const codes = new Set<string>();
  return Object.freeze({
    id_empresa: identifier(input.id_empresa), id_sucursal: identifier(input.id_sucursal),
    id_personal: identifier(input.id_personal), id_cliente: identifier(input.id_cliente),
    id_deposito: identifier(input.id_deposito), fecha: date(input.fecha), referencia: text(input.referencia, 200),
    items: Object.freeze(input.items.map((item: DuxOrderRequest['items'][number]) => {
      const code = text(item.cod_item, 300);
      if (codes.has(code) || !Number.isSafeInteger(item.ctd) || item.ctd < 1 || item.ctd > 99 || item.porc_desc !== 0) throw invalid();
      codes.add(code);
      return Object.freeze({ cod_item: code, ctd: item.ctd, precio_uni: positive(item.precio_uni), porc_iva: percentage(item.porc_iva), porc_desc: 0 as const });
    })),
  });
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw invalid();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let content = '';
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 2_000_000) { await reader.cancel(); throw invalid(); }
      content += decoder.decode(chunk.value, { stream: true });
    }
    content += decoder.decode();
    return JSON.parse(content) as unknown;
  } catch { throw invalid(); }
  finally { reader.releaseLock(); }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function identifier(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw invalid();
  return value;
}
function positive(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw invalid();
  return value;
}
function percentage(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw invalid();
  return value;
}
function money(value: unknown): number {
  const minor = Math.round(positive(value) * 100);
  if (!Number.isSafeInteger(minor) || minor <= 0) throw invalid();
  return minor;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maximum ||
      [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw invalid();
  return value;
}
function date(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw invalid();
  return value;
}
function invalid(): HttpError { return new HttpError(502, 'DUX_ORDER_RESPONSE_INVALID', 'No se pudo verificar el pedido o los productos en Dux.'); }
function unavailable(): HttpError { return new HttpError(503, 'DUX_ORDER_QUERY_UNAVAILABLE', 'No se pudo consultar Dux. Tu compra se conserva.'); }
function uncertain(): HttpError { return new HttpError(409, 'DUX_ORDER_RESULT_UNCERTAIN', 'Estamos verificando el pedido en Dux. No vuelvas a cargar la compra.'); }
