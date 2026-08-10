import { verifyCloudflareAccess } from './access';
import {
  decodeBase64Url,
  encodeBase64Url,
  sha256Bytes,
  toArrayBuffer,
} from './crypto';
import { HttpError } from './http';
import type { AdminIdentity, Env } from './platform';
import { isRecord } from './validation';

export const ADMIN_SESSION_COOKIE_NAME = '__Host-shekinah-admin';
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

const PASSWORD_HASH_ALGORITHM = 'pbkdf2-sha256';
const DEFAULT_PBKDF2_ITERATIONS = 300_000;
const MINIMUM_PBKDF2_ITERATIONS = 100_000;
const MAXIMUM_PBKDF2_ITERATIONS = 2_000_000;
const MINIMUM_SALT_BYTES = 16;
const MAXIMUM_SALT_BYTES = 64;
const PASSWORD_HASH_BYTES = 32;
const MINIMUM_SESSION_SECRET_BYTES = 32;
const MAXIMUM_SESSION_SECRET_BYTES = 64;
const MAXIMUM_PASSWORD_BYTES = 1_024;
const MAXIMUM_USERNAME_BYTES = 512;
const MAXIMUM_SESSION_TOKEN_LENGTH = 2_048;
const SESSION_VERSION = 1;
const LOCAL_ADMIN_SUBJECT = 'shekinah-password-admin-v1';
const LOCAL_ADMIN_ACTOR = 'password-admin';
const SESSION_CLOCK_SKEW_SECONDS = 30;
const encoder = new TextEncoder();
const strictDecoder = new TextDecoder('utf-8', { fatal: true });

type PasswordHashParameters = Readonly<{
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
}>;

type AdminSessionPayload = Readonly<{
  v: typeof SESSION_VERSION;
  sub: typeof LOCAL_ADMIN_SUBJECT;
  iat: number;
  exp: number;
}>;

export type AdminPasswordHashOptions = Readonly<{
  iterations?: number;
  salt?: Uint8Array;
}>;

type SubtleCryptoWithTimingSafeEqual = SubtleCrypto &
  Readonly<{
    timingSafeEqual?: (
      left: ArrayBuffer | ArrayBufferView,
      right: ArrayBuffer | ArrayBufferView,
    ) => boolean;
  }>;

export async function generateAdminPasswordHash(
  password: string,
  options: AdminPasswordHashOptions = {},
): Promise<string> {
  const passwordBytes = readPasswordForGeneration(password);
  const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  assertIterationCount(iterations);
  const salt = options.salt === undefined
    ? crypto.getRandomValues(new Uint8Array(32))
    : new Uint8Array(options.salt);
  assertSaltLength(salt);
  const hash = await derivePasswordHash(passwordBytes, salt, iterations);
  return [
    PASSWORD_HASH_ALGORITHM,
    String(iterations),
    encodeBase64Url(salt),
    encodeBase64Url(hash),
  ].join('$');
}

export function generateAdminSessionSecret(byteLength = MINIMUM_SESSION_SECRET_BYTES): string {
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < MINIMUM_SESSION_SECRET_BYTES ||
    byteLength > MAXIMUM_SESSION_SECRET_BYTES
  ) {
    throw new RangeError('La longitud del secreto de sesión no es válida.');
  }
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function verifyAdminCredentials(
  username: string,
  password: string,
  env: Env,
): Promise<AdminIdentity> {
  const configuredUsername = requireConfiguredUsername(env);
  const passwordParameters = parseConfiguredPasswordHash(env.ADMIN_PASSWORD_HASH);
  const usernameBytes = encoder.encode(username);
  const passwordBytes = encoder.encode(password);
  const usernameWithinLimit = usernameBytes.byteLength <= MAXIMUM_USERNAME_BYTES;
  const passwordWithinLimit = passwordBytes.byteLength <= MAXIMUM_PASSWORD_BYTES;
  const candidateUsername = usernameWithinLimit ? usernameBytes : new Uint8Array();
  const candidatePassword = passwordWithinLimit ? passwordBytes : new Uint8Array();

  let candidateHash: Uint8Array;
  try {
    candidateHash = await derivePasswordHash(
      candidatePassword,
      passwordParameters.salt,
      passwordParameters.iterations,
    );
  } catch {
    throw authUnavailable();
  }

  const [candidateUsernameHash, configuredUsernameHash] = await Promise.all([
    sha256Bytes(candidateUsername),
    sha256Bytes(configuredUsername),
  ]);
  const usernameMatches = timingSafeEqual(candidateUsernameHash, configuredUsernameHash);
  const passwordMatches = timingSafeEqual(candidateHash, passwordParameters.hash);
  if (
    !usernameWithinLimit ||
    !passwordWithinLimit ||
    !usernameMatches ||
    !passwordMatches
  ) {
    throw invalidCredentials();
  }
  return localAdminIdentity();
}

