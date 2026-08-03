import { recordAdminAudit } from './admin';
import { HttpError, requireDatabase, requestIdFrom, responseFromError } from './http';
import type { AdminContextData, AdminIdentity, D1Database, Env } from './platform';

export async function handleAdminRequest(
  request: Request,
  env: Env,
  data: AdminContextData,
  action: string,
  operation: (database: NonNullable<Env['DB']>) => Promise<Response>,
  target?: Readonly<{ type?: string; id?: string }>,
): Promise<Response> {
  let database: D1Database | undefined;
  let identity: AdminIdentity | undefined;
  const requestId = data.requestId ?? requestIdFrom(request);
  try {
    database = requireDatabase(env);
    identity = requireIdentity(data);
    const response = await operation(database);
    await recordAdminAudit(database, identity, {
      action,
      ...(target?.type === undefined ? {} : { targetType: target.type }),
      ...(target?.id === undefined ? {} : { targetId: target.id }),
      requestId,
      outcomeStatus: response.status,
    });
    return response;
  } catch (error: unknown) {
    if (database === undefined || identity === undefined) {
      return responseFromError(error);
    }
    const status = error instanceof HttpError ? error.status : 500;
    try {
      await recordAdminAudit(database, identity, {
        action,
        ...(target?.type === undefined ? {} : { targetType: target.type }),
        ...(target?.id === undefined ? {} : { targetId: target.id }),
        requestId,
        outcomeStatus: status,
      });
    } catch {
      return responseFromError(
        new HttpError(503, 'ADMIN_AUDIT_UNAVAILABLE', 'No se pudo registrar la auditoría administrativa.'),
      );
    }
    return responseFromError(error);
  }
}

function requireIdentity(data: AdminContextData): AdminIdentity {
  if (data.adminIdentity === undefined) {
    throw new HttpError(401, 'ACCESS_TOKEN_MISSING', 'Falta la identidad administrativa.');
  }
  return data.adminIdentity;
}
