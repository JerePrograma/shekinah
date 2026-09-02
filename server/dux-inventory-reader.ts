import {
  DUX_API_BASE_URL,
  DUX_MAX_ITEMS_PER_SYNC,
  DuxApiClient,
  DuxApiError,
  type DuxFetch,
  type DuxItem,
} from './dux-api';
import {
  readDuxInventoryConfig,
  type DuxInventoryReader,
} from './dux-inventory';
import type { Env } from './platform';

const ITEM_PAGE_LIMIT = 50;
const MAX_ITEM_PAGES = DUX_MAX_ITEMS_PER_SYNC / ITEM_PAGE_LIMIT;
const MAX_RESPONSE_BYTES = 2_000_000;
const DUX_ITEMS_PATH = new URL(`${DUX_API_BASE_URL}/v2/items`).pathname;

type InventoryPageObservation = Readonly<{
  excludedItemIndices: readonly number[];
  unquantifiedStockEntries: number;
}>;

/**
 * Adapta exclusivamente la lectura de inventario para el snapshot autoritativo.
 * Dux puede devolver un bloque de depósito con las tres cantidades en null. Ese
 * patrón no se convierte a cero: se retira de la proyección cuantitativa y el
 * resto del contrato continúa validándose por DuxApiClient sin relajaciones.
 */
export function createDuxInventoryReader(
  env: Env,
  fetchImplementation: DuxFetch = defaultFetch,
): DuxInventoryReader {
  const config = readDuxInventoryConfig(env);
  const filter = new DuxInventoryResponseFilter(config.depositId, fetchImplementation);
  const client = new DuxApiClient({
    accessToken: config.accessToken,
    fetch: filter.fetch,
  });
  return Object.freeze({
    listEmpresas: () => client.listEmpresas(),
    listSucursales: (companyId: number) => client.listSucursales(companyId),
    listDepositos: (warehouseId?: number) => client.listDepositos(warehouseId),
    listItems: (options = {}) => {
      const warehouseId = options.warehouseId ?? config.depositId;
      if (warehouseId !== config.depositId) {
        throw new DuxApiError(
          500,
          'DUX_QUERY_INVALID',
          'El depósito solicitado no coincide con la configuración de inventario Dux.',
        );
      }
      return listQuantifiedInventoryItems(
        client,
        filter,
        warehouseId,
        options.enabled,
      );
    },
  });
}

class DuxInventoryResponseFilter {
  private readonly warehouseId: number;
  private readonly upstreamFetch: DuxFetch;
  private readonly observations = new Map<number, InventoryPageObservation>();

  constructor(warehouseId: number, upstreamFetch: DuxFetch) {
    this.warehouseId = warehouseId;
    this.upstreamFetch = upstreamFetch;
  }

  readonly fetch: DuxFetch = (input, init) => this.performFetch(input, init);

  takeObservation(offset: number): InventoryPageObservation {
    const observation = this.observations.get(offset) ?? Object.freeze({
      excludedItemIndices: Object.freeze([]),
      unquantifiedStockEntries: 0,
    });
    this.observations.delete(offset);
    return observation;
  }

  private async performFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const response = await this.upstreamFetch(input, init);
    const url = inputUrl(input);
    if (
      url.pathname !== DUX_ITEMS_PATH ||
      !response.ok ||
      queryIdentifier(url, 'id_deposito') !== this.warehouseId
    ) {
      return response;
    }

    const offset = queryNonNegativeInteger(url, 'offset');
    if (offset === null) return response;
    const raw = await readBoundedResponseText(response);
    if (raw === null) return rebuiltResponse(response, '');

    let value: unknown;
    try {
      value = raw === '' ? null : JSON.parse(raw);
    } catch {
      return rebuiltResponse(response, raw);
    }
    const transformed = transformItemsResponse(value, this.warehouseId);
    this.observations.set(offset, transformed.observation);
    return rebuiltResponse(response, JSON.stringify(transformed.value));
  }
}

