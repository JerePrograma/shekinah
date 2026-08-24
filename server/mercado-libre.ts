import {
  decryptSecret,
  encryptSecret,
  randomToken,
  sha256Hex,
} from './crypto';
import type { EncryptedSecret } from './crypto';
import { HttpError, requireSecret, requireText } from './http';
import type { D1Database, Env } from './platform';

const API_ORIGIN = 'https://api.mercadolibre.com';
const AUTHORIZATION_ORIGIN = 'https://auth.mercadolibre.com.ar';
const REQUEST_TIMEOUT_MS = 12_000;
const REFRESH_SKEW_MS = 5 * 60 * 1_000;
const REFRESH_LOCK_MS = 30_000;

type ConnectionRow = Readonly<{
  seller_id: string;
  site_id: string;
  nickname: string;
  access_token_ciphertext: string;
  access_token_iv: string;
  refresh_token_ciphertext: string;
  refresh_token_iv: string;
  token_expires_at: string;
  token_updated_at: string;
  refresh_owner: string | null;
  refresh_started_at: string | null;
  last_verified_at: string;
  updated_at: string;
}>;

type OAuthTokenResponse = Readonly<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
}>;

export type MercadoLibreSeller = Readonly<{
  id: string;
  siteId: string;
  nickname: string;
}>;

export type MercadoLibreConnectionStatus = Readonly<{
  connected: boolean;
  sellerId?: string;
  siteId?: string;
  nickname?: string;
  tokenExpiresAt?: string;
  tokenUpdatedAt?: string;
  lastVerifiedAt?: string;
}>;

export async function createMercadoLibreAuthorization(
  database: D1Database,
  env: Env,
  actor: string,
): Promise<Readonly<{ authorizationUrl: string; expiresAt: string }>> {
  const clientId = requireClientId(env);
  const redirectUri = requireRedirectUri(env);
  const state = randomToken(32);
  const stateHash = await sha256Hex(state);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1_000).toISOString();
  await database
    .prepare(
      `INSERT INTO mercadolibre_oauth_states (
        state_hash, expires_at, consumed_at, created_by, created_at
      ) VALUES (?, ?, NULL, ?, ?)`,
    )
    .bind(stateHash, expiresAt, actor, now.toISOString())
    .run();
  const authorizationUrl = new URL('/authorization', AUTHORIZATION_ORIGIN);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('client_id', clientId);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('state', state);
  return Object.freeze({ authorizationUrl: authorizationUrl.toString(), expiresAt });
}

export async function completeMercadoLibreAuthorization(
  database: D1Database,
  env: Env,
  code: string,
  state: string,
): Promise<MercadoLibreSeller> {
  if (!/^[A-Za-z0-9_-]{16,512}$/u.test(code)) {
    throw new HttpError(400, 'MERCADO_LIBRE_OAUTH_CODE_INVALID', 'La autorización no es válida.');
  }
  if (!/^[A-Za-z0-9_-]{32,256}$/u.test(state)) {
    throw new HttpError(400, 'MERCADO_LIBRE_OAUTH_STATE_INVALID', 'La autorización no es válida.');
  }
  const stateHash = await sha256Hex(state);
  const consumedAt = new Date().toISOString();
  const claimed = await database
    .prepare(
      `UPDATE mercadolibre_oauth_states
       SET consumed_at = ?
       WHERE state_hash = ?
         AND consumed_at IS NULL
         AND unixepoch(expires_at) > unixepoch(?)
       RETURNING state_hash`,
    )
    .bind(consumedAt, stateHash, consumedAt)
    .first<Readonly<{ state_hash: string }>>();
  if (claimed === null) {
    throw new HttpError(400, 'MERCADO_LIBRE_OAUTH_STATE_INVALID', 'La autorización venció o ya fue utilizada.');
  }

  const tokens = await exchangeAuthorizationCode(env, code);
  const seller = await fetchSeller(tokens.accessToken);
  assertExpectedSeller(env, seller.id, tokens.userId);
  assertExpectedSite(seller.siteId);
  await persistConnection(database, env, seller, tokens, consumedAt);
  return seller;
}

export async function getMercadoLibreConnectionStatus(
  database: D1Database,
): Promise<MercadoLibreConnectionStatus> {
  const row = await readConnection(database);
  if (row === null) return Object.freeze({ connected: false });
  return Object.freeze({
    connected: true,
    sellerId: row.seller_id,
    siteId: row.site_id,
    nickname: row.nickname,
    tokenExpiresAt: row.token_expires_at,
    tokenUpdatedAt: row.token_updated_at,
    lastVerifiedAt: row.last_verified_at,
  });
}

