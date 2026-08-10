import { Buffer } from 'node:buffer';

import { CATALOG_IMAGE_CACHE_CONTROL } from '../../../server/catalog-images';
import type { Env, PagesFunctionContext } from '../../../server/platform';
import { MemoryR2Bucket } from '../../../server/test/memory-r2';
import { onRequest } from './[key]';

const publicKey = '123e4567-e89b-42d3-a456-426614174000.png';
const storageKey = `products/${publicKey}`;
const pngBytes = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
));

describe('API pública de imágenes administradas', () => {
  it('sirve GET y HEAD con headers públicos seguros e inmutables', async () => {
    const bucket = new MemoryR2Bucket();
    await bucket.put(storageKey, pngBytes, {
      httpMetadata: { contentType: 'image/png' },
    });

    const getResponse = await onRequest(context('GET', publicKey, bucket));
    expect(getResponse.status).toBe(200);
    expect(new Uint8Array(await getResponse.arrayBuffer())).toEqual(pngBytes);
    expect(getResponse.headers.get('content-type')).toBe('image/png');
    expect(getResponse.headers.get('cache-control')).toBe(CATALOG_IMAGE_CACHE_CONTROL);
    expect(getResponse.headers.get('etag')).toBe(`"test-${pngBytes.byteLength}"`);
    expect(getResponse.headers.get('x-content-type-options')).toBe('nosniff');
    expect(getResponse.headers.get('cross-origin-resource-policy')).toBe('same-origin');

    const headResponse = await onRequest(context('HEAD', publicKey, bucket));
    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get('content-length')).toBe(String(pngBytes.byteLength));
    expect(await headResponse.text()).toBe('');
  });

  it('rechaza traversal y keys que no sean UUID v4 sin consultar R2', async () => {
    const bucket = new MemoryR2Bucket();
    for (const key of ['../secreto.png', '123e4567-e89b-12d3-a456-426614174000.png']) {
      const response = await onRequest(context('GET', key, bucket));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'INVALID_IMAGE_KEY' },
      });
    }
  });

  it('distingue binding ausente, objeto inexistente y método no admitido', async () => {
    const unavailable = await onRequest(context('GET', publicKey));
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toMatchObject({
      error: { code: 'CATALOG_IMAGE_STORAGE_UNAVAILABLE' },
    });

    const bucket = new MemoryR2Bucket();
    const missing = await onRequest(context('GET', publicKey, bucket));
    expect(missing.status).toBe(404);
    const method = await onRequest(context('POST', publicKey, bucket));
    expect(method.status).toBe(405);
    expect(method.headers.get('allow')).toBe('GET, HEAD');
  });
});

function context(
  method: string,
  key: string,
  bucket?: MemoryR2Bucket,
): PagesFunctionContext<Env, 'key'> {
  return {
    request: new Request(`https://example.test/api/catalog-images/${encodeURIComponent(key)}`, {
      method,
    }),
    env: bucket === undefined ? {} : { CATALOG_IMAGES: bucket },
    params: { key },
    data: {},
    next: () => Promise.resolve(new Response(null, { status: 404 })),
    waitUntil: () => undefined,
  };
}
