import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { onRequest as authorize } from '../functions/api/admin/mercadolibre/authorize';
import { onRequest as status } from '../functions/api/admin/mercadolibre/editorial/status';
import { onRequest as callback } from '../functions/api/oauth/mercadolibre/callback';
import { createTestD1 } from '../src/test/d1';
import { decryptSecret, sha256Hex } from './crypto';
import { completeMercadoLibreAuthorization, createMercadoLibreAuthorization, getMercadoLibreAccess, getMercadoLibreConnectionStatus } from './mercado-libre';
import type { AdminContextData, Env, PagesFunctionContext } from './platform';

const migrations = readdirSync(resolve('migrations')).filter(file => file.endsWith('.sql')).sort()
  .map(file => readFileSync(resolve('migrations', file), 'utf8'));
const env: Env = {
  PUBLIC_SITE_URL: 'https://shekinah.ar', DUX_COMPANY_ID: '12862',
  MERCADO_LIBRE_EDITORIAL_ENABLED: 'true', MERCADO_LIBRE_CATALOG_ENABLED: 'false',
  MERCADO_LIBRE_EXPECTED_SELLER_ID: '445638367', MERCADO_LIBRE_CLIENT_ID: '123456789',
  MERCADO_LIBRE_CLIENT_SECRET: 'synthetic-client-secret-for-tests',
  MERCADO_LIBRE_TOKEN_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
};
const tokens = { access_token: 'synthetic-access-token-0123456789', refresh_token: 'synthetic-refresh-token-0123456789',
  expires_in: 21600, user_id: 445638367 };
const seller = { id: 445638367, site_id: 'MLA', nickname: 'HERBOLARIOMDP' };
let db: ReturnType<typeof createTestD1>;

beforeEach(() => { db = createTestD1(...migrations); });
afterEach(() => { db.close(); vi.unstubAllGlobals(); });

function provider(tokenResponse: unknown = tokens, identity: unknown = seller, tokenStatus = 200) {
  const mock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(tokenResponse, { status: tokenStatus }))
    .mockResolvedValueOnce(Response.json(identity));
  vi.stubGlobal('fetch', mock);
  return mock;
}

async function start() {
  const result = await createMercadoLibreAuthorization(db.database, env, 'test-admin');
  return new URL(result.authorizationUrl);
}

function context(path: string, method = 'GET', overrides: Env = {}, authenticated = true, origin = 'https://shekinah.ar'): PagesFunctionContext<Env, string, AdminContextData> {
  return { request: new Request(`https://shekinah.ar${path}`, { method, headers: { origin } }),
    env: { ...env, DB: db.database, ...overrides }, params: {},
    data: authenticated ? { adminIdentity: { sub: 'test-admin', actor: 'test-admin', authMethod: 'password' } } : {},
    functionPath: path, next: () => Promise.resolve(new Response(null, { status: 404 })), waitUntil: () => undefined };
}

it('genera autorización oficial, callback canónico y state opaco almacenado sólo como hash', async () => {
  const url = await start();
  expect(url.origin).toBe('https://auth.mercadolibre.com.ar');
  expect(url.pathname).toBe('/authorization');
  expect(url.searchParams.get('response_type')).toBe('code');
  expect(url.searchParams.get('client_id')).toBe(env.MERCADO_LIBRE_CLIENT_ID);
  expect(url.searchParams.get('redirect_uri')).toBe('https://shekinah.ar/api/oauth/mercadolibre/callback');
  const state = url.searchParams.get('state')!;
  const row = db.sqlite.prepare('SELECT * FROM mercadolibre_oauth_states').get()!;
  expect(row.state_hash).toBe(await sha256Hex(state));
  expect(JSON.stringify(row)).not.toContain(state);
  expect(Date.parse(String(row.expires_at)) - Date.now()).toBeGreaterThan(9 * 60_000);
});

it.each(['expired', 'consumed', 'unknown'])('rechaza state %s antes de contactar al proveedor', async kind => {
  const url = await start();
  const mock = provider();
  if (kind === 'expired') db.sqlite.exec("UPDATE mercadolibre_oauth_states SET expires_at='2020-01-01T00:00:00.000Z'");
  if (kind === 'consumed') db.sqlite.exec("UPDATE mercadolibre_oauth_states SET consumed_at='2020-01-01T00:00:00.000Z'");
  await expect(completeMercadoLibreAuthorization(db.database, env, 'synthetic-authorization-code',
    kind === 'unknown' ? 'x'.repeat(43) : url.searchParams.get('state')!)).rejects.toMatchObject({ code: 'MERCADO_LIBRE_OAUTH_STATE_INVALID' });
  expect(mock).not.toHaveBeenCalled();
  expect(await getMercadoLibreConnectionStatus(db.database)).toEqual({ connected: false });
});

it.each([
  { token: { ...tokens, user_id: 123456789 }, identity: seller, error: 'MERCADO_LIBRE_SELLER_MISMATCH' },
  { token: tokens, identity: { ...seller, id: 123456789 }, error: 'MERCADO_LIBRE_SELLER_MISMATCH' },
  { token: tokens, identity: { ...seller, site_id: 'MLB' }, error: 'MERCADO_LIBRE_SITE_MISMATCH' },
  { token: { ...tokens, refresh_token: '' }, identity: seller, error: 'MERCADO_LIBRE_RESPONSE_INVALID' },
  { token: { ...tokens, expires_in: -1 }, identity: seller, error: 'MERCADO_LIBRE_RESPONSE_INVALID' },
])('no persiste una conexión inválida: $error', async ({ token, identity, error }) => {
  const url = await start();
  provider(token, identity);
  await expect(completeMercadoLibreAuthorization(db.database, env, 'synthetic-authorization-code', url.searchParams.get('state')!))
    .rejects.toMatchObject({ code: error });
  expect(await getMercadoLibreConnectionStatus(db.database)).toEqual({ connected: false });
});

