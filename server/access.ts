import { decodeBase64Url, toArrayBuffer } from './crypto';
import { HttpError, requireText } from './http';
import type { AdminIdentity, Env } from './platform';
import { isRecord } from './validation';

type AccessJsonWebKey = JsonWebKey & Readonly<{ kid?: string }>;
type AccessClaims = Readonly<{
  aud: string | readonly string[];
  email: string;
  exp: number;
  iss: string;
  nbf?: number;
  sub: string;
}>;

let jwksCache:
  | Readonly<{ endpoint: string; expiresAt: number; keys: readonly AccessJsonWebKey[] }>
  | undefined;

export async function verifyCloudflareAccess(
  request: Request,
  env: Env,
): Promise<AdminIdentity> {
  const token = request.headers.get('cf-access-jwt-assertion');
  if (token === null || token.trim() === '' || token.length > 16_384) {
    throw new HttpError(401, 'ACCESS_TOKEN_MISSING', 'Falta la identidad de Cloudflare Access.');
  }
  const teamDomain = normalizeTeamDomain(
    requireText(
      env.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
      'ACCESS_CONFIG_MISSING',
      'Cloudflare Access no está configurado.',
    ),
  );
  const audience = requireText(
    env.CLOUDFLARE_ACCESS_AUD,
    'ACCESS_CONFIG_MISSING',
    'La audiencia de Cloudflare Access no está configurada.',
  );
  if (audience.length > 512) {
    throw new HttpError(503, 'ACCESS_CONFIG_INVALID', 'La audiencia de Cloudflare Access no es válida.');
  }
  const segments = token.split('.');
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0 || segment.length > 8192)) {
    throw accessInvalid();
  }
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  if (
    encodedHeader === undefined ||
    encodedPayload === undefined ||
    encodedSignature === undefined
  ) {
    throw accessInvalid();
  }
  const header = parseJwtPart(encodedHeader);
  const claims = parseClaims(parseJwtPart(encodedPayload));
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 512) {
    throw new HttpError(401, 'ACCESS_TOKEN_INVALID', 'El algoritmo de identidad no está autorizado.');
  }
  const now = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://${teamDomain}`;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    claims.iss.replace(/\/+$/u, '') !== expectedIssuer ||
    !audiences.includes(audience) ||
    claims.exp <= now ||
    (claims.nbf !== undefined && claims.nbf > now + 30)
  ) {
    throw new HttpError(401, 'ACCESS_TOKEN_REJECTED', 'La identidad administrativa expiró o no corresponde a esta aplicación.');
  }
  const jwks = await getAccessJwks(teamDomain);
  const jwk = jwks.find((candidate) => candidate.kid === header.kid);
  if (jwk === undefined) {
    throw new HttpError(401, 'ACCESS_KEY_UNKNOWN', 'No se encontró la clave de Cloudflare Access.');
  }
  if (
    jwk.kty !== 'RSA' ||
    (jwk.use !== undefined && jwk.use !== 'sig') ||
    (jwk.alg !== undefined && jwk.alg !== 'RS256')
  ) {
    throw accessInvalid();
  }
  let verified: boolean;
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    verified = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      toArrayBuffer(decodeBase64Url(encodedSignature)),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
  } catch {
    throw accessInvalid();
  }
  if (!verified) throw accessInvalid();
  return Object.freeze({ sub: claims.sub.trim(), email: claims.email.trim() });
}

function normalizeTeamDomain(value: string): string {
  const withoutProtocol = value.replace(/^https?:\/\//iu, '').replace(/\/+$/u, '');
  if (!/^[a-z0-9.-]+\.cloudflareaccess\.com$/iu.test(withoutProtocol)) {
    throw new HttpError(503, 'ACCESS_CONFIG_INVALID', 'El dominio de Cloudflare Access no es válido.');
  }
  return withoutProtocol.toLocaleLowerCase('en');
}

async function getAccessJwks(teamDomain: string): Promise<readonly AccessJsonWebKey[]> {
  const endpoint = `https://${teamDomain}/cdn-cgi/access/certs`;
  const now = Date.now();
  if (jwksCache !== undefined && jwksCache.endpoint === endpoint && jwksCache.expiresAt > now) {
    return jwksCache.keys;
  }
  let response: Response;
  try {
    response = await fetch(endpoint, { signal: AbortSignal.timeout(8_000) });
  } catch {
    throw new HttpError(503, 'ACCESS_KEYS_UNAVAILABLE', 'No se pudieron obtener las claves de Cloudflare Access.');
  }
  if (!response.ok) {
    throw new HttpError(503, 'ACCESS_KEYS_UNAVAILABLE', 'No se pudieron obtener las claves de Cloudflare Access.');
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new HttpError(503, 'ACCESS_KEYS_INVALID', 'Las claves de Cloudflare Access no son válidas.');
  }
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.keys) ||
    payload.keys.length < 1 ||
    payload.keys.length > 20 ||
    !payload.keys.every(isRecord)
  ) {
    throw new HttpError(503, 'ACCESS_KEYS_INVALID', 'Las claves de Cloudflare Access no son válidas.');
  }
  const keys = Object.freeze(payload.keys as unknown as readonly AccessJsonWebKey[]);
  jwksCache = Object.freeze({ endpoint, expiresAt: now + 5 * 60 * 1000, keys });
  return keys;
}

function parseJwtPart(encoded: string): Record<string, unknown> {
  try {
    const decoded = new TextDecoder().decode(decodeBase64Url(encoded));
    const value: unknown = JSON.parse(decoded);
    if (isRecord(value)) return value;
  } catch {
    // Error uniforme para no filtrar detalles criptográficos.
  }
  throw accessInvalid();
}

function parseClaims(value: Record<string, unknown>): AccessClaims {
  const validAudience =
    (typeof value.aud === 'string' && value.aud.trim() !== '' && value.aud.length <= 512) ||
    (Array.isArray(value.aud) &&
      value.aud.length > 0 &&
      value.aud.length <= 10 &&
      value.aud.every(
        (item) => typeof item === 'string' && item.trim() !== '' && item.length <= 512,
      ));
  if (
    !validAudience ||
    typeof value.email !== 'string' ||
    value.email.trim() === '' ||
    value.email.length > 320 ||
    !/^[^\s@]+@[^\s@]+$/u.test(value.email) ||
    typeof value.exp !== 'number' ||
    !Number.isSafeInteger(value.exp) ||
    typeof value.iss !== 'string' ||
    value.iss.length > 512 ||
    typeof value.sub !== 'string' ||
    value.sub.trim() === '' ||
    value.sub.length > 512 ||
    (value.nbf !== undefined &&
      (typeof value.nbf !== 'number' || !Number.isSafeInteger(value.nbf)))
  ) {
    throw accessInvalid();
  }
  return Object.freeze({
    aud: value.aud as string | readonly string[],
    email: value.email,
    exp: value.exp,
    iss: value.iss,
    ...(value.nbf === undefined ? {} : { nbf: value.nbf }),
    sub: value.sub,
  });
}

function accessInvalid(): HttpError {
  return new HttpError(401, 'ACCESS_TOKEN_INVALID', 'La identidad administrativa no es válida.');
}
