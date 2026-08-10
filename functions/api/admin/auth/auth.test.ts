import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSessionCookie,
  generateAdminPasswordHash,
  verifyAdminCredentials,
} from '../../../../server/admin-auth';
import { encodeBase64Url } from '../../../../server/crypto';
import type { Env, PagesFunctionContext } from '../../../../server/platform';
import { createTestD1 } from '../../../../src/test/d1';
import { onRequest as login } from './login';
import { onRequest as logout } from './logout';
import { onRequest as session } from './session';

const USERNAME = '10000000123';
const PASSWORD = 'Clave-ficticia-exclusiva-para-tests-2026!';
const WRONG_PASSWORD = 'Clave-ficticia-incorrecta-para-tests-2026!';
const migration = readFileSync(
  resolve(process.cwd(), 'migrations', '0005_admin_auth.sql'),
  'utf8',
);
const sessionSecret = encodeBase64Url(
  Uint8Array.from({ length: 32 }, (_, index) => index + 1),
);

let passwordHash = '';

beforeAll(async () => {
  passwordHash = await generateAdminPasswordHash(PASSWORD, {
    iterations: 100_000,
    salt: Uint8Array.from({ length: 16 }, (_, index) => index + 32),
  });
});

describe('Functions de autenticación administrativa', () => {
  it('inicia sesión con credenciales válidas y emite cookie segura', async () => {
    const testD1 = createTestD1(migration);
    try {
      const response = await login(context(
        loginRequest({ username: USERNAME, password: PASSWORD }),
        environment(testD1.database),
      ));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        authenticated: true,
        identity: { label: 'Administrador', source: 'password' },
      });
      const cookie = response.headers.get('set-cookie') ?? '';
      expect(cookie).toContain(`${ADMIN_SESSION_COOKIE_NAME}=`);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toContain('Domain=');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(testD1.sqlite.prepare(
        'SELECT COUNT(*) AS count FROM admin_login_rate_limits',
      ).get()).toEqual({ count: 0 });
    } finally {
      testD1.close();
    }
  });

  it('rechaza usuario y contraseña incorrectos con la misma respuesta', async () => {
    const responses: Array<{ status: number; body: unknown }> = [];
    for (const credentials of [
      { username: '90000000123', password: PASSWORD },
      { username: USERNAME, password: WRONG_PASSWORD },
    ]) {
      const testD1 = createTestD1(migration);
      try {
        const response = await login(context(
          loginRequest(credentials),
          environment(testD1.database),
        ));
        responses.push({ status: response.status, body: await response.json() });
      } finally {
        testD1.close();
      }
    }
    expect(responses).toEqual([
      {
        status: 401,
        body: {
          error: {
            code: 'ADMIN_CREDENTIALS_INVALID',
            message: 'Las credenciales administrativas no son válidas.',
          },
        },
      },
      {
        status: 401,
        body: {
          error: {
            code: 'ADMIN_CREDENTIALS_INVALID',
            message: 'Las credenciales administrativas no son válidas.',
          },
        },
      },
    ]);
  });

  it('valida método, origen, JSON, Content-Type y tamaño real del body', async () => {
    const testD1 = createTestD1(migration);
    const env = environment(testD1.database);
    try {
      const wrongMethod = await login(context(new Request(
        'https://example.test/api/admin/auth/login',
      ), env));
      expect(wrongMethod.status).toBe(405);
      expect(wrongMethod.headers.get('allow')).toBe('POST');

      const wrongOrigin = await login(context(loginRequest(
        { username: USERNAME, password: PASSWORD },
        'https://attacker.test',
      ), env));
      expect(wrongOrigin.status).toBe(403);

      const invalidJson = await login(context(rawLoginRequest('{'), env));
      expect(invalidJson.status).toBe(400);

      const wrongContentType = await login(context(new Request(
        'https://example.test/api/admin/auth/login',
        {
          method: 'POST',
          headers: { origin: 'https://example.test', 'content-type': 'text/plain' },
          body: '{}',
        },
      ), env));
      expect(wrongContentType.status).toBe(415);

      const oversized = await login(context(rawLoginRequest(JSON.stringify({
        username: USERNAME,
        password: 'x'.repeat(2_048),
      })), env));
      expect(oversized.status).toBe(413);
    } finally {
      testD1.close();
    }
  });

  it('informa sesión, rechaza cookie alterada y la elimina al cerrar sesión', async () => {
    const testD1 = createTestD1(migration);
    const env = environment(testD1.database);
    try {
      const anonymous = await session(context(new Request(
        'https://example.test/api/admin/auth/session',
      ), env));
      expect(anonymous.status).toBe(200);
      await expect(anonymous.json()).resolves.toEqual({ authenticated: false });

      const identity = await verifyAdminCredentials(USERNAME, PASSWORD, env);
      const setCookie = await createAdminSessionCookie(identity, env);
      const cookie = setCookie.split(';', 1)[0] ?? '';
      const authenticated = await session(context(new Request(
        'https://example.test/api/admin/auth/session',
        { headers: { cookie } },
      ), env));
      expect(authenticated.status).toBe(200);
      await expect(authenticated.json()).resolves.toEqual({
        authenticated: true,
        identity: { label: 'Administrador', source: 'password' },
      });

      const altered = await session(context(new Request(
        'https://example.test/api/admin/auth/session',
        { headers: { cookie: `${cookie}alterado` } },
      ), env));
      expect(altered.status).toBe(401);

      const logoutResponse = await logout(context(new Request(
        'https://example.test/api/admin/auth/logout',
        { method: 'POST', headers: { origin: 'https://example.test', cookie } },
      ), env));
      expect(logoutResponse.status).toBe(204);
      expect(logoutResponse.headers.get('set-cookie')).toContain('Max-Age=0');

      const rejectedOrigin = await logout(context(new Request(
        'https://example.test/api/admin/auth/logout',
        { method: 'POST', headers: { origin: 'https://attacker.test' } },
      ), env));
      expect(rejectedOrigin.status).toBe(403);
    } finally {
      testD1.close();
    }
  });
});

function environment(database: NonNullable<Env['DB']>): Env {
  return {
    DB: database,
    PUBLIC_SITE_URL: 'https://example.test',
    ADMIN_USERNAME: USERNAME,
    ADMIN_PASSWORD_HASH: passwordHash,
    ADMIN_SESSION_SECRET: sessionSecret,
    ADMIN_RATE_LIMIT_SECRET: 'rate-limit-test-secret-that-is-not-used-in-production-123456',
  };
}

function loginRequest(
  credentials: Readonly<{ username: string; password: string }>,
  origin = 'https://example.test',
): Request {
  return rawLoginRequest(JSON.stringify(credentials), origin);
}

function rawLoginRequest(
  body: string,
  origin = 'https://example.test',
): Request {
  return new Request('https://example.test/api/admin/auth/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body,
  });
}

function context(
  request: Request,
  env: Env = {},
): PagesFunctionContext<Env> {
  return {
    request,
    env,
    params: {},
    data: {},
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}
