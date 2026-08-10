import type { PagesFunctionContext } from '../../server/platform';
import { CATALOG_IMAGE_CACHE_CONTROL } from '../../server/catalog-images';
import { onRequest } from './_middleware';

describe('headers comunes de API', () => {
  it('preserva el cache inmutable explícito de una imagen administrada', async () => {
    const response = await onRequest(context(
      '/api/catalog-images/123e4567-e89b-42d3-a456-426614174000.png',
      new Response('imagen', {
        headers: { 'cache-control': CATALOG_IMAGE_CACHE_CONTROL },
      }),
    ));

    expect(response.headers.get('cache-control')).toBe(CATALOG_IMAGE_CACHE_CONTROL);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('mantiene no-store para errores de imagen y para el resto de las APIs', async () => {
    const missingImage = await onRequest(context(
      '/api/catalog-images/123e4567-e89b-42d3-a456-426614174000.png',
      new Response('missing', { status: 404 }),
    ));
    const catalog = await onRequest(context(
      '/api/catalog',
      new Response('{}', { headers: { 'cache-control': 'public, max-age=60' } }),
    ));

    expect(missingImage.headers.get('cache-control')).toBe('no-store');
    expect(catalog.headers.get('cache-control')).toBe('no-store');
  });
});

function context(path: string, response: Response): PagesFunctionContext {
  return {
    request: new Request(`https://example.test${path}`),
    env: {},
    params: {},
    data: {},
    next: () => Promise.resolve(response),
    waitUntil: () => undefined,
  };
}
