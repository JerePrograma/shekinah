import { DUX_API_BASE_URL, type DuxFetch } from './dux-api';
import { readDuxInventoryConfig } from './dux-inventory';
import { HttpError } from './http';
import type { Env } from './platform';

const DIAGNOSTIC_OFFSET = 0;
const DIAGNOSTIC_LIMIT = 50;
const DIAGNOSTIC_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_SAFE_SAMPLES = 20;

type KindCount = Readonly<{
  kind: string;
  count: number;
}>;

type FieldKindSummary = Readonly<{
  field: string;
  kinds: readonly KindCount[];
}>;

type SafeScalar = string | number | boolean | null;
type SafeSample = Readonly<Record<string, SafeScalar>>;

type ObjectFieldDiagnostic = Readonly<{
  containerKinds: readonly KindCount[];
  objectCount: number;
  fieldKinds: readonly FieldKindSummary[];
  safeSamples: readonly SafeSample[];
}>;

type ArrayFieldDiagnostic = Readonly<{
  containerKinds: readonly KindCount[];
  itemCountWithEntries: number;
  entryCount: number;
  entryKinds: readonly KindCount[];
  fieldKinds: readonly FieldKindSummary[];
  safeSamples: readonly SafeSample[];
}>;

type ScalarFieldDiagnostic = Readonly<{
  kinds: readonly KindCount[];
  nonEmptyTextCount: number;
  minimumTextLength: number | null;
  maximumTextLength: number | null;
  urlOrigins: readonly string[];
}>;

export type DuxCatalogSchemaDiagnostic = Readonly<{
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
  itemKinds: readonly KindCount[];
  itemFieldKinds: readonly FieldKindSummary[];
  prices: ArrayFieldDiagnostic;
  category: ObjectFieldDiagnostic;
  subcategory: ObjectFieldDiagnostic;
  imageUrl: ScalarFieldDiagnostic;
  description: ScalarFieldDiagnostic;
}>;

/**
 * Descubre únicamente el contrato estructural necesario para mover el catálogo
 * editorial a Dux. Hace una sola lectura GET y no devuelve identidades de
 * productos, importes, URLs completas, request IDs ni credenciales.
 */
export async function readDuxCatalogSchemaDiagnostic(
  env: Env,
  fetchImplementation: DuxFetch = fetch,
): Promise<DuxCatalogSchemaDiagnostic> {
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
      'DUX_CATALOG_DIAGNOSTIC_UNAVAILABLE',
      'No se pudo obtener el contrato estructural del catálogo Dux.',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status >= 300 && response.status <= 399) {
    await cancelResponseBody(response);
    throw new HttpError(
      502,
      'DUX_CATALOG_DIAGNOSTIC_REDIRECT',
      'Dux devolvió una redirección no permitida durante el diagnóstico.',
    );
  }
  if (!response.ok) {
    await cancelResponseBody(response);
    throw new HttpError(
      502,
      'DUX_CATALOG_DIAGNOSTIC_PROVIDER_REJECTED',
      'Dux rechazó el diagnóstico estructural del catálogo.',
    );
  }

  const payload = await readBoundedJson(response);
  if (!isRecord(payload) || !Array.isArray(payload.datos)) {
    throw invalidDiagnosticResponse();
  }
  const pagination = isRecord(payload.paginacion) ? payload.paginacion : null;

  return Object.freeze({
    endpoint: '/v2/items',
    offset: DIAGNOSTIC_OFFSET,
    limit: DIAGNOSTIC_LIMIT,
    dataLength: payload.datos.length,
    pagination: Object.freeze({
      total: nullableNonNegativeInteger(
        pagination === null ? undefined : safeRecordValue(pagination, 'total'),
      ),
      offset: nullableNonNegativeInteger(
        pagination === null ? undefined : safeRecordValue(pagination, 'offset'),
      ),
      limit: nullablePositiveInteger(
        pagination === null ? undefined : safeRecordValue(pagination, 'limit'),
      ),
      hasMore: nullableBoolean(
        pagination === null ? undefined : safeRecordValue(pagination, 'hay_mas'),
      ),
    }),
    itemKinds: countKinds(payload.datos),
    itemFieldKinds: summarizeRecordFields(payload.datos),
    prices: summarizeArrayField(payload.datos, 'precios'),
    category: summarizeObjectField(payload.datos, 'rubro'),
    subcategory: summarizeObjectField(payload.datos, 'sub_rubro'),
    imageUrl: summarizeScalarField(payload.datos, 'imagen_url', true),
    description: summarizeScalarField(payload.datos, 'descripcion', false),
  });
}

function summarizeArrayField(
  values: readonly unknown[],
  field: string,
): ArrayFieldDiagnostic {
  const containers: unknown[] = [];
  const entries: unknown[] = [];
  let itemCountWithEntries = 0;

  for (const value of values) {
    if (!isRecord(value)) continue;
    const candidate = safeRecordValue(value, field);
    containers.push(candidate);
    if (!Array.isArray(candidate)) continue;
    if (candidate.length > 0) itemCountWithEntries += 1;
    entries.push(...candidate);
  }

  return Object.freeze({
    containerKinds: countKinds(containers),
    itemCountWithEntries,
    entryCount: entries.length,
    entryKinds: countKinds(entries),
    fieldKinds: summarizeRecordFields(entries),
    safeSamples: collectSafeSamples(entries, 'price'),
  });
}

