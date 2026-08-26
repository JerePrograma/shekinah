import type { PagesFunctionContext } from '../../../../server/platform';
import { onRequest } from './reconcile';

const secret = 'd'.repeat(40);

function context(method = 'POST', authorization?: string): PagesFunctionContext {
  return {
    request: new Request('https://shekinah.ar/api/internal/dux/reconcile', {
      method,
      headers: authorization === undefined ? {} : { authorization },
    }),
    env: {
      DUX_API_ENABLED: 'false',
      DUX_SCHEDULER_SECRET: secret,
    },
    params: {},
    data: {},
    functionPath: '/api/internal/dux/reconcile',
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
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
});