export async function createAdminSessionCookie(
  identity: AdminIdentity,
  env: Env,
  nowSeconds = currentEpochSeconds(),
): Promise<string> {
  assertEpochSeconds(nowSeconds);
  requireConfiguredUsername(env);
  if (
    identity.authMethod !== 'password' ||
    identity.sub !== LOCAL_ADMIN_SUBJECT ||
    identity.actor !== LOCAL_ADMIN_ACTOR
  ) {
    throw new HttpError(
      500,
      'ADMIN_IDENTITY_INVALID',
      'No se pudo crear la sesión administrativa.',
      false,
    );
  }
  const secret = parseConfiguredSessionSecret(env.ADMIN_SESSION_SECRET);
  const payload: AdminSessionPayload = Object.freeze({
    v: SESSION_VERSION,
    sub: LOCAL_ADMIN_SUBJECT,
    iat: nowSeconds,
    exp: nowSeconds + ADMIN_SESSION_TTL_SECONDS,
  });
  const encodedPayload = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await signSessionValue(secret, encodedPayload);
  return [
    `${ADMIN_SESSION_COOKIE_NAME}=${encodedPayload}.${encodeBase64Url(signature)}`,
    'Path=/',
    `Max-Age=${ADMIN_SESSION_TTL_SECONDS}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}

export function createAdminLogoutCookie(): string {
  return [
    `${ADMIN_SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}

export async function verifyAdminSession(
  request: Request,
  env: Env,
  nowSeconds = currentEpochSeconds(),
): Promise<AdminIdentity> {
  assertEpochSeconds(nowSeconds);
  const values = readAdminCookieValues(request);
  if (values.length === 0) {
    throw new HttpError(401, 'ADMIN_SESSION_MISSING', 'Falta la sesión administrativa.');
  }
  if (values.length !== 1) throw invalidSession();
  const token = values[0];
  if (token === undefined || token.length === 0 || token.length > MAXIMUM_SESSION_TOKEN_LENGTH) {
    throw invalidSession();
  }
  const segments = token.split('.');
  if (segments.length !== 2) throw invalidSession();
  const [encodedPayload, encodedSignature] = segments;
  if (encodedPayload === undefined || encodedSignature === undefined) throw invalidSession();
  let signature: Uint8Array;
  try {
    signature = decodeCanonicalBase64Url(
      encodedSignature,
      PASSWORD_HASH_BYTES,
      PASSWORD_HASH_BYTES,
    );
  } catch {
    throw invalidSession();
  }
  const secret = parseConfiguredSessionSecret(env.ADMIN_SESSION_SECRET);
  let verified: boolean;
  try {
    verified = await verifySessionSignature(secret, encodedPayload, signature);
  } catch {
    throw authUnavailable();
  }
  if (!verified) throw invalidSession();
  const payload = parseSessionPayload(encodedPayload);
  if (
    payload.exp <= nowSeconds ||
    payload.iat > nowSeconds + SESSION_CLOCK_SKEW_SECONDS ||
    payload.exp - payload.iat !== ADMIN_SESSION_TTL_SECONDS
  ) {
    throw invalidSession();
  }
  requireConfiguredUsername(env);
  return localAdminIdentity();
}

export async function authenticateAdminRequest(
  request: Request,
  env: Env,
  nowSeconds = currentEpochSeconds(),
): Promise<AdminIdentity> {
  if (readAdminCookieValues(request).length > 0) {
    return verifyAdminSession(request, env, nowSeconds);
  }
  return verifyCloudflareAccess(request, env);
}

function requireConfiguredUsername(env: Env): string {
  const value = env.ADMIN_USERNAME;
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    encoder.encode(value).byteLength > MAXIMUM_USERNAME_BYTES ||
    containsControlCharacter(value)
  ) {
    throw invalidAuthConfig();
  }
  return value;
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true;
  }
  return false;
}

