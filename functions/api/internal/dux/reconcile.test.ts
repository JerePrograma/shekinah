import type {
  D1Database,
  D1PreparedStatement,
  Env,
  PagesFunctionContext,
} from '../../../../server/platform';
import { onRequest } from './reconcile';

const secret = 'd'.repeat(40);

function context(
  method = 'POST',
  authorization?: string,
  envOverrides: Partial<Env> = {},
): PagesFunctionContext {
  return {
    request: new Request('https://shekinah.ar/api/internal/dux/reconcile', {
      method,
      headers: authorization === undefined ? {} : { authorization },
    }),
    env: {
      DUX_API_ENABLED: 'false',
      DUX_SCHEDULER_SECRET: secret,
      ...envOverrides,
    },
    params: {},
    data: {},
    functionPath: '/api/internal/dux/reconcile',
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}

function bootstrapDatabase(pending: boolean): D1Database {
  const statement: D1PreparedStatement = {
    bind() {
      return statement;
    },
    first<T>() {
      return Promise.resolve({ bootstrap_pending: pending ? 1 : 0 } as T);
    },
    all<T>() {
      return Promise.resolve({ success: true, meta: {}, results: [] as T[] });
    },
    run<T>() {
      return Promise.resolve({ success: true, meta: {}, results: [] as T[] });
    },
    raw<T>() {
      return Promise.resolve([] as T[]);
    },
  };
  return {
    prepare: () => statement,
    batch: () => Promise.resolve([]),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  };
}

describe('scheduler read-only de Dux', () => {
  it('acepta sólo POST y exige el secreto dedicado', async () => {
    const method = await onRequest(context('GET'));
    expect(method.status).toBe(405);
    expect(method.headers.get('allow')).toBe('POST');

    const unauthorized = await onRequest(context());
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toMatchObject({
      error: { code: 'SCHEDULER_UNAUTHORIZED' },
    });
  });

  it('informa disabled sin D1 ni llamadas Dux cuando la integración no está habilitada', async () => {
    const response = await onRequest(context('POST', `Bearer ${secret}`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'disabled' });
  });

  it('exige el bootstrap inicial antes de permitir corridas programadas', async () => {
    const response = await onRequest(context('POST', `Bearer ${secret}`, {
      DUX_API_ENABLED: 'true',
      DB: bootstrapDatabase(true),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'DUX_INITIAL_SYNC_REQUIRED',
        message: 'La primera sincronización Dux debe ejecutarse desde el backoffice antes de habilitar el scheduler.',
      },
    });
  });
});