export async function getMercadoLibreAccess(
  database: D1Database,
  env: Env,
): Promise<Readonly<{ accessToken: string; sellerId: string }>> {
  let row = await readConnection(database);
  if (row === null) {
    throw new HttpError(503, 'MERCADO_LIBRE_NOT_CONNECTED', 'Mercado Libre todavía no está conectado.');
  }
  assertExpectedSeller(env, row.seller_id, row.seller_id);
  const expiresAt = Date.parse(row.token_expires_at);
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() > REFRESH_SKEW_MS) {
    return Object.freeze({
      accessToken: await decryptConnectionSecret(env, row, 'access'),
      sellerId: row.seller_id,
    });
  }

  const owner = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - REFRESH_LOCK_MS).toISOString();
  const claimed = await database
    .prepare(
      `UPDATE mercadolibre_connections
       SET refresh_owner = ?, refresh_started_at = ?, updated_at = ?
       WHERE id = 1
         AND (
           refresh_owner IS NULL
           OR refresh_started_at IS NULL
           OR unixepoch(refresh_started_at) <= unixepoch(?)
         )
       RETURNING seller_id`,
    )
    .bind(owner, startedAt, startedAt, staleBefore)
    .first<Readonly<{ seller_id: string }>>();
  if (claimed === null) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await delay(200 * (attempt + 1));
      row = await readConnection(database);
      if (row !== null && row.refresh_owner === null) {
        return Object.freeze({
          accessToken: await decryptConnectionSecret(env, row, 'access'),
          sellerId: row.seller_id,
        });
      }
    }
    throw new HttpError(503, 'MERCADO_LIBRE_TOKEN_REFRESH_BUSY', 'La sesión de Mercado Libre se está renovando.');
  }

  try {
    const refreshToken = await decryptConnectionSecret(env, row, 'refresh');
    const tokens = await refreshAccessToken(env, refreshToken);
    assertExpectedSeller(env, row.seller_id, tokens.userId);
    const seller = await fetchSeller(tokens.accessToken);
    assertExpectedSeller(env, seller.id, tokens.userId);
    assertExpectedSite(seller.siteId);
    await persistConnection(database, env, seller, tokens, new Date().toISOString(), owner);
    return Object.freeze({ accessToken: tokens.accessToken, sellerId: seller.id });
  } catch (error: unknown) {
    await database
      .prepare(
        `UPDATE mercadolibre_connections
         SET refresh_owner = NULL, refresh_started_at = NULL, updated_at = ?
         WHERE id = 1 AND refresh_owner = ?`,
      )
      .bind(new Date().toISOString(), owner)
      .run();
    throw error;
  }
}