it('sanitiza un code rechazado y permite comenzar una autorización nueva', async () => {
  const url = await start();
  provider({ error: 'invalid_grant', detail: tokens.access_token }, seller, 400);
  const response = await callback(context(`/api/oauth/mercadolibre/callback?code=synthetic-authorization-code&state=${url.searchParams.get('state')}`));
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(await response.text()).not.toContain(tokens.access_token);
  expect(await getMercadoLibreConnectionStatus(db.database)).toEqual({ connected: false });
  expect((await start()).searchParams.get('state')).not.toBe(url.searchParams.get('state'));
});

it('completa el callback, cifra ambos tokens y renueva sin devolver secretos al panel', async () => {
  const url = await start();
  const mock = provider();
  const response = await callback(context(`/api/oauth/mercadolibre/callback?code=synthetic-authorization-code&state=${url.searchParams.get('state')}`));
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/admin?mercadolibre=connected');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  const tokenRequest = mock.mock.calls[0]![1]!;
  expect(tokenRequest.method).toBe('POST');
  expect(tokenRequest.body).toBeInstanceOf(URLSearchParams);
  expect((tokenRequest.body as URLSearchParams).get('redirect_uri')).toBe('https://shekinah.ar/api/oauth/mercadolibre/callback');
  expect(mock.mock.calls[1]![0]).toEqual(new URL('https://api.mercadolibre.com/users/me'));
  const row = db.sqlite.prepare('SELECT * FROM mercadolibre_connections').get()!;
  expect(JSON.stringify(row)).not.toContain(tokens.access_token);
  expect(JSON.stringify(row)).not.toContain(tokens.refresh_token);
  expect(await decryptSecret({ ciphertext: String(row.access_token_ciphertext), iv: String(row.access_token_iv) }, env.MERCADO_LIBRE_TOKEN_ENCRYPTION_KEY!)).toBe(tokens.access_token);
  const statusResponse = await status(context('/api/admin/mercadolibre/editorial/status'));
  const body: unknown = await statusResponse.json();
  expect(body).toMatchObject({ enabled: true, configured: true, connection: { connected: true, sellerId: '445638367', siteId: 'MLA', nickname: 'HERBOLARIOMDP' } });
  expect(JSON.stringify(body)).not.toContain(tokens.access_token);
  expect(JSON.stringify(body)).not.toContain(tokens.refresh_token);
  db.sqlite.exec("UPDATE mercadolibre_connections SET token_expires_at='2020-01-01T00:00:00.000Z'");
  const rotated = { ...tokens, access_token: 'synthetic-rotated-access-0123456789', refresh_token: 'synthetic-rotated-refresh-0123456789' };
  const refresh = provider(rotated);
  expect(await getMercadoLibreAccess(db.database, env)).toEqual({ accessToken: rotated.access_token, sellerId: '445638367' });
  expect((refresh.mock.calls[0]![1]!.body as URLSearchParams).get('grant_type')).toBe('refresh_token');
  expect(db.sqlite.prepare('SELECT refresh_owner FROM mercadolibre_connections').get()!.refresh_owner).toBeNull();
  await expect(completeMercadoLibreAuthorization(db.database, env, 'synthetic-authorization-code', url.searchParams.get('state')!))
    .rejects.toMatchObject({ code: 'MERCADO_LIBRE_OAUTH_STATE_INVALID' });
});

it.each([
  { values: { MERCADO_LIBRE_EDITORIAL_ENABLED: 'false' }, enabled: false, configured: true },
  { values: { MERCADO_LIBRE_CLIENT_SECRET: '' }, enabled: true, configured: false },
  { values: {}, enabled: true, configured: true },
])('informa el estado real antes de OAuth: $enabled / $configured', async ({ values, enabled, configured }) => {
  const response = await status(context('/api/admin/mercadolibre/editorial/status', 'GET', values));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ enabled, configured, connection: { connected: false }, inventoryEnabled: false });
});

it('protege autorización con sesión, mismo origen y método; callback sólo GET', async () => {
  expect((await authorize(context('/api/admin/mercadolibre/authorize', 'POST', {}, false))).status).toBe(401);
  expect((await authorize(context('/api/admin/mercadolibre/authorize', 'POST', {}, true, 'https://untrusted.example'))).status).toBe(403);
  expect((await authorize(context('/api/admin/mercadolibre/authorize'))).status).toBe(405);
  expect((await callback(context('/api/oauth/mercadolibre/callback', 'POST'))).status).toBe(405);
  expect((await callback(context('/api/oauth/mercadolibre/callback?error=access_denied'))).status).toBe(400);
  expect((await callback(context('/api/oauth/mercadolibre/callback?code=invalid&state=invalid'))).status).toBe(400);
  expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM mercadolibre_oauth_states').get()!.n).toBe(0);
});
