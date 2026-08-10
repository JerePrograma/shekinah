import type { PagesFunction } from '../../server/platform';

export const onRequest: PagesFunction = async (context) => {
  const response = await context.next();
  const headers = new Headers(response.headers);
  const isCatalogImage = new URL(context.request.url).pathname.startsWith(
    '/api/catalog-images/',
  );
  if (!isCatalogImage || !headers.has('cache-control')) {
    headers.set('cache-control', 'no-store');
  }
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
