import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createAdminSessionCookie,
  generateAdminPasswordHash,
  verifyAdminCredentials,
} from '../../../server/admin-auth';
import { getBaseCatalogCategories } from '../../../server/catalog-store';
import { encodeBase64Url } from '../../../server/crypto';
import type {
  AdminContextData,
  Env,
  PagesFunctionContext,
} from '../../../server/platform';
import { createTestD1 } from '../../../src/test/d1';
import { onRequest as productsCollection } from './products';
import { onRequest as adminMiddleware } from './_middleware';

const USERNAME = '10000000123';
const PASSWORD = 'Clave-ficticia-middleware-para-tests-2026!';
const sessionSecret = encodeBase64Url(new Uint8Array(32).fill(7));
const commerceMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0001_commerce.sql'),
  'utf8',
);
const catalogMigration = readFileSync(
  resolve(process.cwd(), 'migrations', '0004_catalog_admin.sql'),
  'utf8',
);

let authEnv: Env;
let sessionCookie = '';

beforeAll(async () => {
  const passwordHash = await generateAdminPasswordHash(PASSWORD, {
    iterations: 100_000,
    salt: new Uint8Array(16).fill(9),
  });
  authEnv = {
    ADMIN_USERNAME: USERNAME,
    ADMIN_PASSWORD_HASH: passwordHash,
    ADMIN_SESSION_SECRET: sessionSecret,
  };
  const identity = await verifyAdminCredentials(USERNAME, PASSWORD, authEnv);
  sessionCookie = (await createAdminSessionCookie(identity, authEnv)).split(';', 1)[0] ?? '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('middleware administrativo unificado', () => {
  it('excluye solamente las tres rutas públicas de autenticación', async () => {
    for (const path of ['login', 'session', 'logout']) {
      const next = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
      const response = await adminMiddleware(context(
        new Request(`https://example.test/api/admin/auth/${path}`),
        {},
        {},
        next,
      ));
      expect(response.status).toBe(204);
      expect(next).toHaveBeenCalledTimes(1);
    }

    const next = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    const nearPath = await adminMiddleware(context(
      new Request('https://example.test/api/admin/auth/login/'),
      {},
      {},
      next,
    ));
    expect(nearPath.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rechaza ausencia y alteración de cookie, y acepta una sesión propia', async () => {
    const noSession = await adminMiddleware(context(
      new Request('https://example.test/api/admin/products'),
      authEnv,
    ));
    expect(noSession.status).toBe(401);

    const altered = await adminMiddleware(context(
      new Request('https://example.test/api/admin/products', {
        headers: { cookie: `${sessionCookie}alterada` },
      }),
      authEnv,
    ));
    expect(altered.status).toBe(401);

    const data: AdminContextData = {};
    const accepted = await adminMiddleware(context(
      new Request('https://example.test/api/admin/products', {
        headers: { cookie: sessionCookie },
      }),
      authEnv,
      data,
      () => Promise.resolve(new Response(null, { status: 204 })),
    ));
    expect(accepted.status).toBe(204);
    expect(data.adminIdentity).toEqual({
      sub: 'shekinah-password-admin-v1',
      actor: 'password-admin',
      authMethod: 'password',
    });
    expect(data.requestId).toEqual(expect.any(String));
  });

  it('conserva Cloudflare Access como fallback cuando no existe cookie propia', async () => {
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
    const teamDomain = `middleware-${crypto.randomUUID()}.cloudflareaccess.com`;
    const audience = 'middleware-audience-test';
    const token = await signAccessToken(keyPair.privateKey, {
      aud: audience,
      email: 'access-admin@example.test',
      exp: Math.floor(Date.now() / 1_000) + 300,
      iss: `https://${teamDomain}`,
      sub: 'access-admin-sub',
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      keys: [{ ...publicJwk, kid: 'middleware-kid', alg: 'RS256', use: 'sig' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const data: AdminContextData = {};
    const response = await adminMiddleware(context(
      new Request('https://example.test/api/admin/products', {
        headers: { 'cf-access-jwt-assertion': token },
      }),
      {
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: teamDomain,
        CLOUDFLARE_ACCESS_AUD: audience,
      },
      data,
      () => Promise.resolve(new Response(null, { status: 204 })),
    ));
    expect(response.status).toBe(204);
    expect(data.adminIdentity).toEqual({
      sub: 'access-admin-sub',
      actor: 'access-admin@example.test',
      authMethod: 'cloudflare-access',
    });
  });

  it('impide una mutación sin sesión y la permite atravesando el middleware', async () => {
    const testD1 = createTestD1(commerceMigration, catalogMigration);
    const env: Env = {
      ...authEnv,
      DB: testD1.database,
      PUBLIC_SITE_URL: 'https://example.test',
    };
    const product = productInput('producto-middleware-auth');
    const unauthenticatedRequest = productRequest(product);
    try {
      const rejected = await adminMiddleware(context(
        unauthenticatedRequest,
        env,
      ));
      expect(rejected.status).toBe(401);
      expect(testD1.sqlite.prepare(
        'SELECT COUNT(*) AS count FROM catalog_product_mutations',
      ).get()).toEqual({ count: 0 });

      const authenticatedRequest = productRequest(product, sessionCookie);
      const data: AdminContextData = {};
      const accepted = await adminMiddleware(context(
        authenticatedRequest,
        env,
        data,
        async () => productsCollection({
          request: authenticatedRequest,
          env,
          params: {},
          data,
          next: () => Promise.resolve(new Response(null, { status: 404 })),
          waitUntil: () => undefined,
        }),
      ));
      expect(accepted.status).toBe(201);
      expect(testD1.sqlite.prepare(
        'SELECT product_id, deleted FROM catalog_product_mutations',
      ).get()).toEqual({ product_id: 'producto-middleware-auth', deleted: 0 });
    } finally {
      testD1.close();
    }
  });
});

function context(
  request: Request,
  env: Env,
  data: AdminContextData = {},
  next: PagesFunctionContext<Env, string, AdminContextData>['next'] = () =>
    Promise.resolve(new Response(null, { status: 599 })),
): PagesFunctionContext<Env, string, AdminContextData> {
  return {
    request,
    env,
    params: {},
    data,
    next,
    waitUntil: () => undefined,
  };
}

function productRequest(product: unknown, cookie?: string): Request {
  const headers = new Headers({
    origin: 'https://example.test',
    'content-type': 'application/json',
  });
  if (cookie !== undefined) headers.set('cookie', cookie);
  return new Request('https://example.test/api/admin/products', {
    method: 'POST',
    headers,
    body: JSON.stringify(product),
  });
}

function productInput(id: string): Record<string, unknown> {
  const category = getBaseCatalogCategories()[0];
  if (category === undefined) throw new Error('Falta una categoría canónica de prueba.');
  return {
    id,
    slug: id,
    path: `/${id}/`,
    name: `Producto ${id}`,
    categorySlugs: [category.slug],
    categoryNames: [category.name],
    presentation: '100 g',
    price: { amount: 1_000, currency: 'ARS' },
    sku: `SKU-${id}`,
    availability: 'available',
    shortDescription: 'Descripción breve',
    description: 'Descripción completa',
    images: [],
    variants: [],
  };
}

async function signAccessToken(
  privateKey: CryptoKey,
  claims: Record<string, unknown>,
): Promise<string> {
  const encoder = new TextEncoder();
  const header = encodeBase64Url(encoder.encode(JSON.stringify({
    alg: 'RS256',
    kid: 'middleware-kid',
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
