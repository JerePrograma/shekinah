import type { D1Database, Env } from './platform';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly expose: boolean;

  constructor(status: number, code: string, message: string, expose = true) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.expose = expose;
  }
}

const securityHeaders = Object.freeze({
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'accelerometer=(), camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
});

export function jsonResponse(value: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('content-type', 'application/json; charset=utf-8');
  for (const [key, headerValue] of Object.entries(securityHeaders)) {
    if (!headers.has(key)) headers.set(key, headerValue);
  }
  return new Response(JSON.stringify(value), { status, headers });
}

export function noContentResponse(status = 204, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  for (const [key, headerValue] of Object.entries(securityHeaders)) {
    if (!headers.has(key)) headers.set(key, headerValue);
  }
  return new Response(null, { status, headers });
}

export function methodNotAllowedResponse(allowed: readonly string[]): Response {
  return jsonResponse(
    { error: { code: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.' } },
    405,
    { allow: allowed.join(', ') },
  );
}

export function responseFromError(error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse(
      {
        error: {
          code: error.code,
          message: error.expose ? error.message : 'La solicitud no pudo completarse.',
        },
      },
      error.status,
    );
  }
  console.error('Unhandled commerce error', {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : 'Error no tipado',
  });
  return jsonResponse(
    { error: { code: 'INTERNAL_ERROR', message: 'La solicitud no pudo completarse.' } },
    500,
  );
}

export function requireDatabase(env: Env): D1Database {
  if (env.DB === undefined) {
    throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'La base de datos no está configurada.');
  }
  return env.DB;
}

export function requireSecret(
  value: string | undefined,
  code: string,
  message: string,
  minimumLength = 32,
): string {
  if (typeof value !== 'string' || value.length < minimumLength || value.length > 4096) {
    throw new HttpError(503, code, message);
  }
  return value;
}

export function requireText(
  value: string | undefined,
  code: string,
  message: string,
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(503, code, message);
  }
  return value.trim();
}

export function requestIdFrom(request: Request): string {
  const candidate = request.headers.get('cf-ray') ?? request.headers.get('x-request-id');
  if (candidate !== null && /^[A-Za-z0-9._:-]{1,128}$/u.test(candidate)) return candidate;
  return crypto.randomUUID();
}
