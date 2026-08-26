import { HttpError } from './http';

export const DUX_API_BASE_URL = 'https://erp.duxsoftware.com.ar/WSERP/rest/services';
export const DUX_INVENTORY_SEMANTICS_NOT_AVAILABLE = 'not_available_from_v2_items';

const DEFAULT_MIN_REQUEST_INTERVAL_MS = 5_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_GET_ATTEMPTS = 3;
const DEFAULT_MAX_RETRY_DELAY_MS = 30_000;
const ITEM_PAGE_LIMIT = 50;
// Con 50 items por página, este techo admite 5.000 items y mantiene una
// corrida completa dentro del lease D1 de 30 minutos aun si cada GET consume
// casi todo el timeout de 12 segundos. Excederlo falla cerrado.
const MAX_ITEM_PAGES = 100;
const MAX_RESPONSE_BYTES = 2_000_000;

export type DuxFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type DuxInventorySemantics = Readonly<{
  unitOfMeasure: typeof DUX_INVENTORY_SEMANTICS_NOT_AVAILABLE;
  weighable: typeof DUX_INVENTORY_SEMANTICS_NOT_AVAILABLE;
  decimalAllowed: typeof DUX_INVENTORY_SEMANTICS_NOT_AVAILABLE;
  divisibility: typeof DUX_INVENTORY_SEMANTICS_NOT_AVAILABLE;
}>;

export const DUX_V2_ITEM_INVENTORY_SEMANTICS: DuxInventorySemantics = Object.freeze({
  unitOfMeasure: DUX_INVENTORY_SEMANTICS_NOT_AVAILABLE,
  weighable: DUX_INVENTORY_SEMANTICS_NOT_AVAILABLE,
  decimalAllowed: DUX_INVENTORY_SEMANTICS_NOT_AVAILABLE,
  divisibility: DUX_INVENTORY_SEMANTICS_NOT_AVAILABLE,
});

export type DuxPagination = Readonly<{
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}>;

export type DuxPage<T> = Readonly<{
  data: readonly T[];
  pagination: DuxPagination;
  requestId: string | null;
}>;

export type DuxCompany = Readonly<{
  id: number;
  legalName: string;
}>;

export type DuxBranch = Readonly<{
  id: number;
  companyId: number;
  name: string;
}>;

export type DuxWarehouse = Readonly<{
  id: number;
  companyId: number;
  name: string;
  enabled: boolean;
}>;

export type DuxItemStock = Readonly<{
  warehouseId: number;
  warehouseName: string;
  realQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  variantDetailId: number | null;
  variantBarcode: string | null;
  size: string | null;
  color: string | null;
}>;

export type DuxItem = Readonly<{
  code: string;
  externalCode: string | null;
  name: string;
  barcodes: readonly string[];
  enabled: boolean;
  unitsPerPackage: number | null;
  stocks: readonly DuxItemStock[];
  inventorySemantics: DuxInventorySemantics;
}>;

export type DuxSelectedItemStock = DuxItemStock & Readonly<{
  itemCode: string;
  inventorySemantics: DuxInventorySemantics;
}>;

export type DuxItemType = 'SIMPLE' | 'COMPUESTO' | 'PRODUCCION';

export type DuxListItemsFilters = Readonly<{
  itemCode?: string;
  brandCode?: string;
  priceListId?: number;
  warehouseId?: number;
  categoryId?: number;
  subcategoryId?: number;
  supplierId?: number;
  enabled?: boolean;
  updatedSince?: string;
  itemType?: DuxItemType;
}>;

export type DuxListItemsPageOptions = DuxListItemsFilters & Readonly<{
  offset?: number;
  limit?: number;
}>;

export type DuxApiClientOptions = Readonly<{
  accessToken: string;
  fetch?: DuxFetch;
  clock?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  minRequestIntervalMs?: number;
  requestTimeoutMs?: number;
  maxGetAttempts?: number;
  maxRetryDelayMs?: number;
  beforeRequest?: () => Promise<void>;
}>;

