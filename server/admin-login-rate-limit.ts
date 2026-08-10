import { hmacSha256Hex } from './crypto';
import { HttpError, requireDatabase, requireSecret } from './http';
import type { D1Database, Env } from './platform';

const WINDOW_SECONDS = 15 * 60;
const BLOCK_SECONDS = 15 * 60;
const RETENTION_SECONDS = 24 * 60 * 60;
const IP_ATTEMPT_LIMIT = 8;
const USER_ATTEMPT_LIMIT = 20;

type RateLimitRow = Readonly<{
  attempt_count: number;
  blocked_until: number;
}>;

export async function consumeAdminLoginAttempt(
  request: Request,
  username: string,
  env: Env,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<void> {
  const database = requireDatabase(env);
  const secret = rateLimitSecret(env);
  try {
    const [ipScope, userScope] = await scopeKeys(request, username, secret);

    await database
      .prepare('DELETE FROM admin_login_rate_limits WHERE updated_at < ?')
      .bind(nowSeconds - RETENTION_SECONDS)
      .run();

    const ipResult = await consumeScope(
      database,
      ipScope,
      IP_ATTEMPT_LIMIT,
      nowSeconds,
    );
    const userResult = await consumeScope(
      database,
      userScope,
      USER_ATTEMPT_LIMIT,
      nowSeconds,
    );
    if (
      ipResult.blocked_until > nowSeconds ||
      userResult.blocked_until > nowSeconds
    ) {
      throw new HttpError(
        429,
        'ADMIN_LOGIN_RATE_LIMITED',
        'No se pudo completar el acceso. Intentá nuevamente más tarde.',
      );
    }
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error;
    throw rateLimitUnavailable();
  }
}

export async function clearAdminLoginAttempts(
  request: Request,
  username: string,
  env: Env,
): Promise<void> {
  const database = requireDatabase(env);
  const secret = rateLimitSecret(env);
  try {
    const [ipScope, userScope] = await scopeKeys(request, username, secret);
    await database
      .prepare(
        'DELETE FROM admin_login_rate_limits WHERE scope_key IN (?, ?)',
      )
      .bind(ipScope, userScope)
      .run();
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error;
    throw rateLimitUnavailable();
  }
}

async function consumeScope(
  database: D1Database,
  scopeKey: string,
  attemptLimit: number,
  nowSeconds: number,
): Promise<RateLimitRow> {
  const result = await database
    .prepare(
      `INSERT INTO admin_login_rate_limits (
        scope_key, window_started_at, attempt_count, blocked_until, updated_at
      ) VALUES (?, ?, 1, 0, ?)
      ON CONFLICT(scope_key) DO UPDATE SET
        window_started_at = CASE
          WHEN admin_login_rate_limits.window_started_at <= excluded.updated_at - ?
            THEN excluded.updated_at
          ELSE admin_login_rate_limits.window_started_at
        END,
        attempt_count = CASE
          WHEN admin_login_rate_limits.window_started_at <= excluded.updated_at - ?
            THEN 1
          ELSE admin_login_rate_limits.attempt_count + 1
        END,
        blocked_until = CASE
          WHEN admin_login_rate_limits.window_started_at <= excluded.updated_at - ?
            THEN 0
          WHEN admin_login_rate_limits.blocked_until > excluded.updated_at
            THEN admin_login_rate_limits.blocked_until
          WHEN admin_login_rate_limits.attempt_count + 1 > ?
            THEN excluded.updated_at + ?
          ELSE 0
        END,
        updated_at = excluded.updated_at
      RETURNING attempt_count, blocked_until`,
    )
    .bind(
      scopeKey,
      nowSeconds,
      nowSeconds,
      WINDOW_SECONDS,
      WINDOW_SECONDS,
      WINDOW_SECONDS,
      attemptLimit,
      BLOCK_SECONDS,
    )
    .first<RateLimitRow>();
  if (
    result === null ||
    !Number.isSafeInteger(result.attempt_count) ||
    !Number.isSafeInteger(result.blocked_until)
  ) {
    throw new HttpError(
      503,
      'ADMIN_RATE_LIMIT_UNAVAILABLE',
      'No se pudo verificar el límite de acceso.',
    );
  }
  return result;
}

async function scopeKeys(
  request: Request,
  username: string,
  secret: string,
): Promise<readonly [string, string]> {
  const clientIp = normalizedClientIp(request);
  const [ipDigest, userDigest] = await Promise.all([
    hmacSha256Hex(secret, `admin-login-ip\n${clientIp}`),
    hmacSha256Hex(secret, `admin-login-user\n${username}`),
  ]);
  return [`ip:${ipDigest}`, `user:${userDigest}`];
}

function normalizedClientIp(request: Request): string {
  const candidate = request.headers.get('cf-connecting-ip')?.trim();
  if (
    candidate !== undefined &&
    candidate.length >= 2 &&
    candidate.length <= 64 &&
    /^[0-9a-f:.]+$/iu.test(candidate)
  ) {
    return candidate.toLocaleLowerCase('en');
  }
  return 'unavailable';
}

function rateLimitSecret(env: Env): string {
  return requireSecret(
    env.ADMIN_RATE_LIMIT_SECRET,
    'ADMIN_RATE_LIMIT_CONFIG_MISSING',
    'El límite de acceso administrativo no está configurado.',
  );
}

function rateLimitUnavailable(): HttpError {
  return new HttpError(
    503,
    'ADMIN_RATE_LIMIT_UNAVAILABLE',
    'No se pudo verificar el límite de acceso.',
  );
}
