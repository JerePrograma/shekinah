import { HttpError } from './http';
import type { Env } from './platform';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  code = 'INVALID_REQUEST',
  message = 'La solicitud contiene campos no permitidos.',
): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) {
    throw new HttpError(400, code, message);
  }
}

export function readSafeText(
  value: unknown,
  field: string,
  maxLength: number,
  minLength = 1,
): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'INVALID_FIELD', `El campo ${field} no es válido.`);
  }
  const normalized = value.trim();
  if (
    normalized.length < minLength ||
    normalized.length > maxLength ||
    containsControlCharacter(normalized)
  ) {
    throw new HttpError(400, 'INVALID_FIELD', `El campo ${field} no es válido.`);
  }
  return normalized;
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f || codePoint === 0x7f)
    ) {
      return true;
    }
  }
  return false;
}

export function readOptionalSafeText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null || value === '') return null;
  return readSafeText(value, field, maxLength);
}

export function readInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new HttpError(400, 'INVALID_FIELD', `El campo ${field} no es válido.`);
  }
  return value;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

export function assertUuid(value: unknown, field: string): string {
  const normalized = readSafeText(value, field, 64);
  if (!isUuid(normalized)) {
    throw new HttpError(400, 'INVALID_FIELD', `El campo ${field} no es válido.`);
  }
  return normalized.toLocaleLowerCase('en');
}

export function assertSameOrigin(request: Request, env: Env): void {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
  const origin = request.headers.get('origin');
  if (origin === null) {
    throw new HttpError(403, 'ORIGIN_REQUIRED', 'No se pudo verificar el origen de la solicitud.');
  }

  let normalizedOrigin: string;
  try {
    const parsed = new URL(origin);
    normalizedOrigin = parsed.origin;
    if (origin !== normalizedOrigin && origin !== `${normalizedOrigin}/`) {
      throw new TypeError('Origin no canónico');
    }
  } catch {
    throw new HttpError(403, 'ORIGIN_REJECTED', 'El origen de la solicitud no está autorizado.');
  }

  const configured = [
    ...(typeof env.PUBLIC_SITE_URL === 'string' && env.PUBLIC_SITE_URL.trim() !== ''
      ? [env.PUBLIC_SITE_URL]
      : []),
    ...(env.ALLOWED_SITE_ORIGINS ?? '')
      .split(',')
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate !== ''),
  ];
  if (configured.length === 0) {
    throw new HttpError(503, 'ORIGIN_CONFIG_MISSING', 'No hay orígenes autorizados configurados.');
  }

  const allowed = new Set([
    new URL(request.url).origin,
    ...configured.map(parseConfiguredOrigin),
  ]);
  if (!allowed.has(normalizedOrigin)) {
    throw new HttpError(403, 'ORIGIN_REJECTED', 'El origen de la solicitud no está autorizado.');
  }
}

function parseConfiguredOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(503, 'ORIGIN_CONFIG_INVALID', 'La lista de orígenes permitidos no es válida.');
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (
    (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) ||
    url.username !== '' ||
    url.password !== '' ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new HttpError(503, 'ORIGIN_CONFIG_INVALID', 'La lista de orígenes permitidos no es válida.');
  }
  return url.origin;
}

export async function readJsonBody(
  request: Request,
  maximumBytes = 32_768,
): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Se requiere Content-Type application/json.');
  }
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    if (!/^\d+$/u.test(declared)) {
      throw new HttpError(400, 'INVALID_CONTENT_LENGTH', 'El tamaño declarado no es válido.');
    }
    const declaredBytes = Number(declared);
    if (!Number.isSafeInteger(declaredBytes)) {
      throw new HttpError(400, 'INVALID_CONTENT_LENGTH', 'El tamaño declarado no es válido.');
    }
    if (declaredBytes > maximumBytes) {
      throw new HttpError(413, 'BODY_TOO_LARGE', 'La solicitud excede el tamaño permitido.');
    }
  }
  const raw = await readBoundedText(request, maximumBytes);
  if (raw.trim() === '') {
    throw new HttpError(400, 'INVALID_JSON', 'La solicitud no contiene JSON.');
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'La solicitud no contiene JSON válido.');
  }
}

async function readBoundedText(
  request: Request,
  maximumBytes: number,
): Promise<string> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new RangeError('El límite del body no es válido.');
  }
  if (request.body === null) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunks: string[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new HttpError(413, 'BODY_TOO_LARGE', 'La solicitud excede el tamaño permitido.');
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'INVALID_JSON', 'No se pudo leer la solicitud.');
  } finally {
    reader.releaseLock();
  }
}