export class DuxApiError extends HttpError {
  readonly providerStatus: number | null;

  constructor(
    status: number,
    code: string,
    message: string,
    providerStatus: number | null = null,
  ) {
    super(status, code, message);
    this.name = 'DuxApiError';
    this.providerStatus = providerStatus;
  }
}

/**
 * Cliente exclusivamente server-side para las lecturas oficiales de Dux API v2.
 * No expone operaciones mutables ni registra el token o cuerpos del proveedor.
 */
export class DuxApiClient {
  private readonly accessToken: string;
  private readonly fetchImplementation: DuxFetch;
  private readonly clock: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly minRequestIntervalMs: number;
  private readonly requestTimeoutMs: number;
  private readonly maxGetAttempts: number;
  private readonly maxRetryDelayMs: number;
  private readonly beforeRequest: () => Promise<void>;
  private requestQueue: Promise<void> = Promise.resolve();
  private nextRequestAt = Number.NEGATIVE_INFINITY;

  constructor(options: DuxApiClientOptions) {
    if (
      typeof options.accessToken !== 'string' ||
      options.accessToken.length === 0 ||
      options.accessToken.length > 4_096 ||
      options.accessToken.trim() !== options.accessToken
    ) {
      throw new DuxApiError(503, 'DUX_TOKEN_INVALID', 'Dux no está configurado correctamente.');
    }
    this.accessToken = options.accessToken;
    this.fetchImplementation = options.fetch ?? defaultFetch;
    this.clock = options.clock ?? Date.now;
    this.sleep = options.sleep ?? delay;
    this.minRequestIntervalMs = boundedIntegerOption(
      options.minRequestIntervalMs,
      DEFAULT_MIN_REQUEST_INTERVAL_MS,
      0,
      60_000,
      'minRequestIntervalMs',
    );
    this.requestTimeoutMs = boundedIntegerOption(
      options.requestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS,
      1,
      120_000,
      'requestTimeoutMs',
    );
    this.maxGetAttempts = boundedIntegerOption(
      options.maxGetAttempts,
      DEFAULT_MAX_GET_ATTEMPTS,
      1,
      5,
      'maxGetAttempts',
    );
    this.maxRetryDelayMs = boundedIntegerOption(
      options.maxRetryDelayMs,
      DEFAULT_MAX_RETRY_DELAY_MS,
      0,
      300_000,
      'maxRetryDelayMs',
    );
    this.beforeRequest = options.beforeRequest ?? (() => Promise.resolve());
  }

  async listEmpresas(): Promise<readonly DuxCompany[]> {
    const value = await this.get('/v2/empresas');
    return parseDuxCompanyPage(value).data;
  }

  async listSucursales(companyId: number): Promise<readonly DuxBranch[]> {
    const value = await this.get('/v2/sucursales', {
      id_empresa: positiveIdentifier(companyId, 'id_empresa'),
    });
    return parseDuxBranchPage(value).data;
  }

  async listDepositos(warehouseId?: number): Promise<readonly DuxWarehouse[]> {
    const parameters: Record<string, string> = {};
    if (warehouseId !== undefined) {
      parameters.id_deposito = positiveIdentifier(warehouseId, 'id_deposito');
    }
    const value = await this.get('/v2/depositos', parameters);
    return parseDuxWarehousePage(value).data;
  }

  async listItemsPage(options: DuxListItemsPageOptions = {}): Promise<DuxPage<DuxItem>> {
    const offset = nonNegativeInteger(options.offset ?? 0, 'offset');
    const limit = boundedInteger(options.limit ?? ITEM_PAGE_LIMIT, 1, ITEM_PAGE_LIMIT, 'limit');
    const parameters = itemQueryParameters(options);
    parameters.offset = String(offset);
    parameters.limit = String(limit);
    const value = await this.get('/v2/items', parameters);
    const page = parseDuxItemPage(value);
    if (page.pagination.offset !== offset || page.pagination.limit !== limit) {
      throw invalidProviderResponse();
    }
    return page;
  }

