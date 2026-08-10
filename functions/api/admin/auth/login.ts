import {
  createAdminSessionCookie,
  verifyAdminCredentials,
} from '../../../../server/admin-auth';
import {
  clearAdminLoginAttempts,
  consumeAdminLoginAttempt,
} from '../../../../server/admin-login-rate-limit';
import {
  HttpError,
  jsonResponse,
  methodNotAllowedResponse,
  responseFromError,
} from '../../../../server/http';
import type { PagesFunction } from '../../../../server/platform';
import {
  assertExactKeys,
  assertSameOrigin,
  isRecord,
  readJsonBody,
} from '../../../../server/validation';

const MAXIMUM_LOGIN_BODY_BYTES = 2_048;

export const onRequest: PagesFunction = async ({ env, request }) => {
  if (request.method !== 'POST') return methodNotAllowedResponse(['POST']);
  try {
    assertSameOrigin(request, env);
    assertIdentityContentEncoding(request);
    const body = await readJsonBody(request, MAXIMUM_LOGIN_BODY_BYTES);
    const credentials = parseCredentials(body);
    await consumeAdminLoginAttempt(request, credentials.username, env);
    const identity = await verifyAdminCredentials(
      credentials.username,
      credentials.password,
      env,
    );
    await clearAdminLoginAttempts(request, credentials.username, env);
    return jsonResponse(
      {
        authenticated: true,
        identity: { label: 'Administrador', source: identity.authMethod },
      },
      200,
      { 'set-cookie': await createAdminSessionCookie(identity, env) },
    );
  } catch (error: unknown) {
    return responseFromError(error);
  }
};

function parseCredentials(value: unknown): Readonly<{
  username: string;
  password: string;
}> {
  if (!isRecord(value)) throw invalidLoginRequest();
  assertExactKeys(
    value,
    ['username', 'password'],
    'INVALID_LOGIN_REQUEST',
    'La solicitud de acceso no es válida.',
  );
  if (Object.keys(value).length !== 2) throw invalidLoginRequest();
  const username = value.username;
  const password = value.password;
  if (
    typeof username !== 'string' ||
    username.length < 1 ||
    username.length > 64 ||
    username.trim() !== username ||
    containsForbiddenControl(username, true) ||
    typeof password !== 'string' ||
    password.length < 1 ||
    new TextEncoder().encode(password).byteLength > 1_024 ||
    containsForbiddenControl(password, false)
  ) {
    throw invalidLoginRequest();
  }
  return Object.freeze({ username, password });
}

function containsForbiddenControl(value: string, allControls: boolean): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === 0 ||
      codePoint === 0x0a ||
      codePoint === 0x0d ||
      (allControls && codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f))
    ) {
      return true;
    }
  }
  return false;
}

function assertIdentityContentEncoding(request: Request): void {
  const contentEncoding = request.headers.get('content-encoding');
  if (
    contentEncoding !== null &&
    contentEncoding.trim().toLocaleLowerCase('en') !== 'identity'
  ) {
    throw new HttpError(
      415,
      'UNSUPPORTED_CONTENT_ENCODING',
      'La codificación del body no está permitida.',
    );
  }
}

function invalidLoginRequest(): HttpError {
  return new HttpError(
    400,
    'INVALID_LOGIN_REQUEST',
    'La solicitud de acceso no es válida.',
  );
}
