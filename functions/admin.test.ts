import type { PagesFunctionContext } from '../server/platform';
import { onRequest as adminRoot } from './admin';
import { onRequest as adminPath } from './admin/[[path]]';

describe('entrada HTML del backoffice', () => {
  it.each([
    ['raíz', adminRoot, 'https://example.test/admin'],
    ['subruta', adminPath, 'https://example.test/admin/productos'],
  ] as const)('sirve la SPA sin exigir identidad para mostrar el login: %s', async (
    _label,
    handler,
    url,
  ) => {
    const next = vi.fn(() => Promise.resolve(new Response('<html></html>', {
      headers: { 'content-type': 'text/html', 'cache-control': 'public' },
    })));
    const response = await handler(context(new Request(url), next));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<html></html>');
    expect(next).toHaveBeenCalledWith('/index.html');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('rechaza métodos que no sirven el documento', async () => {
    const response = await adminRoot(context(new Request(
      'https://example.test/admin',
      { method: 'POST' },
    )));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });
});

function context(
  request: Request,
  next: PagesFunctionContext['next'] = () => Promise.resolve(
    new Response(null, { status: 404 }),
  ),
): PagesFunctionContext {
  return {
    request,
    env: {},
    params: {},
    data: {},
    next,
    waitUntil: () => undefined,
  };
}