  async listItems(options: DuxListItemsFilters = {}): Promise<readonly DuxItem[]> {
    const items: DuxItem[] = [];
    let offset = 0;
    for (let pageNumber = 0; pageNumber < MAX_ITEM_PAGES; pageNumber += 1) {
      const page = await this.listItemsPage({ ...options, offset, limit: ITEM_PAGE_LIMIT });
      items.push(...page.data);
      if (!page.pagination.hasMore) return Object.freeze(items);
      if (page.data.length === 0) throw invalidProviderResponse();
      const nextOffset = page.pagination.offset + page.pagination.limit;
      if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) {
        throw invalidProviderResponse();
      }
      offset = nextOffset;
    }
    throw new DuxApiError(
      502,
      'DUX_PAGINATION_LIMIT',
      'Dux excedió el límite operativo de paginación.',
    );
  }

  private get(path: string, parameters: Readonly<Record<string, string>> = {}): Promise<unknown> {
    const url = new URL(`${DUX_API_BASE_URL}${path}`);
    for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
    return this.enqueue(() => this.performGet(url));
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.requestQueue.then(operation);
    this.requestQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async performGet(url: URL): Promise<unknown> {
    for (let attempt = 0; attempt < this.maxGetAttempts; attempt += 1) {
      await this.waitForRequestSlot();
      await this.beforeRequest();
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, this.requestTimeoutMs);
      try {
        const headers = new Headers({
          accept: 'application/json',
          authorization: `Bearer ${this.accessToken}`,
        });
        const response = await this.fetchImplementation(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
          redirect: 'error',
          cache: 'no-store',
        });
        const parsed = await readProviderJson(response);
        if (response.ok) {
          if (!parsed.valid) throw invalidProviderResponse();
          return parsed.value;
        }
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt + 1 < this.maxGetAttempts) {
          const retryDelay = retryDelayMilliseconds(
            response.headers,
            parsed.valid ? parsed.value : null,
            attempt,
            this.clock(),
            this.maxRetryDelayMs,
          );
          if (retryDelay !== null) {
            await this.sleep(retryDelay);
            continue;
          }
        }
        throw statusError(response.status);
      } catch (error: unknown) {
        if (error instanceof DuxApiError || error instanceof HttpError) throw error;
        if (attempt + 1 < this.maxGetAttempts) {
          await this.sleep(defaultRetryDelay(attempt, this.maxRetryDelayMs));
          continue;
        }
        throw new DuxApiError(
          503,
          timedOut || isAbortError(error) ? 'DUX_TIMEOUT' : 'DUX_UNAVAILABLE',
          timedOut || isAbortError(error)
            ? 'Dux no respondió dentro del tiempo esperado.'
            : 'Dux no está disponible temporalmente.',
        );
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new DuxApiError(503, 'DUX_UNAVAILABLE', 'Dux no está disponible temporalmente.');
  }

  private async waitForRequestSlot(): Promise<void> {
    const now = this.clock();
    if (!Number.isFinite(now)) {
      throw new DuxApiError(500, 'DUX_CLOCK_INVALID', 'No se pudo coordinar el acceso a Dux.');
    }
    const wait = Math.max(0, this.nextRequestAt - now);
    if (wait > 0) await this.sleep(wait);
    const startedAt = this.clock();
    if (!Number.isFinite(startedAt)) {
      throw new DuxApiError(500, 'DUX_CLOCK_INVALID', 'No se pudo coordinar el acceso a Dux.');
    }
    this.nextRequestAt = startedAt + this.minRequestIntervalMs;
  }
}

