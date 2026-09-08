import { hmacSha256Hex } from './crypto';
import { HttpError } from './http';
import type { D1Database, D1PreparedStatement } from './platform';

export type WebRequestLimit = Readonly<{ key: string; limit: number }>;

export async function webRequestLimits(request: Request, secret: string, nowSeconds: number, creation: boolean): Promise<readonly WebRequestLimit[]> {
  const raw = request.headers.get('cf-connecting-ip')?.trim() ?? '';
  const ip = /^[0-9a-f:.]{2,64}$/iu.test(raw) ? raw.toLowerCase() : 'unavailable';
  const day = Math.floor(nowSeconds / 86_400);
  const digest = await hmacSha256Hex(secret, `web-request-ip:${day}:${ip}`);
  return creation
    ? [{ key: `new:global:${day}`, limit: 500 }, { key: `new:ip:${day}:${digest}`, limit: 20 }]
    : [{ key: `access:global:${day}`, limit: 5000 }, { key: `access:ip:${Math.floor(nowSeconds / 900)}:${digest}`, limit: 40 }];
}

export function prepareWebRequestLimit(database: D1Database, scope: WebRequestLimit, nowSeconds: number, createdRequestId?: string): D1PreparedStatement {
  if (!Number.isSafeInteger(scope.limit) || scope.limit < 1 || scope.limit > 5000 || !Number.isSafeInteger(nowSeconds)) {
    throw new RangeError('Límite de solicitudes no válido.');
  }
  return database.prepare(`INSERT INTO commerce_request_rate_limits (scope_key, request_count, limit_count, updated_at)
    SELECT ?, 1, ?, ? WHERE ? IS NULL OR EXISTS (
      SELECT 1 FROM checkout_intents WHERE web_request_id = ?
    )
    ON CONFLICT(scope_key) DO UPDATE SET request_count = request_count + 1, updated_at = excluded.updated_at`)
    .bind(scope.key, scope.limit, nowSeconds, createdRequestId ?? null, createdRequestId ?? null);
}

export async function consumeWebRequestAccess(database: D1Database, scopes: readonly WebRequestLimit[], nowSeconds: number): Promise<void> {
  try {
    await database.batch([
      ...scopes.map((scope) => prepareWebRequestLimit(database, scope, nowSeconds)),
      database.prepare(`DELETE FROM commerce_request_rate_limits WHERE scope_key IN (
        SELECT scope_key FROM commerce_request_rate_limits WHERE updated_at < ? ORDER BY updated_at LIMIT 50
      )`).bind(nowSeconds - 172_800),
    ]);
  } catch (error: unknown) { throwWebRequestStorageError(error); }
}

export function throwWebRequestStorageError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  const message = error instanceof Error ? error.message : '';
  if (message.includes('commerce_request_limit')) {
    throw new HttpError(429, 'WEB_REQUEST_RATE_LIMITED', 'Se alcanzó el límite de solicitudes. Intentá nuevamente más tarde.');
  }
  if (/WEB_REQUEST_(?:KEY_CONFLICT|CONVERSION_REQUIRED|IMMUTABLE|STATE_CONFLICT)/u.test(message)) {
    throw new HttpError(409, 'WEB_REQUEST_CONFLICT', 'La solicitud existente no permite esta operación.');
  }
  throw new HttpError(503, 'WEB_REQUEST_STORAGE_UNAVAILABLE', 'No se pudo acceder al registro seguro de solicitudes.');
}
