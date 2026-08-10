import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS,
  authenticateAdminRequest,
  createAdminLogoutCookie,
  createAdminSessionCookie,
  generateAdminPasswordHash,
  generateAdminSessionSecret,
  verifyAdminCredentials,
  verifyAdminSession,
} from './admin-auth';
import { decodeBase64Url, encodeBase64Url } from './crypto';
import type { AdminIdentity, Env } from './platform';

const encoder = new TextEncoder();
const USERNAME = 'admin-test-001';
const PASSWORD = 'correct-password-for-tests-only';
const WRONG_PASSWORD = 'wrong-password-for-tests-only';
const ITERATIONS = 100_000;
const NOW = 1_800_000_000;
const salt = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
const sessionSecret = encodeBase64Url(
  Uint8Array.from({ length: 32 }, (_, index) => index + 64),
);

let passwordHash = '';
let env: Env;

beforeAll(async () => {
  passwordHash = await generateAdminPasswordHash(PASSWORD, { iterations: ITERATIONS, salt });
  env = Object.freeze({
    ADMIN_USERNAME: USERNAME,
    ADMIN_PASSWORD_HASH: passwordHash,
    ADMIN_SESSION_SECRET: sessionSecret,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('credenciales administrativas PBKDF2', () => {
  it('genera un formato estricto y verifica la credencial correcta', async () => {
    expect(passwordHash).toMatch(/^pbkdf2-sha256\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/u);
    await expect(verifyAdminCredentials(USERNAME, PASSWORD, env)).resolves.toEqual({
      sub: 'shekinah-password-admin-v1',
      actor: 'password-admin',
      authMethod: 'password',
    });
  });

  it('usa 300000 iteraciones por defecto en el helper operativo', async () => {
    await expect(generateAdminPasswordHash(PASSWORD, { salt }))
      .resolves.toMatch(/^pbkdf2-sha256\$300000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/u);
  });

  it('rechaza usuario y contraseña incorrectos con el mismo error genérico', async () => {
    for (const [username, password] of [
      ['otro-admin', PASSWORD],
      [USERNAME, WRONG_PASSWORD],
    ] as const) {
      await expect(verifyAdminCredentials(username, password, env)).rejects.toMatchObject({
        status: 401,
        code: 'ADMIN_CREDENTIALS_INVALID',
        message: 'Las credenciales administrativas no son válidas.',
      });
    }
  });

  it('ejecuta PBKDF2 aunque el usuario sea incorrecto', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const deriveBits = vi.spyOn(crypto.subtle, 'deriveBits').mockRejectedValueOnce(
      new Error('derivación interceptada'),
    );
    await expect(verifyAdminCredentials('usuario-inexistente', PASSWORD, env))
      .rejects.toMatchObject({ code: 'ADMIN_AUTH_UNAVAILABLE', status: 503 });
    expect(deriveBits).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith('Admin password KDF unavailable', {
      name: 'Error',
      message: 'derivación interceptada',
    });
  });

  it('usa timingSafeEqual del runtime cuando está disponible', async () => {
    const subtle = crypto.subtle as SubtleCrypto & {
      timingSafeEqual?: (left: ArrayBufferView, right: ArrayBufferView) => boolean;
    };
    const ownDescriptor = Object.getOwnPropertyDescriptor(subtle, 'timingSafeEqual');
    const comparator = vi.fn((left: ArrayBufferView, right: ArrayBufferView) => {
      const leftBytes = toBytes(left);
      const rightBytes = toBytes(right);
      if (leftBytes.byteLength !== rightBytes.byteLength) return false;
      return leftBytes.every((value, index) => value === rightBytes[index]);
    });
    Object.defineProperty(subtle, 'timingSafeEqual', {
      configurable: true,
      value: comparator,
    });
    try {
      await expect(verifyAdminCredentials(USERNAME, PASSWORD, env)).resolves.toMatchObject({
        authMethod: 'password',
      });
      expect(comparator).toHaveBeenCalledTimes(2);
    } finally {
      if (ownDescriptor === undefined) delete subtle.timingSafeEqual;
      else Object.defineProperty(subtle, 'timingSafeEqual', ownDescriptor);
    }
  });

  it.each([
    ['algoritmo', () => passwordHash.replace('pbkdf2-sha256', 'sha256')],
    ['iteraciones bajas', () => passwordHash.replace('$100000$', '$99999$')],
    ['iteraciones altas', () => passwordHash.replace('$100000$', '$2000001$')],
    ['iteraciones no canónicas', () => passwordHash.replace('$100000$', '$0100000$')],
    ['salt corto', () => replaceHashPart(passwordHash, 2, encodeBase64Url(new Uint8Array(15)))],
    ['salt largo', () => replaceHashPart(passwordHash, 2, encodeBase64Url(new Uint8Array(65)))],
    ['hash corto', () => replaceHashPart(passwordHash, 3, encodeBase64Url(new Uint8Array(31)))],
    ['base64 inválido', () => replaceHashPart(passwordHash, 3, '***')],
    ['segmentos adicionales', () => `${passwordHash}$extra`],
  ])('rechaza configuración inválida: %s', async (_label, buildInvalidHash) => {
    await expect(verifyAdminCredentials(USERNAME, PASSWORD, {
      ...env,
      ADMIN_PASSWORD_HASH: buildInvalidHash(),
    })).rejects.toMatchObject({ code: 'ADMIN_AUTH_CONFIG_INVALID', status: 503 });
  });

  it('valida parámetros del helper operativo sin aceptar valores débiles', async () => {
    await expect(generateAdminPasswordHash(PASSWORD, {
      iterations: 99_999,
      salt,
    })).rejects.toThrow(RangeError);
    await expect(generateAdminPasswordHash(PASSWORD, {
      iterations: 2_000_001,
      salt,
    })).rejects.toThrow(RangeError);
    await expect(generateAdminPasswordHash(PASSWORD, {
      iterations: ITERATIONS,
      salt: new Uint8Array(15),
    })).rejects.toThrow(RangeError);
  });
});

describe('sesión administrativa firmada', () => {
  let identity: AdminIdentity;
  let setCookie = '';
  let cookie = '';

  beforeAll(async () => {
    identity = await verifyAdminCredentials(USERNAME, PASSWORD, env);
    setCookie = await createAdminSessionCookie(identity, env, NOW);
    cookie = setCookie.split(';', 1)[0] ?? '';
  });

  it('crea una cookie __Host- segura y verifica su identidad sintética', async () => {
    expect(setCookie).toContain(`${ADMIN_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain(`Max-Age=${ADMIN_SESSION_TTL_SECONDS}`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).not.toContain('Domain=');

    await expect(verifyAdminSession(requestWithCookie(cookie), env, NOW + 1)).resolves.toEqual(identity);

    const token = cookie.slice(cookie.indexOf('=') + 1);
    const encodedPayload = token.split('.')[0] ?? '';
    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(encodedPayload)),
    ) as Record<string, unknown>;
    expect(payload).toEqual({
      v: 1,
      sub: 'shekinah-password-admin-v1',
      iat: NOW,
      exp: NOW + ADMIN_SESSION_TTL_SECONDS,
    });
    expect(JSON.stringify(payload)).not.toContain(USERNAME);
    expect(payload).not.toHaveProperty('actor');
    expect(payload).not.toHaveProperty('username');
  });

  it('rechaza cookie ausente, duplicada, truncada o malformada', async () => {
    await expect(verifyAdminSession(new Request('https://example.test/admin'), env, NOW))
      .rejects.toMatchObject({ code: 'ADMIN_SESSION_MISSING', status: 401 });
    await expect(verifyAdminSession(
      requestWithCookie(`${cookie}; ${cookie}`),
      env,
      NOW,
    )).rejects.toMatchObject({ code: 'ADMIN_SESSION_INVALID', status: 401 });
    for (const malformed of [
      `${ADMIN_SESSION_COOKIE_NAME}=`,
      `${ADMIN_SESSION_COOKIE_NAME}=sin-punto`,
      `${ADMIN_SESSION_COOKIE_NAME}=a.***`,
      `${ADMIN_SESSION_COOKIE_NAME}=a.b.c`,
    ]) {
      await expect(verifyAdminSession(requestWithCookie(malformed), env, NOW))
        .rejects.toMatchObject({ code: 'ADMIN_SESSION_INVALID', status: 401 });
    }
  });

  it('rechaza firma y payload alterados', async () => {
    const token = cookie.slice(cookie.indexOf('=') + 1);
    const [payload, signature] = token.split('.');
    if (payload === undefined || signature === undefined) throw new Error('Cookie de prueba inválida.');
    const changedSignature = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
    const changedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;
    for (const changedToken of [
      `${payload}.${changedSignature}`,
      `${changedPayload}.${signature}`,
    ]) {
      await expect(verifyAdminSession(
        requestWithCookie(`${ADMIN_SESSION_COOKIE_NAME}=${changedToken}`),
        env,
        NOW,
      )).rejects.toMatchObject({ code: 'ADMIN_SESSION_INVALID', status: 401 });
    }
  });

  it('rechaza una cookie vencida y una emitida demasiado en el futuro', async () => {
    await expect(verifyAdminSession(
      requestWithCookie(cookie),
      env,
      NOW + ADMIN_SESSION_TTL_SECONDS,
    )).rejects.toMatchObject({ code: 'ADMIN_SESSION_INVALID', status: 401 });

    const futureCookie = (await createAdminSessionCookie(identity, env, NOW + 60)).split(';', 1)[0] ?? '';
    await expect(verifyAdminSession(requestWithCookie(futureCookie), env, NOW))
      .rejects.toMatchObject({ code: 'ADMIN_SESSION_INVALID', status: 401 });
  });

  it('rechaza secreto inválido e identidad no local al emitir', async () => {
    await expect(verifyAdminSession(requestWithCookie(cookie), {
      ...env,
      ADMIN_SESSION_SECRET: encodeBase64Url(new Uint8Array(31)),
    }, NOW)).rejects.toMatchObject({ code: 'ADMIN_AUTH_CONFIG_INVALID', status: 503 });

    await expect(createAdminSessionCookie({
      sub: 'access-sub',
      actor: 'admin@example.test',
      authMethod: 'cloudflare-access',
    }, env, NOW)).rejects.toMatchObject({ code: 'ADMIN_IDENTITY_INVALID', status: 500 });
  });

  it('genera secretos de sesión de 32 a 64 bytes y una cookie de logout inmediata', () => {
    expect(decodeBase64Url(generateAdminSessionSecret())).toHaveLength(32);
    expect(decodeBase64Url(generateAdminSessionSecret(64))).toHaveLength(64);
    expect(() => generateAdminSessionSecret(31)).toThrow(RangeError);
    expect(createAdminLogoutCookie()).toBe([
      `${ADMIN_SESSION_COOKIE_NAME}=`,
      'Path=/',
      'Max-Age=0',
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
    ].join('; '));
  });
});

describe('autorización administrativa unificada', () => {
  it('prefiere la sesión propia y no cae a Access ante una cookie inválida', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(authenticateAdminRequest(
      requestWithCookie(`${ADMIN_SESSION_COOKIE_NAME}=cookie-invalida`, {
        'cf-access-jwt-assertion': 'token-access-que-no-debe-usarse',
      }),
      env,
      NOW,
    )).rejects.toMatchObject({ code: 'ADMIN_SESSION_INVALID', status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('usa Cloudflare Access únicamente cuando no hay cookie propia', async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const teamDomain = `admin-auth-${crypto.randomUUID()}.cloudflareaccess.com`;
    const audience = 'admin-auth-audience-test';
    const token = await signAccessToken(keyPair.privateKey, {
      aud: audience,
      email: 'access-admin@example.test',
      exp: NOW + 300,
      iss: `https://${teamDomain}`,
      sub: 'access-actor-test',
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ keys: [{ ...publicJwk, kid: 'admin-auth-kid', alg: 'RS256', use: 'sig' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    await expect(authenticateAdminRequest(new Request('https://example.test/api/admin/summary', {
      headers: { 'cf-access-jwt-assertion': token },
    }), {
      ...env,
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: teamDomain,
      CLOUDFLARE_ACCESS_AUD: audience,
    }, NOW)).resolves.toEqual({
      sub: 'access-actor-test',
      actor: 'access-admin@example.test',
      authMethod: 'cloudflare-access',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function replaceHashPart(value: string, index: number, replacement: string): string {
  const parts = value.split('$');
  parts[index] = replacement;
  return parts.join('$');
}

function requestWithCookie(cookie: string, headers?: HeadersInit): Request {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('cookie', cookie);
  return new Request('https://example.test/api/admin/products', { headers: requestHeaders });
}

function toBytes(value: ArrayBufferView): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

async function signAccessToken(
  privateKey: CryptoKey,
  claims: Record<string, unknown>,
): Promise<string> {
  const header = encodeBase64Url(encoder.encode(JSON.stringify({
    alg: 'RS256',
    kid: 'admin-auth-kid',
    typ: 'JWT',
  })));
  const payload = encodeBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    encoder.encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}