export function parseDuxCompanyPage(value: unknown): DuxPage<DuxCompany> {
  return parsePage(value, (candidate) => {
    const record = requiredRecord(candidate);
    return Object.freeze({
      id: requiredIdentifier(record.id_empresa),
      legalName: requiredText(record.razon_social, 300),
    });
  });
}

export function parseDuxBranchPage(value: unknown): DuxPage<DuxBranch> {
  return parsePage(value, (candidate) => {
    const record = requiredRecord(candidate);
    return Object.freeze({
      id: requiredIdentifier(record.id_sucursal),
      companyId: requiredIdentifier(record.id_empresa),
      name: requiredText(record.sucursal, 300),
    });
  });
}

export function parseDuxWarehousePage(value: unknown): DuxPage<DuxWarehouse> {
  return parsePage(value, (candidate) => {
    const record = requiredRecord(candidate);
    return Object.freeze({
      id: requiredIdentifier(record.id_deposito),
      companyId: requiredIdentifier(record.id_empresa),
      name: requiredText(record.deposito, 300),
      enabled: requiredBoolean(record.habilitado),
    });
  });
}

export function parseDuxItemPage(value: unknown): DuxPage<DuxItem> {
  return parsePage(value, parseItem, ITEM_PAGE_LIMIT);
}

export function selectDuxItemStock(
  item: DuxItem,
  selection: Readonly<{ warehouseId: number; variantDetailId?: number }>,
): DuxSelectedItemStock {
  const warehouseId = requiredIdentifier(selection.warehouseId);
  const variantDetailId = selection.variantDetailId === undefined
    ? undefined
    : requiredIdentifier(selection.variantDetailId);
  const candidates = item.stocks.filter((stock) => (
    stock.warehouseId === warehouseId &&
    (variantDetailId === undefined || stock.variantDetailId === variantDetailId)
  ));
  if (candidates.length === 0) {
    throw new DuxApiError(
      409,
      'DUX_STOCK_NOT_FOUND',
      'Dux no informó stock para el depósito y la variante seleccionados.',
    );
  }
  if (candidates.length !== 1) {
    throw new DuxApiError(
      409,
      'DUX_STOCK_AMBIGUOUS',
      'Dux informó más de un stock para el depósito y la variante seleccionados.',
    );
  }
  const selected = candidates[0];
  if (selected === undefined) throw invalidProviderResponse();
  return Object.freeze({
    ...selected,
    itemCode: item.code,
    inventorySemantics: DUX_V2_ITEM_INVENTORY_SEMANTICS,
  });
}

function parseItem(candidate: unknown): DuxItem {
  const record = requiredRecord(candidate);
  if (!Array.isArray(record.stock)) throw invalidProviderResponse();
  const stocks = Object.freeze(record.stock.map(parseStock));
  return Object.freeze({
    code: requiredText(record.cod_item, 300),
    externalCode: optionalText(record.codigo_externo, 300),
    name: requiredText(record.item, 500),
    barcodes: parseBarcodes(record.codigos_barra),
    enabled: requiredBoolean(record.habilitado),
    unitsPerPackage: optionalFiniteNumber(record.ctd_unidades_por_bulto),
    stocks,
    inventorySemantics: DUX_V2_ITEM_INVENTORY_SEMANTICS,
  });
}

function parseStock(candidate: unknown): DuxItemStock {
  const record = requiredRecord(candidate);
  return Object.freeze({
    warehouseId: requiredIdentifier(record.id),
    warehouseName: requiredText(record.nombre, 300),
    realQuantity: requiredFiniteNumber(record.stock_real),
    reservedQuantity: requiredFiniteNumber(record.stock_reservado),
    availableQuantity: requiredFiniteNumber(record.stock_disponible),
    variantDetailId: optionalIdentifier(record.id_det_item),
    variantBarcode: optionalText(record.cod_barra_detalle, 300),
    size: optionalText(record.talle, 300),
    color: optionalText(record.color, 300),
  });
}