function parseConfiguredPasswordHash(value: string | undefined): PasswordHashParameters {
  if (typeof value !== 'string' || value.length > 1_024) throw invalidAuthConfig();
  const segments = value.split('$');
  if (segments.length !== 4) throw invalidAuthConfig();
  const [algorithm, encodedIterations, encodedSalt, encodedHash] = segments;
  if (
    algorithm !== PASSWORD_HASH_ALGORITHM ||
    encodedIterations === undefined ||
    !/^(?:0|[1-9][0-9]*)$/u.test(encodedIterations)
  ) {
    throw invalidAuthConfig();
  }
  const iterations = Number(encodedIterations);
  try {
    assertIterationCount(iterations);
  } catch {
    throw invalidAuthConfig();
  }
  if (encodedSalt === undefined || encodedHash === undefined) throw invalidAuthConfig();
  let salt: Uint8Array;
  let hash: Uint8Array;
  try {
    salt = decodeCanonicalBase64Url(encodedSalt, MINIMUM_SALT_BYTES, MAXIMUM_SALT_BYTES);
    hash = decodeCanonicalBase64Url(encodedHash, PASSWORD_HASH_BYTES, PASSWORD_HASH_BYTES);
  } catch {
    throw invalidAuthConfig();
  }
  return Object.freeze({ iterations, salt, hash });
}

function parseConfiguredSessionSecret(value: string | undefined): Uint8Array {
  if (typeof value !== 'string' || value.length > 256) throw invalidAuthConfig();
  try {
    return decodeCanonicalBase64Url(
      value,
      MINIMUM_SESSION_SECRET_BYTES,
      MAXIMUM_SESSION_SECRET_BYTES,
    );
  } catch {
    throw invalidAuthConfig();
  }
}

function parseSessionPayload(encodedPayload: string): AdminSessionPayload {
  let value: unknown;
  try {
    const decoded = decodeCanonicalBase64Url(encodedPayload, 1, 512);
    value = JSON.parse(strictDecoder.decode(decoded)) as unknown;
  } catch {
    throw invalidSession();
  }
  if (!isRecord(value)) throw invalidSession();
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'exp,iat,sub,v') throw invalidSession();
  if (
    value.v !== SESSION_VERSION ||
    value.sub !== LOCAL_ADMIN_SUBJECT ||
    typeof value.iat !== 'number' ||
    !Number.isSafeInteger(value.iat) ||
    value.iat < 0 ||
    typeof value.exp !== 'number' ||
    !Number.isSafeInteger(value.exp) ||
    value.exp < 0
  ) {
    throw invalidSession();
  }
  return Object.freeze({
    v: SESSION_VERSION,
    sub: LOCAL_ADMIN_SUBJECT,
    iat: value.iat,
    exp: value.exp,
  });
}

