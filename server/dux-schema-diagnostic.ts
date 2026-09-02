import { DUX_API_BASE_URL, type DuxFetch } from './dux-api';
import { readDuxInventoryConfig } from './dux-inventory';
import { HttpError } from './http';
import type { Env } from './platform';

const DIAGNOSTIC_OFFSET = 650;
const DIAGNOSTIC_LIMIT = 50;
const DIAGNOSTIC_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const STOCK_QUANTITY_FIELDS = [
  'stock_real',
  'stock_reservado',
  'stock_disponible',
] as const;

type StockQuantityField = typeof STOCK_QUANTITY_FIELDS[number];

type StockShapeIssue = Readonly<{
  itemIndex: number;
  stockIndex: number | null;
  stockKind: string;
  quantityFieldKinds: Readonly<Record<StockQuantityField, string>> | null;
}>;

export type DuxStockSchemaDiagnostic = Readonly<{
  endpoint: '/v2/items';
  offset: number;
  limit: number;
  dataLength: number;
  pagination: Readonly<{
    total: number | null;
    offset: number | null;
    limit: number | null;
    hasMore: boolean | null;
  }>;
  issues: readonly StockShapeIssue[];
}>;

export async function readDuxStockSchemaDiagnostic(
  env: Env,
  fetchImplementation: DuxFetch = fetch,
): Promise<DuxStockSchemaDiagnostic> {
  const config = readDuxInventoryConfig(env);
  const url = new URL(`${DUX_API_BASE_URL}/v2/items`);
  url.searchParams.set('id_deposito', String(config.depositId));
  url.searchParams.set('habilitado', 'true');
  url.searchParams.set('offset', String(DIAGNOSTIC_OFFSET));
  url.searchParams.set('limit', String(DIAGNOSTIC_LIMIT));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DIAGNOSTIC_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${config.accessToken}`,
      },
      signal: controller.signal,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    throw new HttpError(
      503,
      'DUX_DIAGNOSTIC_UNAVAILABLE',
      'No se pudo obtener el diagnóstico estructural de Dux.',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status >= 300 && response.status <= 399) {
    await cancelResponseBody(response);
    throw new HttpError(
      502,
      'DUX_DIAGNOSTIC_REDIRECT',
      'Dux devolvió una redirección no permitida durante el diagnóstico.',
    );
  }
  if (!response.ok) {
    await cancelResponseBody(response);
    throw new HttpError(
      502,
      'DUX_DIAGNOSTIC_PROVIDER_REJECTED',
      'Dux rechazó el diagnóstico estructural.',
    );
  }

  const payload = await readBoundedJson(response);
  if (!isRecord(payload) || !Array.isArray(payload.datos)) {
    throw invalidDiagnosticResponse();
  }
  const pagination = isRecord(payload.paginacion) ? payload.paginacion : null;
  const issues: StockShapeIssue[] = [];

  payload.datos.forEach((item, itemIndex) => {
    if (!isRecord(item)) {
      issues.push(Object.freeze({
        itemIndex,
        stockIndex: null,
        stockKind: valueKind(item),
        quantityFieldKinds: null,
      }));
      return;
    }
    const stock = safeRecordValue(item, 'stock');
    if (!Array.isArray(stock)) {
      issues.push(Object.freeze({
        itemIndex,
        stockIndex: null,
        stockKind: valueKind(stock),
        quantityFieldKinds: null,
      }));
      return;
    }
    stock.forEach((entry, stockIndex) => {
      if (!isRecord(entry)) {
        issues.push(Object.freeze({
          itemIndex,
          stockIndex,
          stockKind: valueKind(entry),
          quantityFieldKinds: null,
        }));
        return;
      }
      if (STOCK_QUANTITY_FIELDS.every((field) => isFiniteNumber(safeRecordValue(entry, field)))) {
        return;
      }
      issues.push(Object.freeze({
        itemIndex,
        stockIndex,
        stockKind: 'object',
        quantityFieldKinds: Object.freeze(Object.fromEntries(
          STOCK_QUANTITY_FIELDS.map((field) => [field, valueKind(safeRecordValue(entry, field))]),
        ) as Record<StockQuantityField, string>),
      }));
    });
  });

  return Object.freeze({
    endpoint: '/v2/items',
    offset: DIAGNOSTIC_OFFSET,
    limit: DIAGNOSTIC_LIMIT,
    dataLength: payload.datos.length,
    pagination: Object.freeze({
      total: nullableNonNegativeInteger(pagination === null ? undefined : safeRecordValue(pagination, 'total')),
      offset: nullableNonNegativeInteger(pagination === null ? undefined : safeRecordValue(pagination, 'offset')),
      limit: nullablePositiveInteger(pagination === null ? undefined : safeRecordValue(pagination, 'limit')),
      hasMore: nullableBoolean(pagination === null ? undefined : safeRecordValue(pagination, 'hay_mas')),
    }),
    issues: Object.freeze(issues),
  });
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get('content-length');
  if (
    declaredLength !== null &&
    /^\d+$/u.test(declaredLength) &&
    Number(declaredLength) > MAX_RESPONSE_BYTES
  ) {
    await cancelResponseBody(response);
    throw responseTooLarge();
  }
  if (response.body === null) throw invalidDiagnosticResponse();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    totalBytes += result.value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw responseTooLarge();
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw invalidDiagnosticResponse();
  }
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // El diagnóstico falla cerrado aunque el stream del proveedor no pueda cancelarse.
  }
}

function responseTooLarge(): HttpError {
  return new HttpError(
    502,
    'DUX_DIAGNOSTIC_RESPONSE_TOO_LARGE',
    'Dux excedió el tamaño seguro del diagnóstico estructural.',
  );
}

function invalidDiagnosticResponse(): HttpError {
  return new HttpError(
    502,
    'DUX_DIAGNOSTIC_RESPONSE_INVALID',
    'Dux devolvió una respuesta estructural no válida durante el diagnóstico.',
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nullableNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function nullablePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function valueKind(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return value.length === 0 ? 'empty_string' : 'string';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'non_finite_number';
    return Number.isSafeInteger(value) ? 'integer' : 'number';
  }
  return typeof value;
}

function safeRecordValue(record: Readonly<Record<string, unknown>>, key: string): unknown {
  try {
    return record[key];
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
