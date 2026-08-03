import type { PagesFunctionContext } from '../../../server/platform';
import { onRequest } from './preferences';

function context(request: Request): PagesFunctionContext {
  return {
    request,
    env: {},
    params: {},
    data: {},
    functionPath: '/api/checkout/preferences',
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}

describe('endpoint de checkout', () => {
  it('acepta sólo POST y falla cerrado sin flag de comercio', async () => {
    const getResponse = await onRequest(context(new Request(
      'https://example.test/api/checkout/preferences',
      { method: 'GET' },
    )));
    expect(getResponse.status).toBe(405);
    expect(getResponse.headers.get('allow')).toBe('POST');

    const postResponse = await onRequest(context(new Request(
      'https://example.test/api/checkout/preferences',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://example.test',
        },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), items: [] }),
      },
    )));
    expect(postResponse.status).toBe(503);
    await expect(postResponse.json()).resolves.toMatchObject({
      error: { code: 'COMMERCE_DISABLED' },
    });
  });
});