async function listQuantifiedInventoryItems(
  client: DuxApiClient,
  filter: DuxInventoryResponseFilter,
  warehouseId: number,
  enabled?: boolean,
): Promise<readonly DuxItem[]> {
  const items: DuxItem[] = [];
  let receivedCount = 0;
  let offset = 0;
  let expectedTotal: number | null = null;
  let excludedItems = 0;
  let unquantifiedStockEntries = 0;

  for (let pageNumber = 0; pageNumber < MAX_ITEM_PAGES; pageNumber += 1) {
    const page = await client.listItemsPage({
      warehouseId,
      ...(enabled === undefined ? {} : { enabled }),
      offset,
      limit: ITEM_PAGE_LIMIT,
    });
    const observation = filter.takeObservation(offset);
    expectedTotal ??= page.pagination.total;
    if (page.pagination.total !== expectedTotal) throw invalidProviderResponse();
    if (expectedTotal > DUX_MAX_ITEMS_PER_SYNC) throw paginationLimitError();

    receivedCount += page.data.length;
    if (receivedCount > expectedTotal) throw invalidProviderResponse();
    const excluded = new Set(observation.excludedItemIndices);
    page.data.forEach((item, index) => {
      if (excluded.has(index)) {
        excludedItems += 1;
        return;
      }
      items.push(item);
    });
    unquantifiedStockEntries += observation.unquantifiedStockEntries;

    if (!page.pagination.hasMore) {
      if (receivedCount !== expectedTotal) throw invalidProviderResponse();
      if (unquantifiedStockEntries > 0) {
        console.warn('dux_inventory_unquantified_stock', {
          version: 1,
          endpoint: '/v2/items',
          excludedItems,
          unquantifiedStockEntries,
        });
      }
      return Object.freeze(items);
    }
    if (receivedCount >= expectedTotal) throw invalidProviderResponse();
    if (page.data.length === 0) throw invalidProviderResponse();
    const nextOffset = page.pagination.offset + page.pagination.limit;
    if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) {
      throw invalidProviderResponse();
    }
    offset = nextOffset;
  }
  throw paginationLimitError();
}

function transformItemsResponse(
  value: unknown,
  warehouseId: number,
): Readonly<{ value: unknown; observation: InventoryPageObservation }> {
  if (!isRecord(value) || !Array.isArray(value.datos)) {
    return Object.freeze({
      value,
      observation: Object.freeze({
        excludedItemIndices: Object.freeze([]),
        unquantifiedStockEntries: 0,
      }),
    });
  }

  const excludedItemIndices: number[] = [];
  let unquantifiedStockEntries = 0;
  const data = value.datos.map((candidate, itemIndex) => {
    if (!isRecord(candidate) || !Array.isArray(candidate.stock)) return candidate;
    let configuredWarehouseWasUnquantified = false;
    const stock = candidate.stock.filter((entry) => {
      if (!isSafeUnquantifiedStock(entry)) return true;
      unquantifiedStockEntries += 1;
      if (entry.id === warehouseId) configuredWarehouseWasUnquantified = true;
      return false;
    });
    const hasRemainingConfiguredWarehouse = stock.some((entry) => (
      isRecord(entry) && entry.id === warehouseId
    ));
    if (configuredWarehouseWasUnquantified && !hasRemainingConfiguredWarehouse) {
      excludedItemIndices.push(itemIndex);
    }
    return { ...candidate, stock };
  });

  return Object.freeze({
    value: { ...value, datos: data },
    observation: Object.freeze({
      excludedItemIndices: Object.freeze(excludedItemIndices),
      unquantifiedStockEntries,
    }),
  });
}

function isSafeUnquantifiedStock(value: unknown): value is Readonly<Record<string, unknown>> {
  if (!isRecord(value)) return false;
  if (
    value.stock_real !== null ||
    value.stock_reservado !== null ||
    value.stock_disponible !== null
  ) {
    return false;
  }
  return isPositiveIdentifier(value.id) &&
    isRequiredText(value.nombre, 300) &&
    isOptionalIdentifier(value.id_det_item) &&
    isOptionalText(value.cod_barra_detalle, 300) &&
    isOptionalText(value.talle, 300) &&
    isOptionalText(value.color, 300);
}

function isPositiveIdentifier(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isOptionalIdentifier(value: unknown): boolean {
  return value === undefined || value === null || isPositiveIdentifier(value);
}

function isRequiredText(value: unknown, maximum: number): boolean {
  return typeof value === 'string' && value.trim() !== '' && value.length <= maximum;
}

function isOptionalText(value: unknown, maximum: number): boolean {
  return value === undefined || value === null || value === '' || isRequiredText(value, maximum);
}

async function readBoundedResponseText(response: Response): Promise<string | null> {
  const declared = response.headers.get('content-length');
  if (declared !== null && /^\d+$/u.test(declared) && Number(declared) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    return null;
  }
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    totalBytes += result.value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(totalBytes);
  let cursor = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function rebuiltResponse(response: Response, body: string): Response {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function queryIdentifier(url: URL, name: string): number | null {
  const value = url.searchParams.get(name);
  if (value === null || !/^[1-9]\d*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function queryNonNegativeInteger(url: URL, name: string): number | null {
  const value = url.searchParams.get(name);
  if (value === null || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function inputUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  if (typeof input === 'string') return new URL(input);
  return new URL(input.url);
}

function invalidProviderResponse(): DuxApiError {
  return new DuxApiError(
    502,
    'DUX_RESPONSE_INVALID',
    'Dux devolvió una respuesta no válida.',
  );
}

function paginationLimitError(): DuxApiError {
  return new DuxApiError(
    502,
    'DUX_PAGINATION_LIMIT',
    'Dux excedió el límite operativo de paginación.',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defaultFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}