function parsePage<T>(
  value: unknown,
  parseEntry: (candidate: unknown) => T,
  maximumPageLimit = Number.MAX_SAFE_INTEGER,
): DuxPage<T> {
  const record = requiredRecord(value);
  if (!Array.isArray(record.datos)) throw invalidProviderResponse();
  const paginationRecord = requiredRecord(record.paginacion);
  const pagination = Object.freeze({
    total: nonNegativeSafeInteger(paginationRecord.total),
    offset: nonNegativeSafeInteger(paginationRecord.offset),
    limit: boundedSafeInteger(paginationRecord.limit, 1, maximumPageLimit),
    hasMore: requiredBoolean(paginationRecord.hay_mas),
  });
  return Object.freeze({
    data: Object.freeze(record.datos.map(parseEntry)),
    pagination,
    requestId: optionalText(record.id_solicitud, 300),
  });
}

function parseBarcodes(value: unknown): readonly string[] {
  if (value === undefined || value === null) return Object.freeze([]);
  if (!Array.isArray(value)) throw invalidProviderResponse();
  return Object.freeze(value.map((barcode) => requiredText(barcode, 300)));
}

function itemQueryParameters(options: DuxListItemsPageOptions): Record<string, string> {
  const parameters: Record<string, string> = {};
  if (options.itemCode !== undefined) parameters.cod_item = queryText(options.itemCode, 'cod_item');
  if (options.brandCode !== undefined) parameters.codigo_marca = queryText(options.brandCode, 'codigo_marca');
  if (options.priceListId !== undefined) {
    parameters.id_lista_precio = positiveIdentifier(options.priceListId, 'id_lista_precio');
  }
  if (options.warehouseId !== undefined) {
    parameters.id_deposito = positiveIdentifier(options.warehouseId, 'id_deposito');
  }
  if (options.categoryId !== undefined) {
    parameters.id_rubro = positiveIdentifier(options.categoryId, 'id_rubro');
  }
  if (options.subcategoryId !== undefined) {
    parameters.id_sub_rubro = positiveIdentifier(options.subcategoryId, 'id_sub_rubro');
  }
  if (options.supplierId !== undefined) {
    parameters.id_proveedor = positiveIdentifier(options.supplierId, 'id_proveedor');
  }
  if (options.enabled !== undefined) parameters.habilitado = String(options.enabled);
  if (options.updatedSince !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(options.updatedSince)) {
      throw new DuxApiError(500, 'DUX_QUERY_INVALID', 'El filtro fecha_ult_actualizacion no es válido.');
    }
    parameters.fecha_ult_actualizacion = options.updatedSince;
  }
  if (options.itemType !== undefined) {
    if (!['SIMPLE', 'COMPUESTO', 'PRODUCCION'].includes(options.itemType)) {
      throw new DuxApiError(500, 'DUX_QUERY_INVALID', 'El filtro tipo_item no es válido.');
    }
    parameters.tipo_item = options.itemType;
  }
  return parameters;
}

async function readProviderJson(response: Response): Promise<Readonly<{ valid: boolean; value: unknown }>> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && /^\d+$/u.test(contentLength) && Number(contentLength) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    return Object.freeze({ valid: false, value: null });
  }
  if (response.body === null) return Object.freeze({ valid: true, value: null });
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    totalBytes += result.value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return Object.freeze({ valid: false, value: null });
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  if (text === '') return Object.freeze({ valid: true, value: null });
  try {
    const value: unknown = JSON.parse(text);
    return Object.freeze({ valid: true, value });
  } catch {
    return Object.freeze({ valid: false, value: null });
  }
}

