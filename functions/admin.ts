import { methodNotAllowedResponse } from '../server/http';
import type { PagesFunction } from '../server/platform';

export const onRequest: PagesFunction = async (context) => {
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return methodNotAllowedResponse(['GET', 'HEAD']);
  }
  return noStore(await context.next('/index.html'));
};

function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