export async function mercadoLibreApiJson(
  path: string,
  accessToken: string,
  init: Readonly<{ method?: 'GET' | 'PUT'; body?: unknown; headers?: HeadersInit }> = {},
): Promise<Readonly<{ body: unknown; headers: Headers }>> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Ruta de Mercado Libre inválida.');
  }
  const method = init.method ?? 'GET';
  const attempts = method === 'GET' ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const headers = new Headers(init.headers);
      headers.set('accept', 'application/json');
      headers.set('authorization', `Bearer ${accessToken}`);
      if (init.body !== undefined) headers.set('content-type', 'application/json');
      const response = await fetch(new URL(path, API_ORIGIN), {
        method,
        headers,
        signal: controller.signal,
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
      const body = await readProviderJson(response);
      if (response.ok) return Object.freeze({ body, headers: response.headers });
      if (method === 'GET' && (response.status === 429 || response.status >= 500) && attempt + 1 < attempts) {
        await delay(retryDelay(response.headers, attempt));
        continue;
      }
      throw new HttpError(
        response.status === 401 ? 503 : response.status === 429 ? 503 : 502,
        response.status === 401
          ? 'MERCADO_LIBRE_AUTH_FAILED'
          : response.status === 429
            ? 'MERCADO_LIBRE_RATE_LIMITED'
            : 'MERCADO_LIBRE_PROVIDER_REJECTED',
        response.status === 429
          ? 'Mercado Libre limitó temporalmente la sincronización.'
          : 'Mercado Libre no pudo completar la operación.',
      );
    } catch (error: unknown) {
      if (error instanceof HttpError) throw error;
      if (attempt + 1 < attempts) {
        await delay(250 * (2 ** attempt));
        continue;
      }
      throw new HttpError(
        503,
        error instanceof DOMException && error.name === 'AbortError'
          ? 'MERCADO_LIBRE_TIMEOUT'
          : 'MERCADO_LIBRE_UNAVAILABLE',
        'Mercado Libre no está disponible temporalmente.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('Reintentos de Mercado Libre agotados.');
}

function requireClientId(env: Env): string {
  const value = requireText(
    env.MERCADO_LIBRE_CLIENT_ID,
    'MERCADO_LIBRE_CLIENT_ID_MISSING',
    'La aplicación de Mercado Libre no está configurada.',
  );
  if (!/^\d{5,30}$/u.test(value)) {
    throw new HttpError(503, 'MERCADO_LIBRE_CLIENT_ID_INVALID', 'La aplicación de Mercado Libre no es válida.');
  }
  return value;
}

function requireClientSecret(env: Env): string {
  return requireSecret(
    env.MERCADO_LIBRE_CLIENT_SECRET,
    'MERCADO_LIBRE_CLIENT_SECRET_MISSING',
    'La aplicación de Mercado Libre no está configurada.',
    16,
  );
}

function requireEncryptionKey(env: Env): string {
  return requireSecret(
    env.MERCADO_LIBRE_TOKEN_ENCRYPTION_KEY,
    'MERCADO_LIBRE_ENCRYPTION_KEY_MISSING',
    'El almacenamiento seguro de Mercado Libre no está configurado.',
    43,
  );
}

function requireRedirectUri(env: Env): string {
  const raw = requireText(env.PUBLIC_SITE_URL, 'SITE_URL_MISSING', 'La URL pública no está configurada.');
  const origin = new URL(raw);
  if (origin.protocol !== 'https:' || origin.username !== '' || origin.password !== '') {
    throw new HttpError(503, 'SITE_URL_INVALID', 'La URL pública no es válida.');
  }
  return new URL('/api/oauth/mercadolibre/callback', origin.origin).toString();
}

function assertExpectedSeller(env: Env, sellerId: string, tokenUserId: string): void {
  if (!/^\d{1,30}$/u.test(sellerId) || sellerId !== tokenUserId) {
    throw new HttpError(403, 'MERCADO_LIBRE_SELLER_MISMATCH', 'La cuenta autorizada no coincide con el vendedor esperado.');
  }
  const expected = requireText(
    env.MERCADO_LIBRE_EXPECTED_SELLER_ID,
    'MERCADO_LIBRE_EXPECTED_SELLER_MISSING',
    'El vendedor esperado de Mercado Libre no está configurado.',
  );
  if (!/^\d{1,30}$/u.test(expected) || expected !== sellerId) {
    throw new HttpError(403, 'MERCADO_LIBRE_SELLER_MISMATCH', 'La cuenta autorizada no coincide con el vendedor esperado.');
  }
}

function assertExpectedSite(siteId: string): void {
  if (siteId !== 'MLA') {
    throw new HttpError(403, 'MERCADO_LIBRE_SITE_MISMATCH', 'La cuenta autorizada no pertenece a Mercado Libre Argentina.');
  }
}

async function exchangeAuthorizationCode(env: Env, code: string): Promise<OAuthTokenResponse> {
  return tokenRequest(env, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: requireRedirectUri(env),
  });
}

async function refreshAccessToken(env: Env, refreshToken: string): Promise<OAuthTokenResponse> {
  return tokenRequest(env, { grant_type: 'refresh_token', refresh_token: refreshToken });
}

async function tokenRequest(
  env: Env,
  fields: Readonly<Record<string, string>>,
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    ...fields,
    client_id: requireClientId(env),
    client_secret: requireClientSecret(env),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_ORIGIN}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    const value = await readProviderJson(response);
    if (!response.ok) {
      throw new HttpError(503, 'MERCADO_LIBRE_OAUTH_FAILED', 'Mercado Libre rechazó la autorización.');
    }
    return parseTokenResponse(value);
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'MERCADO_LIBRE_OAUTH_UNAVAILABLE', 'Mercado Libre no pudo completar la autorización.');
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSeller(accessToken: string): Promise<MercadoLibreSeller> {
  const response = await mercadoLibreApiJson('/users/me', accessToken);
  if (!isRecord(response.body)) throw providerShapeError();
  const id = stringIdentifier(response.body.id);
  const siteId = safeProviderText(response.body.site_id, 10);
  const nickname = safeProviderText(response.body.nickname, 120);
  if (id === null || siteId === null || nickname === null) throw providerShapeError();
  return Object.freeze({ id, siteId, nickname });
}