function readAdminCookieValues(request: Request): readonly string[] {
  const header = request.headers.get('cookie');
  if (header === null || header === '') return Object.freeze([]);
  const values: string[] = [];
  for (const part of header.split(';')) {
    const candidate = part.trim();
    const separator = candidate.indexOf('=');
    const name = separator === -1 ? candidate : candidate.slice(0, separator).trim();
    if (name !== ADMIN_SESSION_COOKIE_NAME) continue;
    values.push(separator === -1 ? '' : candidate.slice(separator + 1));
  }
  return Object.freeze(values);
}

async function derivePasswordHash(
  passwordBytes: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(passwordBytes),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return new Uint8Array(await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      salt: toArrayBuffer(salt),
    },
    material,
    PASSWORD_HASH_BYTES * 8,
  ));
}

async function signSessionValue(secret: Uint8Array, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function verifySessionSignature(
  secret: Uint8Array,
  value: string,
  signature: Uint8Array,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    toArrayBuffer(signature),
    encoder.encode(value),
  );
}

function decodeCanonicalBase64Url(
  value: string,
  minimumBytes: number,
  maximumBytes: number,
): Uint8Array {
  if (value.length === 0 || value.length > maximumBytes * 2) {
    throw new RangeError('Base64url fuera de rango.');
  }
  let decoded: Uint8Array;
  try {
    decoded = decodeBase64Url(value);
  } catch {
    throw new RangeError('Base64url inválido.');
  }
  if (
    decoded.byteLength < minimumBytes ||
    decoded.byteLength > maximumBytes ||
    encodeBase64Url(decoded) !== value
  ) {
    throw new RangeError('Base64url no canónico.');
  }
  return decoded;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const subtle = crypto.subtle as SubtleCryptoWithTimingSafeEqual;
  if (typeof subtle.timingSafeEqual === 'function') {
    return subtle.timingSafeEqual(left, right);
  }
  const maximum = Math.max(left.byteLength, right.byteLength);
  let difference = left.byteLength ^ right.byteLength;
  for (let index = 0; index < maximum; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function localAdminIdentity(): AdminIdentity {
  return Object.freeze({
    sub: LOCAL_ADMIN_SUBJECT,
    actor: LOCAL_ADMIN_ACTOR,
    authMethod: 'password',
  });
}

function readPasswordForGeneration(password: string): Uint8Array {
  if (typeof password !== 'string') throw new TypeError('La contraseña debe ser texto.');
  const bytes = encoder.encode(password);
  if (bytes.byteLength < 1 || bytes.byteLength > MAXIMUM_PASSWORD_BYTES) {
    throw new RangeError('La longitud de la contraseña no es válida.');
  }
  return bytes;
}

function assertIterationCount(value: number): void {
  if (
    !Number.isSafeInteger(value) ||
    value < MINIMUM_PBKDF2_ITERATIONS ||
    value > MAXIMUM_PBKDF2_ITERATIONS
  ) {
    throw new RangeError('La cantidad de iteraciones PBKDF2 no es válida.');
  }
}

function assertSaltLength(value: Uint8Array): void {
  if (value.byteLength < MINIMUM_SALT_BYTES || value.byteLength > MAXIMUM_SALT_BYTES) {
    throw new RangeError('La longitud del salt no es válida.');
  }
}

function assertEpochSeconds(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('El instante de sesión no es válido.');
  }
}

function currentEpochSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}

function invalidCredentials(): HttpError {
  return new HttpError(
    401,
    'ADMIN_CREDENTIALS_INVALID',
    'Las credenciales administrativas no son válidas.',
  );
}

function invalidSession(): HttpError {
  return new HttpError(401, 'ADMIN_SESSION_INVALID', 'La sesión administrativa no es válida.');
}

function invalidAuthConfig(): HttpError {
  return new HttpError(
    503,
    'ADMIN_AUTH_CONFIG_INVALID',
    'La autenticación administrativa no está configurada correctamente.',
  );
}

function authUnavailable(): HttpError {
  return new HttpError(
    503,
    'ADMIN_AUTH_UNAVAILABLE',
    'La autenticación administrativa no está disponible.',
  );
}