function retryDelayMilliseconds(
  headers: Headers,
  body: unknown,
  attempt: number,
  now: number,
  maximum: number,
): number | null {
  const retryAfter = headers.get('retry-after');
  if (retryAfter !== null) {
    const seconds = /^\d+$/u.test(retryAfter) ? Number(retryAfter) : Number.NaN;
    if (Number.isSafeInteger(seconds) && seconds >= 0) {
      const milliseconds = seconds * 1_000;
      return Number.isSafeInteger(milliseconds) && milliseconds <= maximum
        ? milliseconds
        : null;
    }
    const retryDate = Date.parse(retryAfter);
    if (Number.isFinite(retryDate) && Number.isFinite(now)) {
      const milliseconds = Math.max(0, retryDate - now);
      return milliseconds <= maximum ? milliseconds : null;
    }
  }
  if (isRecord(body) && isRecord(body.error)) {
    const seconds = body.error.reintentar_en_segundos;
    if (typeof seconds === 'number' && Number.isSafeInteger(seconds) && seconds >= 0) {
      const milliseconds = seconds * 1_000;
      return Number.isSafeInteger(milliseconds) && milliseconds <= maximum
        ? milliseconds
        : null;
    }
  }
  return defaultRetryDelay(attempt, maximum);
}

function defaultRetryDelay(attempt: number, maximum: number): number {
  return Math.min(250 * (2 ** attempt), maximum);
}

function statusError(providerStatus: number): DuxApiError {
  if (providerStatus === 401) {
    return new DuxApiError(
      503,
      'DUX_AUTH_FAILED',
      'Dux rechazó la credencial configurada.',
      providerStatus,
    );
  }
  if (providerStatus === 403) {
    return new DuxApiError(
      503,
      'DUX_ACCESS_FORBIDDEN',
      'Dux no autorizó la API para la cuenta o el plan configurado.',
      providerStatus,
    );
  }
  if (providerStatus === 429) {
    return new DuxApiError(
      503,
      'DUX_RATE_LIMITED',
      'Dux limitó temporalmente las consultas.',
      providerStatus,
    );
  }
  if (providerStatus >= 500) {
    return new DuxApiError(
      503,
      'DUX_UNAVAILABLE',
      'Dux no está disponible temporalmente.',
      providerStatus,
    );
  }
  return new DuxApiError(
    502,
    'DUX_PROVIDER_REJECTED',
    'Dux rechazó la consulta.',
    providerStatus,
  );
}

function invalidProviderResponse(): DuxApiError {
  return new DuxApiError(
    502,
    'DUX_RESPONSE_INVALID',
    'Dux devolvió una respuesta no válida.',
  );
}

function requiredRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw invalidProviderResponse();
  return value;
}

function requiredIdentifier(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw invalidProviderResponse();
  }
  return value;
}

function optionalIdentifier(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  return requiredIdentifier(value);
}

function requiredFiniteNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalidProviderResponse();
  return value;
}

function optionalFiniteNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  return requiredFiniteNumber(value);
}

function requiredBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw invalidProviderResponse();
  return value;
}

function requiredText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maximum) {
    throw invalidProviderResponse();
  }
  return value;
}

function optionalText(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  return requiredText(value, maximum);
}

function nonNegativeSafeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidProviderResponse();
  }
  return value;
}

function boundedSafeInteger(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw invalidProviderResponse();
  }
  return value;
}

function positiveIdentifier(value: number, name: string): string {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DuxApiError(500, 'DUX_QUERY_INVALID', `El filtro ${name} no es válido.`);
  }
  return String(value);
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DuxApiError(500, 'DUX_QUERY_INVALID', `El filtro ${name} no es válido.`);
  }
  return value;
}

function boundedInteger(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new DuxApiError(500, 'DUX_QUERY_INVALID', `El filtro ${name} no es válido.`);
  }
  return value;
}

function boundedIntegerOption(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} no es válido.`);
  }
  return value;
}

function queryText(value: string, name: string): string {
  if (value.trim() === '' || value.length > 300) {
    throw new DuxApiError(500, 'DUX_QUERY_INVALID', `El filtro ${name} no es válido.`);
  }
  return value;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : isRecord(error) && error.name === 'AbortError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defaultFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