async function persistConnection(
  database: D1Database,
  env: Env,
  seller: MercadoLibreSeller,
  tokens: OAuthTokenResponse,
  now: string,
  refreshOwner: string | null = null,
): Promise<void> {
  const encryptionKey = requireEncryptionKey(env);
  const [access, refresh] = await Promise.all([
    encryptSecret(tokens.accessToken, encryptionKey),
    encryptSecret(tokens.refreshToken, encryptionKey),
  ]);
  const expiresAt = new Date(Date.parse(now) + tokens.expiresIn * 1_000).toISOString();
  const result = await database
    .prepare(
      `INSERT INTO mercadolibre_connections (
        id, seller_id, site_id, nickname,
        access_token_ciphertext, access_token_iv,
        refresh_token_ciphertext, refresh_token_iv,
        token_expires_at, token_updated_at, refresh_owner, refresh_started_at,
        last_verified_at, created_at, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        seller_id = excluded.seller_id,
        site_id = excluded.site_id,
        nickname = excluded.nickname,
        access_token_ciphertext = excluded.access_token_ciphertext,
        access_token_iv = excluded.access_token_iv,
        refresh_token_ciphertext = excluded.refresh_token_ciphertext,
        refresh_token_iv = excluded.refresh_token_iv,
        token_expires_at = excluded.token_expires_at,
        token_updated_at = excluded.token_updated_at,
        refresh_owner = NULL,
        refresh_started_at = NULL,
        last_verified_at = excluded.last_verified_at,
        updated_at = excluded.updated_at
      WHERE ? IS NULL OR mercadolibre_connections.refresh_owner = ?
      RETURNING id`,
    )
    .bind(
      seller.id,
      seller.siteId,
      seller.nickname,
      access.ciphertext,
      access.iv,
      refresh.ciphertext,
      refresh.iv,
      expiresAt,
      now,
      now,
      now,
      now,
      refreshOwner,
      refreshOwner,
    )
    .first<Readonly<{ id: number }>>();
  if (refreshOwner !== null && result === null) {
    throw new HttpError(
      503,
      'MERCADO_LIBRE_TOKEN_REFRESH_LOST',
      'La renovación de Mercado Libre perdió la exclusión y debe reintentarse.',
    );
  }
}

async function readConnection(database: D1Database): Promise<ConnectionRow | null> {
  return database
    .prepare(
      `SELECT seller_id, site_id, nickname,
              access_token_ciphertext, access_token_iv,
              refresh_token_ciphertext, refresh_token_iv,
              token_expires_at, token_updated_at, refresh_owner, refresh_started_at,
              last_verified_at, updated_at
       FROM mercadolibre_connections WHERE id = 1 LIMIT 1`,
    )
    .first<ConnectionRow>();
}

async function decryptConnectionSecret(
  env: Env,
  row: ConnectionRow,
  kind: 'access' | 'refresh',
): Promise<string> {
  const encrypted: EncryptedSecret = kind === 'access'
    ? { ciphertext: row.access_token_ciphertext, iv: row.access_token_iv }
    : { ciphertext: row.refresh_token_ciphertext, iv: row.refresh_token_iv };
  try {
    return await decryptSecret(encrypted, requireEncryptionKey(env));
  } catch {
    throw new HttpError(503, 'MERCADO_LIBRE_TOKEN_DECRYPT_FAILED', 'La sesión de Mercado Libre debe volver a autorizarse.');
  }
}

function parseTokenResponse(value: unknown): OAuthTokenResponse {
  if (!isRecord(value)) throw providerShapeError();
  const accessToken = safeProviderText(value.access_token, 4096);
  const refreshToken = safeProviderText(value.refresh_token, 4096);
  const userId = stringIdentifier(value.user_id);
  const expiresIn = value.expires_in;
  if (
    accessToken === null || accessToken.length < 20 ||
    refreshToken === null || refreshToken.length < 20 ||
    userId === null ||
    typeof expiresIn !== 'number' || !Number.isSafeInteger(expiresIn) ||
    expiresIn < 60 || expiresIn > 31_536_000
  ) {
    throw providerShapeError();
  }
  return Object.freeze({ accessToken, refreshToken, expiresIn, userId });
}

function providerShapeError(): HttpError {
  return new HttpError(502, 'MERCADO_LIBRE_RESPONSE_INVALID', 'Mercado Libre devolvió una respuesta no válida.');
}

async function readProviderJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length > 2_000_000) throw providerShapeError();
  try {
    return text === '' ? null : JSON.parse(text) as unknown;
  } catch {
    throw providerShapeError();
  }
}

function stringIdentifier(value: unknown): string | null {
  const normalized = typeof value === 'number' && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === 'string'
      ? value.trim()
      : '';
  return /^\d{1,30}$/u.test(normalized) ? normalized : null;
}

function safeProviderText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized !== '' && normalized.length <= maximum ? normalized : null;
}

function retryDelay(headers: Headers, attempt: number): number {
  const retryAfter = headers.get('retry-after');
  if (retryAfter !== null && /^\d{1,3}$/u.test(retryAfter)) {
    return Math.min(Number(retryAfter) * 1_000, 5_000);
  }
  return 250 * (2 ** attempt);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