function summarizeObjectField(
  values: readonly unknown[],
  field: string,
): ObjectFieldDiagnostic {
  const containers: unknown[] = [];
  const objects: unknown[] = [];

  for (const value of values) {
    if (!isRecord(value)) continue;
    const candidate = safeRecordValue(value, field);
    containers.push(candidate);
    if (isRecord(candidate)) objects.push(candidate);
  }

  return Object.freeze({
    containerKinds: countKinds(containers),
    objectCount: objects.length,
    fieldKinds: summarizeRecordFields(objects),
    safeSamples: collectSafeSamples(objects, 'reference'),
  });
}

function summarizeScalarField(
  values: readonly unknown[],
  field: string,
  collectOrigins: boolean,
): ScalarFieldDiagnostic {
  const candidates: unknown[] = [];
  const lengths: number[] = [];
  const origins = new Set<string>();

  for (const value of values) {
    if (!isRecord(value)) continue;
    const candidate = safeRecordValue(value, field);
    candidates.push(candidate);
    if (typeof candidate !== 'string' || candidate.trim() === '') continue;
    const text = candidate.trim();
    lengths.push(text.length);
    if (!collectOrigins) continue;
    const origin = safeUrlOrigin(text);
    if (origin !== null) origins.add(origin);
  }

  return Object.freeze({
    kinds: countKinds(candidates),
    nonEmptyTextCount: lengths.length,
    minimumTextLength: lengths.length === 0 ? null : Math.min(...lengths),
    maximumTextLength: lengths.length === 0 ? null : Math.max(...lengths),
    urlOrigins: Object.freeze([...origins].sort()),
  });
}

function summarizeRecordFields(values: readonly unknown[]): readonly FieldKindSummary[] {
  const fields = new Map<string, Map<string, number>>();
  for (const value of values) {
    if (!isRecord(value)) continue;
    for (const field of Object.keys(value)) {
      const kinds = fields.get(field) ?? new Map<string, number>();
      const kind = valueKind(safeRecordValue(value, field));
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      fields.set(field, kinds);
    }
  }
  return Object.freeze([...fields.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([field, kinds]) => Object.freeze({
      field,
      kinds: sortedKindCounts(kinds),
    })));
}

function countKinds(values: readonly unknown[]): readonly KindCount[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const kind = valueKind(value);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return sortedKindCounts(counts);
}

function sortedKindCounts(counts: ReadonlyMap<string, number>): readonly KindCount[] {
  return Object.freeze([...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([kind, count]) => Object.freeze({ kind, count })));
}

function collectSafeSamples(
  values: readonly unknown[],
  profile: 'price' | 'reference',
): readonly SafeSample[] {
  const samples: SafeSample[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!isRecord(value)) continue;
    const sample = safeSample(value, profile);
    const key = JSON.stringify(sample);
    if (seen.has(key)) continue;
    seen.add(key);
    samples.push(sample);
    if (samples.length >= MAX_SAFE_SAMPLES) break;
  }
  return Object.freeze(samples);
}

function safeSample(
  record: Readonly<Record<string, unknown>>,
  profile: 'price' | 'reference',
): SafeSample {
  const entries: [string, SafeScalar][] = [];
  for (const field of Object.keys(record).sort()) {
    const value = safeRecordValue(record, field);
    entries.push([field, safeScalar(field, value, profile)]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

function safeScalar(
  field: string,
  value: unknown,
  profile: 'price' | 'reference',
): SafeScalar {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '<non_finite_number>';
    if (profile === 'price' && !isReferenceNumberField(field)) {
      return `<${valueKind(value)}>`;
    }
    return value;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') return '<empty_string>';
    if (field.toLocaleLowerCase('en-US').includes('url')) {
      return safeUrlOrigin(text) ?? '<invalid_url>';
    }
    return text.length <= 120 ? text : `<string:${text.length}>`;
  }
  return `<${valueKind(value)}>`;
}

function isReferenceNumberField(field: string): boolean {
  const normalized = field.toLocaleLowerCase('en-US');
  return normalized.startsWith('id_') ||
    normalized.endsWith('_id') ||
    normalized.includes('codigo') ||
    normalized.includes('lista') ||
    normalized.includes('moneda');
}

function safeUrlOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
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
    // La respuesta falla cerrada aunque el stream del proveedor no pueda cancelarse.
  }
}

function responseTooLarge(): HttpError {
  return new HttpError(
    502,
    'DUX_CATALOG_DIAGNOSTIC_RESPONSE_TOO_LARGE',
    'Dux excedió el tamaño seguro del diagnóstico estructural del catálogo.',
  );
}

function invalidDiagnosticResponse(): HttpError {
  return new HttpError(
    502,
    'DUX_CATALOG_DIAGNOSTIC_RESPONSE_INVALID',
    'Dux devolvió una respuesta estructural no válida para el catálogo.',
  );
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
